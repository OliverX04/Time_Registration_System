import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"
import { copenhagenDate } from "../validation/internshipDates.js"

export const attendanceRouter = express.Router()

attendanceRouter.use(requireAuth)

attendanceRouter.get("/management/interns/:internId", requireSupervisor, (req, res) => {
    const intern = findIntern(req.params.internId)

    if (!intern) return res.status(404).send({ error: "Intern not found." })

    const internships = db.prepare(`
        SELECT id, started_at AS startedAt, ended_at AS endedAt, outcome
        FROM internship
        WHERE intern_id = ?
        ORDER BY started_at DESC, id DESC
    `).all(intern.id)

    res.send({ intern, internships, sessions: findSessionsForIntern(intern.id) })
})

attendanceRouter.post("/management/interns/:internId", requireSupervisor, (req, res) => {
    const { values, fieldErrors } = validateSession(req.body)
    if (typeof req.body?.internshipId !== "string" || !req.body.internshipId.trim()) {
        fieldErrors.internshipId = "Choose an internship."
    }

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the attendance times.", fieldErrors })
    }

    const result = db.transaction(() => {
        const internship = db.prepare(`
            SELECT internship.id, internship.intern_id AS internId,
                internship.started_at AS startedAt, internship.ended_at AS endedAt
            FROM internship
            JOIN user_account ON user_account.id = internship.intern_id
            WHERE internship.id = ? AND internship.intern_id = ? AND user_account.role = 'INTERN'
        `).get(req.body.internshipId.trim(), req.params.internId)

        if (!internship) return { status: 404, body: { error: "Internship not found for this Intern." } }

        const problem = checkSession(internship, values)
        if (problem) return problem

        const insert = db.prepare(`
            INSERT INTO attendance_session (internship_id, checked_in_at, checked_out_at)
            VALUES (?, ?, ?)
        `).run(internship.id, values.checkedInAt, values.checkedOutAt)
        const { id } = db.prepare("SELECT id FROM attendance_session WHERE rowid = ?").get(insert.lastInsertRowid)

        return { status: 201, body: { session: findSession(id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

attendanceRouter.put("/management/sessions/:sessionId", requireSupervisor, (req, res) => {
    const { values, fieldErrors } = validateSession(req.body)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({ error: "Please correct the attendance times.", fieldErrors })
    }

    const result = db.transaction(() => {
        const session = findManagedSession(req.params.sessionId)
        if (!session) return { status: 404, body: { error: "Attendance record not found." } }
        if (!matchesOriginal(session, req.body)) return changedSession()

        const problem = checkSession(session, values, session.id)
        if (problem) return problem

        db.prepare(`
            UPDATE attendance_session SET checked_in_at = ?, checked_out_at = ? WHERE id = ?
        `).run(values.checkedInAt, values.checkedOutAt, session.id)

        return { status: 200, body: { session: findSession(session.id) } }
    }).immediate()

    res.status(result.status).send(result.body)
})

attendanceRouter.delete("/management/sessions/:sessionId", requireSupervisor, (req, res) => {
    const result = db.transaction(() => {
        const session = findManagedSession(req.params.sessionId)
        if (!session) return { status: 404, body: { error: "Attendance record not found." } }
        if (!matchesOriginal(session, req.body)) return changedSession()

        db.prepare("DELETE FROM attendance_session WHERE id = ?").run(session.id)
        return { status: 200, body: { message: "Attendance record removed." } }
    }).immediate()

    res.status(result.status).send(result.body)
})

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
        if (copenhagenDate(checkedInAt) < copenhagenDate(internship.startedAt)) {
            return { status: 409, body: { error: "Your internship has not started yet." } }
        }
        if (findOverlappingSession(req.user.id, checkedInAt, null)) {
            return { status: 409, body: { error: "Attendance overlaps another record. Ask a Supervisor to correct it." } }
        }

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
        if (findOverlappingSession(req.user.id, session.checkedInAt, checkedOutAt, session.id)) {
            return { status: 409, body: { error: "Attendance overlaps another record. Ask a Supervisor to correct it." } }
        }
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

function requireSupervisor(req, res, next) {
    if (typeof req.user?.id !== "string") {
        return res.status(401).send({ error: "Unauthorized" })
    }

    const account = db.prepare("SELECT role, is_enabled FROM user_account WHERE id = ?").get(req.user.id)

    if (!account) return res.status(401).send({ error: "Unauthorized" })
    if (!account.is_enabled || account.role !== "SUPERVISOR") {
        return res.status(403).send({ error: "Only enabled Supervisors can correct attendance." })
    }

    next()
}

function findIntern(userId) {
    return db.prepare(`
        SELECT id, first_name AS firstName, last_name AS lastName, email
        FROM user_account WHERE id = ? AND role = 'INTERN'
    `).get(userId)
}

function findManagedSession(sessionId) {
    return db.prepare(`
        SELECT attendance_session.id, attendance_session.checked_in_at AS checkedInAt,
            attendance_session.checked_out_at AS checkedOutAt,
            internship.intern_id AS internId, internship.started_at AS startedAt,
            internship.ended_at AS endedAt
        FROM attendance_session
        JOIN internship ON internship.id = attendance_session.internship_id
        JOIN user_account ON user_account.id = internship.intern_id
        WHERE attendance_session.id = ? AND user_account.role = 'INTERN'
    `).get(sessionId)
}

function matchesOriginal(session, body) {
    return typeof body?.expectedCheckedInAt === "string"
        && (body.expectedCheckedOutAt === null || typeof body.expectedCheckedOutAt === "string")
        && body.expectedCheckedInAt === session.checkedInAt
        && body.expectedCheckedOutAt === session.checkedOutAt
}

function changedSession() {
    return {
        status: 409,
        body: { error: "This attendance record changed. Refresh the list before editing it again." }
    }
}

function validateSession(body) {
    const checkedInAt = parseTimestamp(body?.checkedInAt)
    const checkedOutAt = body?.checkedOutAt === null ? null : parseTimestamp(body?.checkedOutAt)
    const fieldErrors = {}

    if (!checkedInAt) fieldErrors.checkedInAt = "Enter a valid check-in date and time."
    if (checkedOutAt === undefined) fieldErrors.checkedOutAt = "Enter a valid check-out date and time, or leave it open."

    const now = Date.now()
    if (checkedInAt && Date.parse(checkedInAt) > now) {
        fieldErrors.checkedInAt = "Check-in cannot be in the future."
    }
    if (checkedOutAt && Date.parse(checkedOutAt) > now) {
        fieldErrors.checkedOutAt = "Check-out cannot be in the future."
    }
    if (checkedInAt && checkedOutAt && checkedOutAt <= checkedInAt) {
        fieldErrors.checkedOutAt = "Check-out must be after check-in."
    }

    return { values: { checkedInAt, checkedOutAt }, fieldErrors }
}

function parseTimestamp(value) {
    if (typeof value !== "string") return undefined

    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
    if (!match) return undefined

    const date = new Date(value)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) return undefined

    return date.toISOString()
}

function checkSession(internship, values, excludedSessionId = "") {
    const fieldErrors = {}

    if (copenhagenDate(values.checkedInAt) < copenhagenDate(internship.startedAt)) {
        fieldErrors.checkedInAt = "Check-in cannot be before the internship start date."
    }
    if (internship.endedAt) {
        if (values.checkedOutAt === null) {
            fieldErrors.checkedOutAt = "An ended internship needs a check-out time."
        } else if (Date.parse(values.checkedOutAt) > Date.parse(internship.endedAt)) {
            fieldErrors.checkedOutAt = "Check-out cannot be after the internship ended."
        }
    }

    if (Object.keys(fieldErrors).length) {
        return { status: 400, body: { error: "Attendance must fall within the internship dates.", fieldErrors } }
    }

    if (findOverlappingSession(internship.internId, values.checkedInAt, values.checkedOutAt, excludedSessionId)) {
        return { status: 409, body: { error: "These times overlap another attendance record for this Intern." } }
    }

    return null
}

function findOverlappingSession(userId, checkedInAt, checkedOutAt, excludedSessionId = "") {
    return db.prepare(`
        SELECT attendance_session.id
        FROM attendance_session
        JOIN internship ON internship.id = attendance_session.internship_id
        WHERE internship.intern_id = ? AND attendance_session.id != ?
            AND (? IS NULL OR julianday(attendance_session.checked_in_at) < julianday(?))
            AND (attendance_session.checked_out_at IS NULL OR julianday(attendance_session.checked_out_at) > julianday(?))
        LIMIT 1
    `).get(userId, excludedSessionId, checkedOutAt, checkedOutAt, checkedInAt)
}

function findActiveInternship(userId) {
    return db.prepare(`
        SELECT id, started_at AS startedAt
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
