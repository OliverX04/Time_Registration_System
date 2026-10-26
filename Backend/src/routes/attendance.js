import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"

export const attendanceRouter = express.Router()

attendanceRouter.use(requireAuth)
attendanceRouter.use(requireIntern)

attendanceRouter.get("/history", (req, res) => {
    const sessions = findSessionsForIntern(req.user.id)
    res.send({ sessions })
})

attendanceRouter.get("/status", (req, res) => {
    const internship = findActiveInternship(req.user.id)

    if (!internship) {
        return res.status(409).send({ error: "No active internship found." })
    }

    const session = findOpenSession(internship.id)
    res.send({ isCheckedIn: Boolean(session), session: session || null })
})

attendanceRouter.post("/check-in", (req, res) => {
    const result = db.transaction(() => {
        const internship = findActiveInternship(req.user.id)

        if (!internship) {
            return { status: 409, body: { error: "No active internship found." } }
        }

        if (findOpenSession(internship.id)) {
            return { status: 409, body: { error: "You are already checked in." } }
        }

        const checkedInAt = new Date().toISOString()
        const insert = db.prepare(`
            INSERT INTO attendance_session (internship_id, checked_in_at)
            VALUES (?, ?)
        `).run(internship.id, checkedInAt)
        const { id } = db.prepare("SELECT id FROM attendance_session WHERE rowid = ?").get(insert.lastInsertRowid)

        return { status: 201, body: { session: findSession(id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

attendanceRouter.post("/check-out", (req, res) => {
    const result = db.transaction(() => {
        const internship = findActiveInternship(req.user.id)

        if (!internship) {
            return { status: 409, body: { error: "No active internship found." } }
        }

        const session = findOpenSession(internship.id)

        if (!session) {
            return { status: 409, body: { error: "You are not checked in." } }
        }

        const checkedInTime = new Date(session.checkedInAt).getTime()
        const checkedOutAt = new Date(Math.max(Date.now(), checkedInTime + 1)).toISOString()
        db.prepare("UPDATE attendance_session SET checked_out_at = ? WHERE id = ?").run(checkedOutAt, session.id)

        return { status: 200, body: { session: findSession(session.id) } }
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
        return res.status(403).send({ error: "Only Interns can register attendance." })
    }

    req.user = { ...req.user, role: account.role }
    next()
}

function findActiveInternship(userId) {
    return db.prepare(`
        SELECT id
        FROM internship
        WHERE intern_id = ? AND ended_at IS NULL
        ORDER BY started_at DESC, id DESC
        LIMIT 1
    `).get(userId)
}

function findOpenSession(internshipId) {
    return db.prepare(`
        SELECT
            id,
            internship_id AS internshipId,
            checked_in_at AS checkedInAt,
            checked_out_at AS checkedOutAt
        FROM attendance_session
        WHERE internship_id = ? AND checked_out_at IS NULL
        ORDER BY checked_in_at DESC, id DESC
        LIMIT 1
    `).get(internshipId)
}

function findSession(sessionId) {
    return db.prepare(`
        SELECT
            id,
            internship_id AS internshipId,
            checked_in_at AS checkedInAt,
            checked_out_at AS checkedOutAt
        FROM attendance_session
        WHERE id = ?
    `).get(sessionId)
}

function findSessionsForIntern(userId) {
    return db.prepare(`
        SELECT
            attendance_session.id,
            attendance_session.internship_id AS internshipId,
            attendance_session.checked_in_at AS checkedInAt,
            attendance_session.checked_out_at AS checkedOutAt
        FROM attendance_session
        JOIN internship ON internship.id = attendance_session.internship_id
        WHERE internship.intern_id = ?
        ORDER BY attendance_session.checked_in_at DESC, attendance_session.id DESC
    `).all(userId)
}
