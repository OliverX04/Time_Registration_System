import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"

export const projectsRouter = express.Router()

projectsRouter.use(requireAuth)

projectsRouter.get("/", (req, res) => {
    const projects = db
        .prepare(`
            SELECT
                id,
                name,
                description
            FROM project
            ORDER BY name
        `)
        .all()

    res.send({ projects })
})

projectsRouter.get("/:projectId/tasks", (req, res) => {
    const project = findProject(req.params.projectId)

    if (!project) {
        return res.status(404).send({
            error: "Project not found"
        })
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
    const { title, description = "" } = req.body

    if (!title || !title.trim()) {
        return res.status(400).send({
            error: "Task title is required"
        })
    }

    const project = findProject(req.params.projectId)

    if (!project) {
        return res.status(404).send({
            error: "Project not found"
        })
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
        title.trim(),
        description.trim()
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

function findProject(projectId) {
    return db
        .prepare("SELECT id FROM project WHERE id = ?")
        .get(projectId)
}
