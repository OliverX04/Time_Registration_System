import db from "../database/db.js"

const EXPECTED_INTERNSHIP_WORKING_DAYS = 100

export function getStatistics({ internId = null, projectId = null, startDate = null, endDate = null, timeZone = "UTC" }) {
    const range = createRange(startDate, endDate, timeZone)
    const attendance = getAttendanceSessions(internId, range)
    const taskEntries = getTaskEntries(internId, projectId, range)
    const daily = new Map()
    const weekly = new Map()
    const monthly = new Map()
    const interns = new Map()
    const projects = new Map()
    const tasks = new Map()
    const internSettings = getInternSettings(internId)

    for (const intern of internSettings) {
        interns.set(intern.internId, {
            internId: intern.internId,
            firstName: intern.firstName,
            lastName: intern.lastName,
            attendanceDurationMs: 0,
            taskDurationMs: 0,
            expectedPresenceDurationMs: 0,
            attendanceDifferenceMs: 0
        })
    }

    let attendanceDurationMs = 0
    let taskDurationMs = 0

    for (const session of attendance) {
        const durationMs = clipDuration(session.startedAt, session.endedAt, range)
        if (!durationMs) continue

        attendanceDurationMs += durationMs
        addInternDuration(interns, session, "attendanceDurationMs", durationMs)
        addPeriods(daily, weekly, monthly, session.startedAt, session.endedAt, range, "attendanceDurationMs")
    }

    for (const entry of taskEntries) {
        const durationMs = clipDuration(entry.startedAt, entry.endedAt, range)
        if (!durationMs) continue

        taskDurationMs += durationMs
        addInternDuration(interns, entry, "taskDurationMs", durationMs)
        addBreakdown(projects, entry.projectId, entry.projectName, durationMs)
        addBreakdown(tasks, entry.taskId, entry.taskTitle, durationMs, entry.projectName)
        addPeriods(daily, weekly, monthly, entry.startedAt, entry.endedAt, range, "taskDurationMs")
    }

    const missingExpectedHours = addExpectedPresence(internSettings, interns, daily, weekly, monthly, range)
    const expectedPresenceDurationMs = missingExpectedHours
        ? null
        : [...interns.values()].reduce((total, intern) => total + intern.expectedPresenceDurationMs, 0)
    const attendanceDifferenceMs = expectedPresenceDurationMs === null
        ? null
        : attendanceDurationMs - expectedPresenceDurationMs

    const byDay = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, totals]) => ({ date, ...totals }))
    const byWeek = [...weekly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStarting, totals]) => ({ weekStarting, ...totals }))
    const byMonth = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, totals]) => ({ month, ...totals }))

    if (missingExpectedHours) {
        for (const period of [...byDay, ...byWeek, ...byMonth]) {
            period.expectedPresenceDurationMs = null
            period.attendanceDifferenceMs = null
        }
    } else {
        for (const period of [...byDay, ...byWeek, ...byMonth]) {
            period.attendanceDifferenceMs = period.attendanceDurationMs - period.expectedPresenceDurationMs
        }
    }

    return {
        filters: { startDate, endDate, internId, projectId },
        timeZone,
        totals: { attendanceDurationMs, expectedPresenceDurationMs, attendanceDifferenceMs, taskDurationMs },
        byDay,
        byWeek,
        byMonth,
        byIntern: [...interns.values()].sort((a, b) =>
            a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.internId.localeCompare(b.internId)
        ),
        byProject: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)),
        byTask: [...tasks.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ id, name, projectName, durationMs }) => ({ id, title: name, projectName, durationMs }))
    }
}

function createRange(startDate, endDate, timeZone) {
    if (typeof timeZone !== "string" || !timeZone) throw new TypeError("Time zone is required.")
    try {
        new Intl.DateTimeFormat("en", { timeZone }).format(new Date())
    } catch {
        throw new TypeError("Time zone is not valid.")
    }

    const start = startDate ? parseDate(startDate) : null
    const end = endDate ? parseDate(endDate) : null

    if (start && end && start > end) {
        throw new RangeError("Start date must be on or before end date.")
    }

    const endExclusiveDate = end ? addCalendarDays(end, 1) : null
    return {
        startMs: start ? localDateStart(start, timeZone) : Number.NEGATIVE_INFINITY,
        endMs: endExclusiveDate ? localDateStart(endExclusiveDate, timeZone) : Number.POSITIVE_INFINITY,
        timeZone
    }
}

function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new TypeError("Dates must use YYYY-MM-DD format.")
    }

    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new TypeError("Date is not valid.")
    }

    return value
}

function addCalendarDays(date, days) {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
}

function localDateStart(date, timeZone) {
    const [year, month, day] = date.split("-").map(Number)
    const targetMs = Date.UTC(year, month - 1, day)
    let candidateMs = targetMs
    const formatter = new Intl.DateTimeFormat("en", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    })

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(candidateMs))
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, Number(part.value)]))
        const displayedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
        const adjustment = targetMs - displayedAsUtc
        candidateMs += adjustment
        if (adjustment === 0) break
    }

    return candidateMs
}

function localDateKey(timestamp, timeZone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date(timestamp))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}`
}

function getAttendanceSessions(internId, range) {
    const conditions = ["attendance_session.checked_out_at IS NOT NULL"]
    const params = []

    if (internId) {
        conditions.push("internship.intern_id = ?")
        params.push(internId)
    }
    if (Number.isFinite(range.startMs)) {
        conditions.push("attendance_session.checked_out_at > ?")
        params.push(new Date(range.startMs).toISOString())
    }
    if (Number.isFinite(range.endMs)) {
        conditions.push("attendance_session.checked_in_at < ?")
        params.push(new Date(range.endMs).toISOString())
    }

    return db.prepare(`
        SELECT
            internship.intern_id AS internId,
            user_account.first_name AS firstName,
            user_account.last_name AS lastName,
            attendance_session.checked_in_at AS startedAt,
            attendance_session.checked_out_at AS endedAt
        FROM attendance_session
        JOIN internship ON internship.id = attendance_session.internship_id
        JOIN user_account ON user_account.id = internship.intern_id
        WHERE ${conditions.join(" AND ")}
    `).all(...params)
}

function getTaskEntries(internId, projectId, range) {
    const conditions = ["task_time_entry.ended_at IS NOT NULL"]
    const params = []

    if (internId) {
        conditions.push("internship.intern_id = ?")
        params.push(internId)
    }
    if (projectId) {
        conditions.push("project.id = ?")
        params.push(projectId)
    }
    if (Number.isFinite(range.startMs)) {
        conditions.push("task_time_entry.ended_at > ?")
        params.push(new Date(range.startMs).toISOString())
    }
    if (Number.isFinite(range.endMs)) {
        conditions.push("task_time_entry.started_at < ?")
        params.push(new Date(range.endMs).toISOString())
    }

    return db.prepare(`
        SELECT
            internship.intern_id AS internId,
            user_account.first_name AS firstName,
            user_account.last_name AS lastName,
            project.id AS projectId,
            project.name AS projectName,
            task.id AS taskId,
            task.title AS taskTitle,
            task_time_entry.started_at AS startedAt,
            task_time_entry.ended_at AS endedAt
        FROM task_time_entry
        JOIN task_assignment ON task_assignment.id = task_time_entry.task_assignment_id
        JOIN internship ON internship.id = task_assignment.internship_id
        JOIN user_account ON user_account.id = internship.intern_id
        JOIN task ON task.id = task_assignment.task_id
        JOIN project ON project.id = task.project_id
        WHERE ${conditions.join(" AND ")}
    `).all(...params)
}

function getInternSettings(internId) {
    const conditions = ["user_account.role = 'INTERN'"]
    const params = []
    if (internId) {
        conditions.push("user_account.id = ?")
        params.push(internId)
    }

    const accounts = db.prepare(`
        SELECT
            user_account.id AS internId,
            user_account.first_name AS firstName,
            user_account.last_name AS lastName,
            user_account.expected_weekly_hours AS expectedWeeklyHours,
            user_account.working_days AS workingDays
        FROM user_account
        WHERE ${conditions.join(" AND ")}
        ORDER BY user_account.first_name, user_account.last_name
    `).all(...params)
    const periods = db.prepare(`
        SELECT intern_id AS internId, started_at AS startedAt, ended_at AS endedAt
        FROM internship
        WHERE (? IS NULL OR intern_id = ?)
    `).all(internId, internId)
    const periodsByIntern = new Map()

    for (const period of periods) {
        if (!periodsByIntern.has(period.internId)) periodsByIntern.set(period.internId, [])
        periodsByIntern.get(period.internId).push(period)
    }

    return accounts.map((account) => {
        let workingDays = []
        try {
            workingDays = JSON.parse(account.workingDays)
        } catch {
            // Invalid legacy settings remain unavailable until corrected by a Supervisor.
        }
        const validWorkingDays = Array.isArray(workingDays)
            && workingDays.length > 0
            && workingDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
            && new Set(workingDays).size === workingDays.length

        return {
            ...account,
            workingDays: validWorkingDays ? workingDays : [],
            internshipPeriods: periodsByIntern.get(account.internId) || [],
            isExpectedHoursConfigured: Number.isFinite(account.expectedWeeklyHours) && account.expectedWeeklyHours > 0 && validWorkingDays
        }
    })
}

function addExpectedPresence(internSettings, interns, daily, weekly, monthly, range) {
    let missingExpectedHours = false
    const now = Date.now()

    for (const intern of internSettings) {
        const summary = interns.get(intern.internId)
        if (!intern.isExpectedHoursConfigured) {
            summary.expectedPresenceDurationMs = null
            summary.attendanceDifferenceMs = null
            missingExpectedHours = true
            continue
        }

        const hoursPerWorkingDay = intern.expectedWeeklyHours / intern.workingDays.length
        for (const period of intern.internshipPeriods) {
            const startMs = Math.max(Date.parse(period.startedAt), range.startMs)
            const endMs = Math.min(period.endedAt ? Date.parse(period.endedAt) : now, range.endMs, now)
            if (startMs >= endMs) continue

            const lastDate = localDateKey(endMs - 1, range.timeZone)
            let date = localDateKey(Date.parse(period.startedAt), range.timeZone)
            let expectedWorkingDays = 0
            while (date <= lastDate) {
                const weekday = ((new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7) + 1
                if (intern.workingDays.includes(weekday)) {
                    expectedWorkingDays += 1
                    const dateStartMs = localDateStart(date, range.timeZone)
                    if (expectedWorkingDays <= EXPECTED_INTERNSHIP_WORKING_DAYS
                        && dateStartMs >= range.startMs && dateStartMs < range.endMs) {
                        const expectedDurationMs = hoursPerWorkingDay * 60 * 60 * 1000
                        summary.expectedPresenceDurationMs += expectedDurationMs
                        addExpectedPeriod(daily, date, expectedDurationMs)
                        addExpectedPeriod(weekly, getWeekStarting(date), expectedDurationMs)
                        addExpectedPeriod(monthly, date.slice(0, 7), expectedDurationMs)
                    }
                    if (expectedWorkingDays === EXPECTED_INTERNSHIP_WORKING_DAYS) break
                }
                date = addCalendarDays(date, 1)
            }
        }
        summary.attendanceDifferenceMs = summary.attendanceDurationMs - summary.expectedPresenceDurationMs
    }

    return missingExpectedHours
}

function addExpectedPeriod(groups, key, expectedDurationMs) {
    if (!groups.has(key)) groups.set(key, { attendanceDurationMs: 0, taskDurationMs: 0, expectedPresenceDurationMs: 0 })
    groups.get(key).expectedPresenceDurationMs += expectedDurationMs
}

function clipDuration(startedAt, endedAt, range) {
    const startMs = Math.max(Date.parse(startedAt), range.startMs)
    const endMs = Math.min(Date.parse(endedAt), range.endMs)
    return Math.max(0, endMs - startMs)
}

function addPeriods(daily, weekly, monthly, startedAt, endedAt, range, field) {
    let cursor = Math.max(Date.parse(startedAt), range.startMs)
    const endMs = Math.min(Date.parse(endedAt), range.endMs)

    while (cursor < endMs) {
        const date = localDateKey(cursor, range.timeZone)
        const dayEnd = localDateStart(addCalendarDays(date, 1), range.timeZone)
        const segmentEnd = Math.min(dayEnd, endMs)
        const durationMs = segmentEnd - cursor
        const weekStarting = getWeekStarting(date)
        const month = date.slice(0, 7)

        addPeriodValue(daily, date, field, durationMs)
        addPeriodValue(weekly, weekStarting, field, durationMs)
        addPeriodValue(monthly, month, field, durationMs)
        cursor = segmentEnd
    }
}

function getWeekStarting(date) {
    const value = new Date(`${date}T00:00:00.000Z`)
    const daysSinceMonday = (value.getUTCDay() + 6) % 7
    value.setUTCDate(value.getUTCDate() - daysSinceMonday)
    return value.toISOString().slice(0, 10)
}

function addPeriodValue(groups, key, field, durationMs) {
    if (!groups.has(key)) groups.set(key, { attendanceDurationMs: 0, taskDurationMs: 0, expectedPresenceDurationMs: 0 })
    groups.get(key)[field] += durationMs
}

function addInternDuration(groups, record, field, durationMs) {
    if (!groups.has(record.internId)) {
        groups.set(record.internId, {
            internId: record.internId,
            firstName: record.firstName,
            lastName: record.lastName,
            attendanceDurationMs: 0,
            taskDurationMs: 0
        })
    }
    groups.get(record.internId)[field] += durationMs
}

function addBreakdown(groups, id, name, durationMs, projectName = null) {
    if (!groups.has(id)) groups.set(id, { id, name, projectName, durationMs: 0 })
    groups.get(id).durationMs += durationMs
}
