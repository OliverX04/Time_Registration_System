import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"

const MAX_FUTURE_END_MS = 24 * 60 * 60 * 1000

export const taskTimeRouter = express.Router()

taskTimeRouter.use(requireAuth)
taskTimeRouter.use(requireIntern)

taskTimeRouter.get("/assignments", (req, res) => {
    res.send({ assignments: findActiveAssignments(req.user.id) })
})

taskTimeRouter.post("/entries", (req, res) => {
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
            task_assignment.assigned_at AS assignedAt
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
    `).all(userId)
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
