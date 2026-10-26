import { createHash, randomBytes } from "node:crypto"
import db from "./db.js"
import { hashPassword } from "../security/password.js"

const formerInterns = [
    { firstName: "Lukas", lastName: "Meyer", projectName: "Campus Analytics Dashboard", endDate: "2026-10-07" },
    { firstName: "Nora", lastName: "Fischer", projectName: "Student Support Portal", endDate: "2026-10-09" },
    { firstName: "Theo", lastName: "Schmidt", projectName: "VIA Time Registration System", endDate: "2026-10-14" },
    { firstName: "Maya", lastName: "Nielsen", projectName: "Campus Analytics Dashboard", endDate: "2026-10-16" }
]

function addDays(date, days) {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
}

function isWeekday(date) {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
    return day >= 1 && day <= 5
}

function localDateTime(date, time) {
    return new Date(`${date}T${time}:00+02:00`).toISOString()
}

function attendanceTimes(internId, date) {
    const digest = createHash("sha256").update(`${internId}:${date}`).digest()
    const startMinute = 8 * 60 + 10 + (digest[0] % 41)
    const durationMinute = 414 + (digest[1] % 61)
    const endMinute = startMinute + durationMinute
    const format = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
    return [format(startMinute), format(endMinute)]
}

async function seedFormerInterns() {
    const supervisor = db.prepare("SELECT id FROM user_account WHERE role = 'SUPERVISOR' LIMIT 1").get()
    if (!supervisor) throw new Error("Create a Supervisor before seeding former interns.")

    const projects = new Map(db.prepare("SELECT id, name FROM project WHERE archived_at IS NULL").all()
        .map((project) => [project.name, project]))
    const alreadySeeded = db.prepare("SELECT id FROM user_account WHERE id = ?")
    const passwordHash = await hashPassword(randomBytes(32).toString("base64url"))
    const inserts = {
        account: db.prepare(`
            INSERT INTO user_account (id, first_name, last_name, student_number, email, password_hash, role, is_enabled)
            VALUES (?, ?, ?, ?, ?, ?, 'INTERN', 0)
        `),
        internship: db.prepare(`
            INSERT INTO internship (id, intern_id, started_at, ended_at, outcome)
            VALUES (?, ?, ?, ?, 'DISCONTINUED')
        `),
        projectAssignment: db.prepare(`
            INSERT INTO project_assignment (id, internship_id, project_id, assigned_at, ended_at)
            VALUES (?, ?, ?, ?, ?)
        `),
        taskAssignment: db.prepare(`
            INSERT INTO task_assignment (id, internship_id, task_id, assigned_by_user_id, assigned_at, ended_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `),
        attendance: db.prepare(`
            INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at)
            VALUES (?, ?, ?, ?)
        `)
    }
    const tasksForProject = db.prepare("SELECT id FROM task WHERE project_id = ? ORDER BY title")
    let inserted = 0

    for (const former of formerInterns) {
        const slug = `${former.firstName}-${former.lastName}`.toLowerCase()
        const internId = `demo-former-intern-${slug}`
        if (alreadySeeded.get(internId)) continue

        const project = projects.get(former.projectName)
        if (!project) throw new Error(`Required demo project is missing: ${former.projectName}`)
        const task = tasksForProject.get(project.id)
        if (!task) throw new Error(`No task exists for ${former.projectName}.`)

        const internshipId = `demo-former-internship-${slug}`
        const projectAssignmentId = `demo-former-project-assignment-${slug}`
        const taskAssignmentId = `demo-former-task-assignment-${slug}`
        const startedAt = localDateTime("2026-10-01", "08:00")
        const endedAt = localDateTime(former.endDate, "17:00")
        const attendance = []

        for (let date = "2026-10-01"; date <= former.endDate; date = addDays(date, 1)) {
            if (!isWeekday(date)) continue
            const [start, end] = attendanceTimes(internId, date)
            attendance.push([`demo-former-attendance-${slug}-${date}`, internshipId,
                localDateTime(date, start), localDateTime(date, end)])
        }

        const insert = db.transaction(() => {
            inserts.account.run(internId, former.firstName, former.lastName,
                `DEMO-FORMER-${slug.toUpperCase()}`, `former.${slug}@demo.invalid`, passwordHash)
            inserts.internship.run(internshipId, internId, startedAt, endedAt)
            inserts.projectAssignment.run(projectAssignmentId, internshipId, project.id, startedAt, endedAt)
            inserts.taskAssignment.run(taskAssignmentId, internshipId, task.id, supervisor.id, startedAt, endedAt)
            for (const row of attendance) inserts.attendance.run(...row)
        })
        insert()
        inserted += 1
    }

    const activeCount = db.prepare(`
        SELECT COUNT(*) AS count FROM user_account u
        JOIN internship i ON i.intern_id=u.id AND i.ended_at IS NULL
        WHERE u.role='INTERN' AND u.is_enabled=1
    `).get().count
    const formerCount = db.prepare(`
        SELECT COUNT(*) AS count FROM internship WHERE outcome='DISCONTINUED'
    `).get().count
    console.log(JSON.stringify({ addedFormerInterns: inserted, activeInterns: activeCount, formerInterns: formerCount }, null, 2))
}

seedFormerInterns()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => db.close())
