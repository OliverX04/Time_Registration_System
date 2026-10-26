import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"
import { validateProject } from "../validation/projects.js"

export const projectsRouter = express.Router()

projectsRouter.use(requireAuth)
projectsRouter.use((req, res, next) => {
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

    req.user = { ...req.user, role: account.role }
    next()
})

const projectFields = `
    project.id,
    project.name,
    project.description,
    project.created_by_user_id AS createdByUserId,
    project.archived_at AS archivedAt,
    (SELECT COUNT(*) FROM project_assignment
        WHERE project_assignment.project_id = project.id
        AND project_assignment.ended_at IS NULL) AS activeAssignmentCount
`

projectsRouter.get("/", (req, res) => {
    const includeArchived = req.query.includeArchived === "true"

    if (includeArchived && req.user.role !== "SUPERVISOR") {
        return res.status(403).send({ error: "Only Supervisors can list archived projects." })
    }

    const projects = req.user.role === "SUPERVISOR"
        ? db.prepare(`
            SELECT ${projectFields}
            FROM project
            ${includeArchived ? "" : "WHERE project.archived_at IS NULL"}
            ORDER BY project.name
        `).all()
        : db.prepare(`
            SELECT ${projectFields}
            FROM project
            JOIN project_assignment
                ON project_assignment.project_id = project.id
                AND project_assignment.ended_at IS NULL
            JOIN internship
                ON internship.id = project_assignment.internship_id
                AND internship.ended_at IS NULL
            WHERE project.archived_at IS NULL
                AND internship.intern_id = ?
            ORDER BY project.name
        `).all(req.user.id)

    res.send({ projects })
})

projectsRouter.post("/", requireSupervisor, (req, res) => {
    const { values, fieldErrors } = validateProject(req.body)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the project fields.", fieldErrors })
    }

    const result = db.prepare(`
        INSERT INTO project (created_by_user_id, name, description)
        VALUES (?, ?, ?)
    `).run(req.user.id, values.name, values.description)
    const { id } = db.prepare("SELECT id FROM project WHERE rowid = ?").get(result.lastInsertRowid)

    res.status(201).send({ project: findProject(id) })
})

projectsRouter.patch("/:projectId", requireSupervisor, (req, res) => {
    const project = findProject(req.params.projectId)

    if (!project) {
        return res.status(404).send({ error: "Project not found" })
    }

    if (project.archivedAt) {
        return res.status(409).send({ error: "Archived projects cannot be edited." })
    }

    const { values, fieldErrors } = validateProject(req.body, true)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the project fields.", fieldErrors })
    }

    db.prepare("UPDATE project SET name = ?, description = ? WHERE id = ?").run(
        values.name ?? project.name,
        values.description ?? project.description,
        project.id
    )

    res.send({ project: findProject(project.id) })
})

projectsRouter.post("/:projectId/archive", requireSupervisor, (req, res) => {
    const result = db.transaction(() => {
        const project = findProject(req.params.projectId)

        if (!project) {
            return { status: 404, body: { error: "Project not found" } }
        }

        if (project.archivedAt) {
            return { status: 200, body: { project } }
        }

        if (project.activeAssignmentCount > 0) {
            return {
                status: 409,
                body: { error: "End or move active Intern assignments before archiving this project." }
            }
        }

        db.prepare("UPDATE project SET archived_at = ? WHERE id = ?").run(new Date().toISOString(), project.id)

        return { status: 200, body: { project: findProject(project.id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

projectsRouter.get("/:projectId/tasks", (req, res) => {
    const project = findProject(req.params.projectId)

    if (!project) {
        return res.status(404).send({
            error: "Project not found"
        })
    }

    if (req.user.role === "INTERN" && !canInternAccessProject(req.user.id, project.id)) {
        return res.status(404).send({ error: "Project not found" })
    }

    const tasks = db
        .prepare(`
            SELECT
                task.id,
                task.project_id AS projectId,
                task.title,
                task.description,
                task.created_by_user_id AS createdByUserId,
                user_account.first_name AS createdByFirstName,
                user_account.last_name AS createdByLastName,
                user_account.role AS createdByRole
            FROM task
            LEFT JOIN user_account
                ON user_account.id = task.created_by_user_id
            WHERE task.project_id = ?
            ORDER BY task.title
        `)
        .all(project.id)

    res.send({ tasks })
})

projectsRouter.post("/:projectId/tasks", (req, res) => {
    const { values, fieldErrors } = validateTask(req.body)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the task fields.", fieldErrors })
    }

    const project = findProject(req.params.projectId)

    if (!project) {
        return res.status(404).send({
            error: "Project not found"
        })
    }

    if (project.archivedAt) {
        return res.status(409).send({ error: "New tasks cannot be added to an archived project." })
    }

    if (req.user.role === "INTERN" && !canInternAccessProject(req.user.id, project.id)) {
        return res.status(404).send({ error: "Project not found" })
    }

    const insertTask = db.prepare(`
        INSERT INTO task (
            project_id,
            created_by_user_id,
            title,
            description
        )
        VALUES (?, ?, ?, ?)
    `)

    const result = insertTask.run(
        project.id,
        req.user.id,
        values.title,
        values.description
    )

    const task = db
        .prepare(`
            SELECT
                id,
                project_id AS projectId,
                title,
                description,
                created_by_user_id AS createdByUserId
            FROM task
            WHERE rowid = ?
        `)
        .get(result.lastInsertRowid)

    res.status(201).send({ task })
})

projectsRouter.patch("/:projectId/tasks/:taskId", (req, res) => {
    const project = findProject(req.params.projectId)

    if (!project) {
        return res.status(404).send({ error: "Project not found" })
    }

    if (project.archivedAt) {
        return res.status(409).send({ error: "Tasks in archived projects cannot be edited." })
    }

    if (req.user.role === "INTERN" && !canInternAccessProject(req.user.id, project.id)) {
        return res.status(404).send({ error: "Project not found" })
    }

    const task = findTask(project.id, req.params.taskId)

    if (!task) {
        return res.status(404).send({ error: "Task not found" })
    }

    if (req.user.role === "INTERN" && task.createdByRole !== "INTERN") {
        return res.status(403).send({ error: "Interns can edit only Intern-created tasks." })
    }

    const { values, fieldErrors } = validateTask(req.body, true)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the task fields.", fieldErrors })
    }

    db.prepare("UPDATE task SET title = ?, description = ? WHERE id = ?").run(
        values.title ?? task.title,
        values.description ?? task.description,
        task.id
    )

    res.send({ task: findTask(project.id, task.id) })
})

function findProject(projectId) {
    return db
        .prepare(`SELECT ${projectFields} FROM project WHERE project.id = ?`)
        .get(projectId)
}

function findTask(projectId, taskId) {
    return db.prepare(`
        SELECT
            task.id,
            task.project_id AS projectId,
            task.title,
            task.description,
            task.created_by_user_id AS createdByUserId,
            user_account.first_name AS createdByFirstName,
            user_account.last_name AS createdByLastName,
            user_account.role AS createdByRole
        FROM task
        LEFT JOIN user_account ON user_account.id = task.created_by_user_id
        WHERE task.project_id = ? AND task.id = ?
    `).get(projectId, taskId)
}

function canInternAccessProject(userId, projectId) {
    return Boolean(db.prepare(`
        SELECT 1
        FROM project_assignment
        JOIN internship ON internship.id = project_assignment.internship_id
        WHERE internship.intern_id = ?
            AND internship.ended_at IS NULL
            AND project_assignment.project_id = ?
            AND project_assignment.ended_at IS NULL
    `).get(userId, projectId))
}

function validateTask(body, partial = false) {
    const fieldErrors = {}
    const values = {}

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { values, fieldErrors: { body: "Request body must be an object." } }
    }

    if (!partial || Object.hasOwn(body, "title")) {
        if (typeof body.title !== "string" || !body.title.trim()) {
            fieldErrors.title = "Task title is required and must be text."
        } else {
            values.title = body.title.trim()
        }
    }

    if (!partial || Object.hasOwn(body, "description")) {
        const description = Object.hasOwn(body, "description") ? body.description : ""

        if (typeof description !== "string") {
            fieldErrors.description = "Task description must be text."
        } else {
            values.description = description.trim()
        }
    }

    if (partial && !Object.hasOwn(values, "title") && !Object.hasOwn(values, "description") && !Object.keys(fieldErrors).length) {
        fieldErrors.body = "Provide a task title or description."
    }

    return { values, fieldErrors }
}

function requireSupervisor(req, res, next) {
    if (req.user.role !== "SUPERVISOR") {
        return res.status(403).send({ error: "Only Supervisors can manage projects." })
    }

    next()
}
