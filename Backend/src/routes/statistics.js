import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"
import { getStatistics } from "../services/statistics.js"

export const statisticsRouter = express.Router()

statisticsRouter.use(requireAuth)

statisticsRouter.get("/me", (req, res) => {
    const account = getAuthenticatedAccount(req.user?.id)
    if (!account) return res.status(401).send({ error: "Unauthorized" })
    if (!account.isEnabled) return res.status(403).send({ error: "Account is disabled." })
    if (account.role !== "INTERN") return res.status(403).send({ error: "Only Interns can view their own statistics." })

    const result = readStatistics(req.query, { internId: account.id })
    res.status(result.status).send(result.body)
})

statisticsRouter.get("/", (req, res) => {
    const account = getAuthenticatedAccount(req.user?.id)
    if (!account) return res.status(401).send({ error: "Unauthorized" })
    if (!account.isEnabled) return res.status(403).send({ error: "Account is disabled." })
    if (account.role !== "SUPERVISOR") return res.status(403).send({ error: "Only Supervisors can view all Intern statistics." })

    const internId = typeof req.query.internId === "string" && req.query.internId ? req.query.internId : null
    if (internId) {
        const intern = db.prepare("SELECT id FROM user_account WHERE id = ? AND role = 'INTERN'").get(internId)
        if (!intern) return res.status(404).send({ error: "Intern not found." })
    }

    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : null
    if (projectId && !db.prepare("SELECT id FROM project WHERE id = ?").get(projectId)) {
        return res.status(404).send({ error: "Project not found." })
    }

    const result = readStatistics(req.query, { internId, projectId })
    res.status(result.status).send(result.body)
})

function getAuthenticatedAccount(userId) {
    if (typeof userId !== "string") return null
    return db.prepare("SELECT id, role, is_enabled AS isEnabled FROM user_account WHERE id = ?").get(userId)
}

function readStatistics(query, filters) {
    const startDate = typeof query.startDate === "string" && query.startDate ? query.startDate : null
    const endDate = typeof query.endDate === "string" && query.endDate ? query.endDate : null
    const timeZone = typeof query.timeZone === "string" && query.timeZone ? query.timeZone : "UTC"

    const projectId = typeof query.projectId === "string" && query.projectId ? query.projectId : null
    const taskId = typeof query.taskId === "string" && query.taskId ? query.taskId : null

    try {
        return {
            status: 200,
            body: getStatistics({ ...filters, projectId, taskId, startDate, endDate, timeZone })
        }
    } catch (error) {
        const status = error instanceof TypeError || error instanceof RangeError ? 400 : 500
        return { status, body: { error: error.message } }
    }
}
