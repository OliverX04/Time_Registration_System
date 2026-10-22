import { randomBytes } from "node:crypto"
import db from "./db.js"
import { hashPassword } from "../security/password.js"

const targetPerProject = 7
const internshipStart = "2026-10-12T07:00:00.000Z"
const attendanceDates = [
    "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15",
    "2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21"
]
const taskDates = ["2026-10-13", "2026-10-15", "2026-10-19", "2026-10-21"]

const cohortByProject = {
    "Campus Analytics Dashboard": [
        ["Emilia", "Berg"], ["Noah", "Andersen"], ["Freja", "Madsen"],
        ["Elias", "Holm"], ["Sofia", "Christensen"]
    ],
    "Student Support Portal": [
        ["Alma", "Pedersen"], ["Oscar", "Nielsen"], ["Clara", "Lund"],
        ["Victor", "Rasmussen"], ["Emma", "Johansen"]
    ],
    "VIA Time Registration System": [
        ["Oliver", "Sorensen"], ["Ida", "Kristensen"], ["William", "Eriksen"],
        ["Astrid", "Larsen"], ["Benjamin", "Poulsen"], ["Mathilde", "Jorgensen"]
    ]
}

async function seedDemoCohort() {
    const supervisor = db.prepare("SELECT id FROM user_account WHERE role = 'SUPERVISOR' LIMIT 1").get()
    if (!supervisor) throw new Error("Create a Supervisor before seeding the demo cohort.")

    const projects = db.prepare(`
        SELECT id, name FROM project WHERE archived_at IS NULL ORDER BY name
    `).all()
    const projectsByName = new Map(projects.map((project) => [project.name, project]))
    const assignedCounts = new Map(db.prepare(`
        SELECT project.id AS projectId, project.name AS projectName, COUNT(DISTINCT internship.intern_id) AS count
        FROM project
        LEFT JOIN project_assignment ON project_assignment.project_id = project.id AND project_assignment.ended_at IS NULL
        LEFT JOIN internship ON internship.id = project_assignment.internship_id AND internship.ended_at IS NULL
        LEFT JOIN user_account ON user_account.id = internship.intern_id
            AND user_account.role = 'INTERN' AND user_account.is_enabled = 1
        WHERE project.archived_at IS NULL
        GROUP BY project.id
    `).all().map((row) => [row.projectName, { ...row, count: Number(row.count) }]))

    const existingInternCount = db.prepare("SELECT COUNT(*) AS count FROM user_account WHERE role = 'INTERN' AND is_enabled = 1").get().count
    const assignedInternCount = [...assignedCounts.values()].reduce((total, project) => total + project.count, 0)
    if (existingInternCount !== assignedInternCount) {
        throw new Error(`Expected all ${existingInternCount} existing Interns to have one active project assignment; found ${assignedInternCount}. Resolve the current demo data before seeding.`)
    }

    const additions = []
    for (const [projectName, names] of Object.entries(cohortByProject)) {
        const project = projectsByName.get(projectName)
        if (!project) throw new Error(`Required demo project is missing: ${projectName}`)
        const currentCount = assignedCounts.get(projectName)?.count ?? 0
        if (currentCount > targetPerProject) {
            throw new Error(`${projectName} already has ${currentCount} Interns; expected no more than ${targetPerProject}.`)
        }
        const needed = targetPerProject - currentCount
        const tasks = db.prepare("SELECT id FROM task WHERE project_id = ? ORDER BY title").all(project.id)
        if (needed > 0 && tasks.length === 0) throw new Error(`No tasks exist for ${projectName}.`)
        for (const [firstName, lastName] of names.slice(0, needed)) {
            additions.push({ project, firstName, lastName, tasks })
        }
    }

    if (additions.length !== 21 - existingInternCount) {
        throw new Error(`Seed plan would add ${additions.length} Interns to ${existingInternCount} existing accounts; expected exactly 21 total.`)
    }

    const passwordHash = await hashPassword(randomBytes(32).toString("base64url"))
    const insertIntern = db.prepare(`
        INSERT INTO user_account (id, first_name, last_name, student_number, email, password_hash, role, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, 'INTERN', 1)
    `)
    const insertInternship = db.prepare(`
        INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)
    `)
    const insertProjectAssignment = db.prepare(`
        INSERT INTO project_assignment (id, internship_id, project_id, assigned_at) VALUES (?, ?, ?, ?)
    `)
    const insertTaskAssignment = db.prepare(`
        INSERT INTO task_assignment (id, internship_id, task_id, assigned_by_user_id, assigned_at)
        VALUES (?, ?, ?, ?, ?)
    `)
    const insertAttendance = db.prepare(`
        INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at)
        VALUES (?, ?, ?, ?)
    `)
    const insertTaskTime = db.prepare(`
        INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at)
        VALUES (?, ?, ?, ?)
    `)

    const seedIntern = db.transaction((addition, index) => {
        const slug = `${addition.firstName}-${addition.lastName}`.toLowerCase()
        const internId = `demo-intern-${slug}`
        const internshipId = `demo-internship-${slug}`
        const projectAssignmentId = `demo-project-assignment-${slug}`
        const taskAssignmentId = `demo-task-assignment-${slug}`

        insertIntern.run(
            internId,
            addition.firstName,
            addition.lastName,
            `DEMO-${slug.toUpperCase()}`,
            `demo.${slug}@demo.invalid`,
            passwordHash
        )
        insertInternship.run(internshipId, internId, internshipStart)
        insertProjectAssignment.run(projectAssignmentId, internshipId, addition.project.id, internshipStart)
        insertTaskAssignment.run(
            taskAssignmentId,
            internshipId,
            addition.tasks[index % addition.tasks.length].id,
            supervisor.id,
            internshipStart
        )

        for (const date of attendanceDates) {
            insertAttendance.run(
                `demo-attendance-${slug}-${date}`,
                internshipId,
                `${date}T07:00:00.000Z`,
                `${date}T14:24:00.000Z`
            )
        }

        for (const date of taskDates) {
            insertTaskTime.run(
                `demo-task-time-${slug}-${date}`,
                taskAssignmentId,
                `${date}T08:00:00.000Z`,
                `${date}T10:00:00.000Z`
            )
        }
    })

    additions.forEach((addition, index) => seedIntern(addition, index))

    const foreignKeyViolations = db.pragma("foreign_key_check")
    if (foreignKeyViolations.length > 0) throw new Error("Demo cohort created foreign key violations.")

    const summary = db.prepare(`
        SELECT project.name AS projectName, COUNT(DISTINCT internship.intern_id) AS interns
        FROM project
        LEFT JOIN project_assignment ON project_assignment.project_id = project.id AND project_assignment.ended_at IS NULL
        LEFT JOIN internship ON internship.id = project_assignment.internship_id AND internship.ended_at IS NULL
        LEFT JOIN user_account ON user_account.id = internship.intern_id
            AND user_account.role = 'INTERN' AND user_account.is_enabled = 1
        WHERE project.archived_at IS NULL
        GROUP BY project.id ORDER BY project.name
    `).all()
    console.log(JSON.stringify({ addedInterns: additions.length, projects: summary }, null, 2))
}

seedDemoCohort()
    .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
    })
    .finally(() => db.close())
