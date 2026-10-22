import { createHash, randomUUID } from "node:crypto"
import db from "./db.js"

const timeZone = "Europe/Copenhagen"
const today = dateInTimeZone(new Date(), timeZone)

function dateInTimeZone(date, zone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${values.year}-${values.month}-${values.day}`
}

function addDays(date, days) {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
}

function weekday(date) {
    return ((new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7) + 1
}

function localDateTime(date, time) {
    // All dates in the current demo dataset fall in Warsaw's UTC+02:00 period.
    return new Date(`${date}T${time}:00+02:00`).toISOString()
}

function generatedTimes(internshipId, date) {
    const digest = createHash("sha256").update(`${internshipId}:${date}`).digest()
    const startMinute = 8 * 60 + 10 + (digest[0] % 41)
    const durationMinute = 414 + (digest[1] % 61)
    const endMinute = startMinute + durationMinute
    const format = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
    return [format(startMinute), format(endMinute)]
}

async function seedDemoAttendanceHistory() {
    const internships = db.prepare(`
        SELECT internship.id, internship.started_at AS startedAt, internship.ended_at AS endedAt,
            user_account.id AS internId, user_account.working_days AS workingDays
        FROM internship
        JOIN user_account ON user_account.id = internship.intern_id
        WHERE user_account.role = 'INTERN' AND user_account.is_enabled = 1
    `).all()
    const existingRows = db.prepare(`
        SELECT checked_in_at AS checkedInAt FROM attendance_session WHERE internship_id = ?
    `)
    const insert = db.prepare(`
        INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at)
        VALUES (?, ?, ?, ?)
    `)
    let inserted = 0
    const rows = []

    for (const internship of internships) {
        const workdays = JSON.parse(internship.workingDays || "[1,2,3,4,5]")
        const existingDates = new Set(existingRows.all(internship.id)
            .map(({ checkedInAt }) => dateInTimeZone(new Date(checkedInAt), timeZone)))
        const firstDate = dateInTimeZone(new Date(internship.startedAt), timeZone)
        const finalDate = internship.endedAt
            ? dateInTimeZone(new Date(internship.endedAt), timeZone)
            : today

        for (let date = firstDate; date <= finalDate; date = addDays(date, 1)) {
            if (!workdays.includes(weekday(date)) || existingDates.has(date)) continue
            const [start, end] = generatedTimes(internship.id, date)
            rows.push([randomUUID().replaceAll("-", ""), internship.id,
                localDateTime(date, start), localDateTime(date, end)])
            existingDates.add(date)
        }
    }

    const run = db.transaction(() => {
        for (const row of rows) insert.run(...row)
        inserted = rows.length
    })
    run()
    console.log(`Added ${inserted} deterministic demo attendance sessions through ${today}.`)
}

seedDemoAttendanceHistory()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => db.close())
