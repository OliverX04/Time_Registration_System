import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"

export const internshipsRouter = express.Router()

internshipsRouter.use(requireAuth)

internshipsRouter.get("/me/status", (req, res) => {
    const account = db.prepare(`
        SELECT role, is_enabled
        FROM user_account
        WHERE id = ?
    `).get(req.user.id)

    if (!account) {
        return res.status(401).send({
            error: "Account not found."
        })
    }

    res.send({
        role: account.role,
        isEnabled: Boolean(account.is_enabled)
    })
})

function requireSupervisor(req, res, next) {
    if (typeof req.user?.id !== "string") {
        return res.status(401).send({ error: "Unauthorized" })
    }
    const user = db.prepare(
        "SELECT role, is_enabled FROM user_account WHERE id = ?"
    ).get(req.user.id)

    if (!user || !user.is_enabled || user.role !== "SUPERVISOR") {
        return res.status(403).send({
            error: "Only active Supervisors can manage internships."
        })
    }

    next()
}

// PUT selects the current project; ending closes the record instead of deleting it.
internshipsRouter.put("/:internId/project-assignment", requireSupervisor, (req, res) => {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : ""
    if (!projectId) {
        return res.status(400).send({ error: "Please choose a project." })
    }

    const result = changeProjectAssignment(req.params.internId, projectId)
    res.status(result.status).send(result.body)
})

internshipsRouter.post("/:internId/project-assignment/end", requireSupervisor, (req, res) => {
    const result = changeProjectAssignment(req.params.internId, null)
    res.status(result.status).send(result.body)
})

function changeProjectAssignment(internId, projectId) {
    return db.transaction(() => {
        const intern = db.prepare("SELECT role, is_enabled FROM user_account WHERE id = ?").get(internId)
        if (!intern || intern.role !== "INTERN") {
            return { status: 404, body: { error: "Intern not found." } }
        }
        const internships = db.prepare("SELECT id FROM internship WHERE intern_id = ? AND ended_at IS NULL").all(internId)
        if (!intern.is_enabled || internships.length !== 1) {
            return { status: 409, body: { error: "Intern must have exactly one active internship and an enabled account." } }
        }
        const internshipId = internships[0].id
        if (projectId !== null) {
            const project = db.prepare("SELECT archived_at FROM project WHERE id = ?").get(projectId)
            if (!project) return { status: 404, body: { error: "Project not found." } }
            if (project.archived_at !== null) {
                return { status: 409, body: { error: "Archived projects cannot receive assignments." } }
            }
        }
        const current = db.prepare("SELECT * FROM project_assignment WHERE internship_id = ? AND ended_at IS NULL").get(internshipId)
        if (current?.project_id === projectId || (!current && projectId === null)) {
            return { status: 200, body: { message: "Project assignment is already up to date." } }
        }
        const openTimer = db.prepare(`
            SELECT 1 FROM task_time_entry tte
            JOIN task_assignment ta ON ta.id = tte.task_assignment_id
            WHERE ta.internship_id = ? AND tte.ended_at IS NULL
        `).get(internshipId)
        if (openTimer) {
            return { status: 409, body: { error: "Finish open task time sessions before changing the project assignment." } }
        }
        const now = new Date().toISOString()
        if (current) {
            db.prepare("UPDATE project_assignment SET ended_at = ? WHERE id = ?").run(now, current.id)
            db.prepare(`
                UPDATE task_assignment SET ended_at = ?
                WHERE internship_id = ? AND ended_at IS NULL
                    AND task_id IN (SELECT id FROM task WHERE project_id = ?)
            `).run(now, internshipId, current.project_id)
        }
        if (projectId !== null) {
            db.prepare("INSERT INTO project_assignment (internship_id, project_id, assigned_at) VALUES (?, ?, ?)")
                .run(internshipId, projectId, now)
        }
        return { status: current || projectId === null ? 200 : 201, body: { message: "Project assignment updated successfully." } }
    }).immediate()
}


internshipsRouter.get("/", requireSupervisor, (req, res) => {
    const interns = db.prepare(`
        SELECT
            u.id,
            u.first_name AS firstName,
            u.last_name AS lastName,
            u.email,
            u.is_enabled AS isEnabled,
            i.id AS internshipId,
            i.started_at AS startedAt,
            p.id AS currentProjectId,
            p.name AS currentProjectName
        FROM user_account u
        LEFT JOIN internship i
            ON i.intern_id = u.id
            AND i.ended_at IS NULL
        LEFT JOIN project_assignment pa
            ON pa.internship_id = i.id
            AND pa.ended_at IS NULL
        LEFT JOIN project p ON p.id = pa.project_id
        WHERE u.role = 'INTERN'
        ORDER BY u.first_name, u.last_name
    `).all()

    res.send({ interns })
})

internshipsRouter.post("/:internId/activate", requireSupervisor, (req, res) => {
    const result = db.transaction(() => {
        const intern = db.prepare(`
            SELECT id, role
            FROM user_account
            WHERE id = ?
        `).get(req.params.internId)

        if (!intern || intern.role !== "INTERN") {
            return {
                status: 404,
                body: { error: "Intern not found." }
            }
        }

        const activeInternship = db.prepare(`
            SELECT id
            FROM internship
            WHERE intern_id = ? AND ended_at IS NULL
        `).get(intern.id)

        if (activeInternship) {
            return {
                status: 409,
                body: { error: "Intern already has an active internship." }
            }
        }

        db.prepare(`
            INSERT INTO internship (intern_id, started_at)
            VALUES (?, ?)
        `).run(intern.id, new Date().toISOString())

        db.prepare(`
            UPDATE user_account
            SET is_enabled = 1
            WHERE id = ?
        `).run(intern.id)

        return {
            status: 201,
            body: { message: "Intern activated successfully." }
        }
    }).immediate()

    res.status(result.status).send(result.body)
})

function hasOpenTimeSessions(internshipId) {
    const attendance = db.prepare(`
        SELECT id
        FROM attendance_session
        WHERE internship_id = ?
          AND checked_out_at IS NULL
        LIMIT 1
    `).get(internshipId)

    const taskTime = db.prepare(`
        SELECT tte.id
        FROM task_time_entry tte
        JOIN task_assignment ta
            ON tte.task_assignment_id = ta.id
        WHERE ta.internship_id = ?
          AND tte.ended_at IS NULL
        LIMIT 1
    `).get(internshipId)

    return Boolean(attendance || taskTime)
}

internshipsRouter.post("/:internId/deactivate", requireSupervisor, (req, res) => {
    const result = db.transaction(() => {
        const internship = db.prepare(`
            SELECT i.id
            FROM internship i
            JOIN user_account u ON u.id = i.intern_id
            WHERE u.id = ?
              AND u.role = 'INTERN'
              AND i.ended_at IS NULL
        `).get(req.params.internId)

        if (!internship) {
            return {
                status: 409,
                body: { error: "No active internship found." }
            }
        }

        if (hasOpenTimeSessions(internship.id)) {
            return {
                status: 409,
                body: {
                    error: "Cannot deactivate an intern with unfinished time sessions."
                }
            }
        }

        const outcome = req.body?.outcome

        if (!["COMPLETED", "DISCONTINUED"].includes(outcome)) {
            return {
                status: 400,
                body: { error: "Choose COMPLETED or DISCONTINUED." }
            }
        }

        const endedAt = new Date().toISOString()

        db.prepare(`
            UPDATE project_assignment
            SET ended_at = ?
            WHERE internship_id = ?
              AND ended_at IS NULL
        `).run(endedAt, internship.id)

        db.prepare(`
            UPDATE task_assignment
            SET ended_at = ?
            WHERE internship_id = ?
              AND ended_at IS NULL
        `).run(endedAt, internship.id)

        db.prepare(`
            UPDATE internship
            SET ended_at = ?, outcome = ?
            WHERE id = ?
        `).run(endedAt, outcome, internship.id)

        db.prepare(`
            UPDATE user_account
            SET is_enabled = 0
            WHERE id = ?
        `).run(req.params.internId)

        return {
            status: 200,
            body: { message: "Intern deactivated successfully." }
        }
    }).immediate()

    res.status(result.status).send(result.body)
})
