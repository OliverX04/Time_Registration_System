import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"

const MAX_FUTURE_END_MS = 24 * 60 * 60 * 1000

export const taskTimeRouter = express.Router()

taskTimeRouter.use(requireAuth)

taskTimeRouter.get("/assignments", requireIntern, (req, res) => {
    res.send({ assignments: findActiveAssignments(req.user.id) })
})

taskTimeRouter.post("/assignments", requireIntern, (req, res) => {
    const taskId = typeof req.body?.taskId === "string" ? req.body.taskId.trim() : ""

    if (!taskId) {
        return res.status(400).send({
            error: "Please choose a task.",
            fieldErrors: { taskId: "Task is required." }
        })
    }

    const result = db.transaction(() => {
        const context = db.prepare(`
            SELECT internship.id AS internshipId, project_assignment.project_id AS projectId
            FROM internship
            JOIN project_assignment
                ON project_assignment.internship_id = internship.id
                AND project_assignment.ended_at IS NULL
            JOIN project
                ON project.id = project_assignment.project_id
                AND project.archived_at IS NULL
            WHERE internship.intern_id = ? AND internship.ended_at IS NULL
        `).get(req.user.id)

        if (!context) {
            return { status: 409, body: { error: "You need an active project before joining a task." } }
        }

        const task = db.prepare("SELECT id FROM task WHERE id = ? AND project_id = ?").get(taskId, context.projectId)

        if (!task) {
            return { status: 404, body: { error: "Task not found in your active project." } }
        }

        const existing = db.prepare(`
            SELECT id
            FROM task_assignment
            WHERE internship_id = ? AND task_id = ? AND ended_at IS NULL
        `).get(context.internshipId, task.id)

        if (existing) {
            return { status: 200, body: { assignment: findActiveAssignmentDetails(existing.id, req.user.id) } }
        }

        const insert = db.prepare(`
            INSERT INTO task_assignment (internship_id, task_id, assigned_by_user_id, assigned_at)
            VALUES (?, ?, ?, ?)
        `).run(context.internshipId, task.id, req.user.id, new Date().toISOString())
        const { id } = db.prepare("SELECT id FROM task_assignment WHERE rowid = ?").get(insert.lastInsertRowid)

        return { status: 201, body: { assignment: findActiveAssignmentDetails(id, req.user.id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

taskTimeRouter.patch("/assignments/:assignmentId/note", requireIntern, (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null

    if (note === null || note.length > 2000) {
        return res.status(400).send({
            error: "Please correct the task note.",
            fieldErrors: { note: "Task note must be text with at most 2000 characters." }
        })
    }

    const assignment = findActiveAssignmentDetails(req.params.assignmentId, req.user.id)

    if (!assignment) {
        return res.status(404).send({ error: "Active task assignment not found." })
    }

    db.prepare("UPDATE task_assignment SET intern_note = ? WHERE id = ?").run(note, assignment.id)
    res.send({ assignment: findActiveAssignmentDetails(assignment.id, req.user.id) })
})

taskTimeRouter.post("/assignments/:assignmentId/end", requireIntern, (req, res) => {
    const assignment = findActiveAssignmentDetails(req.params.assignmentId, req.user.id)

    if (!assignment) {
        return res.status(404).send({ error: "Active task assignment not found." })
    }

    if (!assignment.canLeave) {
        return res.status(403).send({ error: "Only a Supervisor can remove this assignment." })
    }

    const endedAt = new Date().toISOString()
    db.prepare("UPDATE task_assignment SET ended_at = ? WHERE id = ?").run(endedAt, assignment.id)

    res.send({ assignment: { ...assignment, endedAt } })
})

taskTimeRouter.post("/entries", requireIntern, (req, res) => {
    const { values, fieldErrors } = validateEntry(req.body)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the task time fields.", fieldErrors })
    }

    const result = db.transaction(() => {
        const assignment = findActiveAssignment(values.taskAssignmentId, req.user.id)

        if (!assignment) {
            return { status: 404, body: { error: "Active task assignment not found." } }
        }

        if (findOverlappingEntry(req.user.id, values.startedAt, values.endedAt)) {
            return { status: 409, body: { error: "Task time cannot overlap another entry." } }
        }

        const insert = db.prepare(`
            INSERT INTO task_time_entry (task_assignment_id, started_at, ended_at)
            VALUES (?, ?, ?)
        `).run(assignment.id, values.startedAt, values.endedAt)
        const { id } = db.prepare("SELECT id FROM task_time_entry WHERE rowid = ?").get(insert.lastInsertRowid)

        return { status: 201, body: { entry: findEntry(id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

taskTimeRouter.get("/management/assignments", requireSupervisor, (req, res) => {
    res.send({ assignments: findManagedAssignments() })
})

taskTimeRouter.post("/management/assignments", requireSupervisor, (req, res) => {
    const internId = typeof req.body?.internId === "string" ? req.body.internId.trim() : ""
    const taskId = typeof req.body?.taskId === "string" ? req.body.taskId.trim() : ""
    const fieldErrors = {}

    if (!internId) fieldErrors.internId = "Intern is required."
    if (!taskId) fieldErrors.taskId = "Task is required."

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please choose an Intern and task.", fieldErrors })
    }

    const result = db.transaction(() => {
        const internship = db.prepare(`
            SELECT internship.id
            FROM internship
            JOIN user_account ON user_account.id = internship.intern_id
            WHERE internship.intern_id = ?
                AND internship.ended_at IS NULL
                AND user_account.role = 'INTERN'
                AND user_account.is_enabled = 1
        `).get(internId)

        if (!internship) {
            return { status: 404, body: { error: "Active Intern not found." } }
        }

        const task = db.prepare(`
            SELECT task.id, task.project_id AS projectId
            FROM task
            JOIN project ON project.id = task.project_id
            WHERE task.id = ? AND project.archived_at IS NULL
        `).get(taskId)

        if (!task) {
            return { status: 404, body: { error: "Active task not found." } }
        }

        const activeProjectAssignment = db.prepare(`
            SELECT id, project_id AS projectId
            FROM project_assignment
            WHERE internship_id = ? AND ended_at IS NULL
        `).get(internship.id)

        if (!activeProjectAssignment || activeProjectAssignment.projectId !== task.projectId) {
            return {
                status: 409,
                body: { error: "Assign the Intern to this project before assigning the task." }
            }
        }

        const assignedAt = new Date().toISOString()

        const existingAssignment = db.prepare(`
            SELECT id
            FROM task_assignment
            WHERE internship_id = ? AND task_id = ? AND ended_at IS NULL
        `).get(internship.id, task.id)

        if (existingAssignment) {
            return {
                status: 200,
                body: { assignment: findManagedAssignment(existingAssignment.id) }
            }
        }

        const insert = db.prepare(`
            INSERT INTO task_assignment (internship_id, task_id, assigned_by_user_id, assigned_at)
            VALUES (?, ?, ?, ?)
        `).run(internship.id, task.id, req.user.id, assignedAt)
        const { id } = db.prepare("SELECT id FROM task_assignment WHERE rowid = ?").get(insert.lastInsertRowid)

        return { status: 201, body: { assignment: findManagedAssignment(id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

taskTimeRouter.post("/management/assignments/:assignmentId/end", requireSupervisor, (req, res) => {
    const assignment = findManagedAssignment(req.params.assignmentId)

    if (!assignment) {
        return res.status(404).send({ error: "Active task assignment not found." })
    }

    const endedAt = new Date().toISOString()
    db.prepare("UPDATE task_assignment SET ended_at = ? WHERE id = ?").run(endedAt, assignment.id)

    res.send({ assignment: { ...assignment, endedAt } })
})

function requireIntern(req, res, next) {
    if (typeof req.user?.id !== "string") {
        return res.status(401).send({ error: "Unauthorized" })
    }

    const account = db.prepare("SELECT id, role, is_enabled FROM user_account WHERE id = ?").get(req.user.id)

    if (!account) {
        return res.status(401).send({ error: "Unauthorized" })
    }

    if (!account.is_enabled) {
        return res.status(403).send({ error: "Account is disabled." })
    }

    if (account.role !== "INTERN") {
        return res.status(403).send({ error: "Only Interns can register task time." })
    }

    req.user = { ...req.user, role: account.role }
    next()
}

function requireSupervisor(req, res, next) {
    if (typeof req.user?.id !== "string") {
        return res.status(401).send({ error: "Unauthorized" })
    }

    const account = db.prepare("SELECT id, role, is_enabled FROM user_account WHERE id = ?").get(req.user.id)

    if (!account) {
        return res.status(401).send({ error: "Unauthorized" })
    }

    if (!account.is_enabled || account.role !== "SUPERVISOR") {
        return res.status(403).send({ error: "Only active Supervisors can manage task assignments." })
    }

    req.user = { ...req.user, role: account.role }
    next()
}

function validateEntry(body) {
    const fieldErrors = {}

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { values: {}, fieldErrors: { body: "Request body must be an object." } }
    }

    const taskAssignmentId = typeof body.taskAssignmentId === "string" ? body.taskAssignmentId.trim() : ""
    const startedTime = typeof body.startedAt === "string" ? Date.parse(body.startedAt) : Number.NaN
    const endedTime = typeof body.endedAt === "string" ? Date.parse(body.endedAt) : Number.NaN

    if (!taskAssignmentId) {
        fieldErrors.taskAssignmentId = "Task assignment is required."
    }

    if (!Number.isFinite(startedTime)) {
        fieldErrors.startedAt = "Start time must be a valid timestamp."
    }

    if (!Number.isFinite(endedTime)) {
        fieldErrors.endedAt = "End time must be a valid timestamp."
    }

    if (Number.isFinite(startedTime) && Number.isFinite(endedTime)) {
        if (endedTime <= startedTime) {
            fieldErrors.endedAt = "End time must be after start time."
        } else if (endedTime > Date.now() + MAX_FUTURE_END_MS) {
            fieldErrors.endedAt = "End time cannot be more than 24 hours in the future."
        }
    }

    return {
        values: {
            taskAssignmentId,
            startedAt: Number.isFinite(startedTime) ? new Date(startedTime).toISOString() : null,
            endedAt: Number.isFinite(endedTime) ? new Date(endedTime).toISOString() : null
        },
        fieldErrors
    }
}

function findActiveAssignments(userId) {
    return db.prepare(`
        SELECT
            task_assignment.id,
            task.id AS taskId,
            task.title AS taskTitle,
            project.id AS projectId,
            project.name AS projectName,
            task_assignment.assigned_at AS assignedAt,
            task_assignment.intern_note AS internNote,
            task_assignment.assigned_by_user_id AS assignedByUserId,
            CASE
                WHEN task_assignment.assigned_by_user_id = internship.intern_id THEN 1
                ELSE 0
            END AS canLeave
        FROM task_assignment
        JOIN internship ON internship.id = task_assignment.internship_id
        JOIN task ON task.id = task_assignment.task_id
        JOIN project ON project.id = task.project_id
        WHERE internship.intern_id = ?
            AND internship.ended_at IS NULL
            AND task_assignment.ended_at IS NULL
            AND project.archived_at IS NULL
            AND EXISTS (
                SELECT 1
                FROM project_assignment
                WHERE project_assignment.internship_id = internship.id
                    AND project_assignment.project_id = project.id
                    AND project_assignment.ended_at IS NULL
            )
        ORDER BY project.name, task.title, task_assignment.id
    `).all(userId).map((assignment) => ({
        ...assignment,
        canLeave: Boolean(assignment.canLeave)
    }))
}

function findActiveAssignmentDetails(assignmentId, userId) {
    return findActiveAssignments(userId).find((assignment) => assignment.id === assignmentId)
}

function findActiveAssignment(assignmentId, userId) {
    return db.prepare(`
        SELECT task_assignment.id
        FROM task_assignment
        JOIN internship ON internship.id = task_assignment.internship_id
        JOIN task ON task.id = task_assignment.task_id
        JOIN project ON project.id = task.project_id
        WHERE task_assignment.id = ?
            AND internship.intern_id = ?
            AND internship.ended_at IS NULL
            AND task_assignment.ended_at IS NULL
            AND project.archived_at IS NULL
            AND EXISTS (
                SELECT 1
                FROM project_assignment
                WHERE project_assignment.internship_id = internship.id
                    AND project_assignment.project_id = project.id
                    AND project_assignment.ended_at IS NULL
            )
    `).get(assignmentId, userId)
}

function findOverlappingEntry(userId, startedAt, endedAt) {
    return db.prepare(`
        SELECT task_time_entry.id
        FROM task_time_entry
        JOIN task_assignment ON task_assignment.id = task_time_entry.task_assignment_id
        JOIN internship ON internship.id = task_assignment.internship_id
        WHERE internship.intern_id = ?
            AND julianday(task_time_entry.started_at) < julianday(?)
            AND (
                task_time_entry.ended_at IS NULL
                OR julianday(task_time_entry.ended_at) > julianday(?)
            )
        LIMIT 1
    `).get(userId, endedAt, startedAt)
}

function findEntry(entryId) {
    return db.prepare(`
        SELECT
            task_time_entry.id,
            task_time_entry.task_assignment_id AS taskAssignmentId,
            task.id AS taskId,
            task.title AS taskTitle,
            project.id AS projectId,
            project.name AS projectName,
            task_time_entry.started_at AS startedAt,
            task_time_entry.ended_at AS endedAt
        FROM task_time_entry
        JOIN task_assignment ON task_assignment.id = task_time_entry.task_assignment_id
        JOIN task ON task.id = task_assignment.task_id
        JOIN project ON project.id = task.project_id
        WHERE task_time_entry.id = ?
    `).get(entryId)
}

function findManagedAssignments() {
    return db.prepare(`
        SELECT
            task_assignment.id,
            internship.intern_id AS internId,
            user_account.first_name AS internFirstName,
            user_account.last_name AS internLastName,
            project.id AS projectId,
            project.name AS projectName,
            task.id AS taskId,
            task.title AS taskTitle,
            task_assignment.assigned_at AS assignedAt,
            task_assignment.intern_note AS internNote,
            task_assignment.assigned_by_user_id AS assignedByUserId
        FROM task_assignment
        JOIN internship ON internship.id = task_assignment.internship_id
        JOIN user_account ON user_account.id = internship.intern_id
        JOIN task ON task.id = task_assignment.task_id
        JOIN project ON project.id = task.project_id
        WHERE task_assignment.ended_at IS NULL
            AND internship.ended_at IS NULL
            AND project.archived_at IS NULL
        ORDER BY user_account.first_name, user_account.last_name, project.name, task.title
    `).all()
}

function findManagedAssignment(assignmentId) {
    return db.prepare(`
        SELECT
            task_assignment.id,
            internship.intern_id AS internId,
            user_account.first_name AS internFirstName,
            user_account.last_name AS internLastName,
            project.id AS projectId,
            project.name AS projectName,
            task.id AS taskId,
            task.title AS taskTitle,
            task_assignment.assigned_at AS assignedAt,
            task_assignment.intern_note AS internNote,
            task_assignment.assigned_by_user_id AS assignedByUserId
        FROM task_assignment
        JOIN internship ON internship.id = task_assignment.internship_id
        JOIN user_account ON user_account.id = internship.intern_id
        JOIN task ON task.id = task_assignment.task_id
        JOIN project ON project.id = task.project_id
        WHERE task_assignment.id = ? AND task_assignment.ended_at IS NULL
    `).get(assignmentId)
}
