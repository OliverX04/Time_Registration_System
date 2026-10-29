import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "statistics-test-"))
let db
let server
let baseUrl
let internToken
let otherInternToken
let supervisorToken

before(async () => {
    process.env.DATABASE_PATH = path.join(tempDir, "database.sqlite")
    process.env.JWT_SECRET = "statistics-test-secret"
    db = (await import("../src/database/db.js")).default
    const { createToken } = await import("../src/security/jwt.js")

    internToken = addAccount("intern", "INTERN", createToken)
    otherInternToken = addAccount("other-intern", "INTERN", createToken)
    supervisorToken = addAccount("supervisor", "SUPERVISOR", createToken)
    db.prepare("UPDATE user_account SET expected_weekly_hours = 20 WHERE id = 'intern'").run()
    db.prepare("UPDATE user_account SET expected_weekly_hours = 10 WHERE id = 'other-intern'").run()

    addInternship("internship", "intern")
    addInternship("other-internship", "other-intern")
    addProject("project", "Project")
    addProject("other-project", "Other project")
    addProjectAssignment("project-assignment", "internship", "project")
    addProjectAssignment("other-project-assignment", "other-internship", "other-project")
    addTask("task", "project", "Task")
    addTask("other-task", "other-project", "Other task")
    addTaskAssignment("task-assignment", "internship", "task")
    addTaskAssignment("other-task-assignment", "other-internship", "other-task")

    db.prepare(`
        INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at)
        VALUES
            ('attendance', 'internship', '2026-10-19T23:00:00.000Z', '2026-10-20T01:00:00.000Z'),
            ('other-attendance', 'other-internship', '2026-10-20T09:00:00.000Z', '2026-10-20T10:00:00.000Z'),
            ('open-attendance', 'internship', '2026-10-20T11:00:00.000Z', NULL)
    `).run()
    db.prepare(`
        INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at)
        VALUES
            ('entry', 'task-assignment', '2026-10-19T23:30:00.000Z', '2026-10-20T01:30:00.000Z'),
            ('other-entry', 'other-task-assignment', '2026-10-20T09:00:00.000Z', '2026-10-20T10:30:00.000Z'),
            ('open-entry', 'task-assignment', '2026-10-20T12:00:00.000Z', NULL)
    `).run()

    const { app } = await import("../src/app.js")
    server = app.listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
    db?.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
})

function addAccount(id, role, createToken) {
    const email = `${id}@example.com`
    db.prepare(`
        INSERT INTO user_account (id, first_name, last_name, email, password_hash, role)
        VALUES (?, ?, 'Tester', ?, 'unused-hash', ?)
    `).run(id, id === "other-intern" ? "Other" : id, email, role)
    return createToken({ id, email, role })
}

function addInternship(id, internId) {
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, '2026-10-01T00:00:00.000Z')")
        .run(id, internId)
}

function addProject(id, name) {
    db.prepare("INSERT INTO project (id, created_by_user_id, name) VALUES (?, 'supervisor', ?)").run(id, name)
}

function addProjectAssignment(id, internshipId, projectId) {
    db.prepare(`
        INSERT INTO project_assignment (id, internship_id, project_id, assigned_at)
        VALUES (?, ?, ?, '2026-10-01T00:00:00.000Z')
    `).run(id, internshipId, projectId)
}

function addTask(id, projectId, title) {
    db.prepare("INSERT INTO task (id, project_id, title) VALUES (?, ?, ?)").run(id, projectId, title)
}

function addTaskAssignment(id, internshipId, taskId) {
    db.prepare(`
        INSERT INTO task_assignment (id, internship_id, task_id, assigned_at)
        VALUES (?, ?, ?, '2026-10-01T00:00:00.000Z')
    `).run(id, internshipId, taskId)
}

async function request(route, token = null, method = "GET", body = undefined) {
    return fetch(`${baseUrl}${route}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    })
}

test("statistics are role-protected and Intern statistics are limited to the signed-in Intern", async () => {
    assert.equal((await request("/statistics/me")).status, 401)
    assert.equal((await request("/statistics/me", supervisorToken)).status, 403)
    assert.equal((await request("/statistics", internToken)).status, 403)

    const response = await request("/statistics/me?startDate=2026-10-19&endDate=2026-10-20", internToken)
    assert.equal(response.status, 200, await response.clone().text())
    const result = await response.json()
    assert.deepEqual(result.totals, {
        attendanceDurationMs: 2 * 60 * 60 * 1000,
        expectedPresenceDurationMs: 8 * 60 * 60 * 1000,
        attendanceDifferenceMs: -6 * 60 * 60 * 1000,
        taskDurationMs: 2 * 60 * 60 * 1000
    })
    assert.equal(result.byIntern.length, 1)
    assert.equal(result.byIntern[0].internId, "intern")
    assert.equal(result.byProject.length, 1)
    assert.equal(result.byProject[0].id, "project")
})

test("Supervisor statistics split entries over UTC days and group day, week, month, intern, project and task", async () => {
    const response = await request("/statistics?startDate=2026-10-19&endDate=2026-10-20", supervisorToken)
    assert.equal(response.status, 200, await response.clone().text())
    const result = await response.json()

    assert.deepEqual(result.totals, {
        attendanceDurationMs: 3 * 60 * 60 * 1000,
        expectedPresenceDurationMs: 12 * 60 * 60 * 1000,
        attendanceDifferenceMs: -9 * 60 * 60 * 1000,
        taskDurationMs: 3.5 * 60 * 60 * 1000
    })
    assert.deepEqual(result.byDay, [
        { date: "2026-10-19", attendanceDurationMs: 60 * 60 * 1000, taskDurationMs: 30 * 60 * 1000, expectedPresenceDurationMs: 6 * 60 * 60 * 1000, attendanceDifferenceMs: -5 * 60 * 60 * 1000 },
        { date: "2026-10-20", attendanceDurationMs: 2 * 60 * 60 * 1000, taskDurationMs: 3 * 60 * 60 * 1000, expectedPresenceDurationMs: 6 * 60 * 60 * 1000, attendanceDifferenceMs: -4 * 60 * 60 * 1000 }
    ])
    assert.deepEqual(result.byWeek, [
        { weekStarting: "2026-10-19", attendanceDurationMs: 3 * 60 * 60 * 1000, taskDurationMs: 3.5 * 60 * 60 * 1000, expectedPresenceDurationMs: 12 * 60 * 60 * 1000, attendanceDifferenceMs: -9 * 60 * 60 * 1000 }
    ])
    assert.deepEqual(result.byMonth, [
        { month: "2026-10", attendanceDurationMs: 3 * 60 * 60 * 1000, taskDurationMs: 3.5 * 60 * 60 * 1000, expectedPresenceDurationMs: 12 * 60 * 60 * 1000, attendanceDifferenceMs: -9 * 60 * 60 * 1000 }
    ])
    assert.deepEqual(result.byIntern.map((item) => item.internId), ["intern", "other-intern"])
    assert.equal(result.byProject.length, 2)
    assert.equal(result.byTask.length, 2)
})

test("Supervisor filters date range, Intern and project without exposing unrelated task records", async () => {
    const query = new URLSearchParams({
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        internId: "intern",
        projectId: "project"
    })
    const response = await request(`/statistics?${query}`, supervisorToken)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(result.totals, {
        attendanceDurationMs: 60 * 60 * 1000,
        expectedPresenceDurationMs: 4 * 60 * 60 * 1000,
        attendanceDifferenceMs: -3 * 60 * 60 * 1000,
        taskDurationMs: 90 * 60 * 1000
    })
    assert.deepEqual(result.byDay, [
        { date: "2026-10-20", attendanceDurationMs: 60 * 60 * 1000, taskDurationMs: 90 * 60 * 1000, expectedPresenceDurationMs: 4 * 60 * 60 * 1000, attendanceDifferenceMs: -3 * 60 * 60 * 1000 }
    ])
    assert.equal(result.byIntern.length, 1)
    assert.equal(result.byProject[0].id, "project")
    assert.equal(result.byTask[0].id, "task")
})

test("statistics apply date ranges and period boundaries in the requested time zone", async () => {
    const query = new URLSearchParams({
        startDate: "2026-10-20",
        endDate: "2026-10-20",
        internId: "intern",
        timeZone: "Europe/Copenhagen"
    })
    const response = await request(`/statistics?${query}`, supervisorToken)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.timeZone, "Europe/Copenhagen")
    assert.deepEqual(result.byDay, [
        {
            date: "2026-10-20",
            attendanceDurationMs: 2 * 60 * 60 * 1000,
            taskDurationMs: 2 * 60 * 60 * 1000,
            expectedPresenceDurationMs: 4 * 60 * 60 * 1000,
            attendanceDifferenceMs: -2 * 60 * 60 * 1000
        }
    ])
})

test("Supervisor can configure expected weekly hours and working days for an Intern", async () => {
    const response = await request("/internships/intern/statistics-settings", supervisorToken, "PATCH", {
        expectedWeeklyHours: 30,
        workingDays: [1, 2, 3]
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { expectedWeeklyHours: 30, workingDays: [1, 2, 3] })

    assert.equal((await request("/internships/intern/statistics-settings", supervisorToken, "PATCH", {
        expectedWeeklyHours: 0,
        workingDays: []
    })).status, 400)
    assert.equal((await request("/internships/intern/statistics-settings", supervisorToken, "PATCH", {
        expectedWeeklyHours: null,
        workingDays: [1, 2, 3, 4, 5]
    })).status, 400)
    assert.equal((await request("/internships/intern/statistics-settings", internToken, "PATCH", {
        expectedWeeklyHours: 30,
        workingDays: [1, 2, 3]
    })).status, 403)

    await request("/internships/intern/statistics-settings", supervisorToken, "PATCH", {
        expectedWeeklyHours: 20,
        workingDays: [1, 2, 3, 4, 5]
    })
})

test("expected presence targets 100 internship workdays while actual presence keeps counting", async () => {
    addAccount("long-intern", "INTERN", () => "unused")
    db.prepare(`
        INSERT INTO internship (id, intern_id, started_at, ended_at)
        VALUES ('long-internship', 'long-intern', '2025-01-01T00:00:00.000Z', '2025-12-31T23:59:59.000Z')
    `).run()
    const insertAttendance = db.prepare(`
        INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at)
        VALUES (?, 'long-internship', ?, ?)
    `)
    let date = new Date("2025-01-01T00:00:00.000Z")
    let workdayCount = 0
    while (workdayCount < 101) {
        if (date.getUTCDay() >= 1 && date.getUTCDay() <= 5) {
            const day = date.toISOString().slice(0, 10)
            insertAttendance.run(
                `long-attendance-${workdayCount + 1}`,
                `${day}T08:00:00.000Z`,
                `${day}T15:24:00.000Z`
            )
            workdayCount += 1
        }
        date.setUTCDate(date.getUTCDate() + 1)
    }

    const query = new URLSearchParams({
        internId: "long-intern",
        startDate: "2025-01-01",
        endDate: "2025-12-31"
    })
    const response = await request(`/statistics?${query}`, supervisorToken)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.totals.expectedPresenceDurationMs, 740 * 60 * 60 * 1000)
    assert.equal(result.totals.attendanceDurationMs, 101 * 26_640_000)
    assert.equal(result.totals.attendanceDifferenceMs, 7.4 * 60 * 60 * 1000)
    assert.equal(result.byDay.length, 101)
    assert.ok(result.byDay.slice(0, 100).every((day) => day.expectedPresenceDurationMs === 7.4 * 60 * 60 * 1000))
    assert.equal(result.byDay[100].expectedPresenceDurationMs, 0)
    assert.equal(result.byDay[100].attendanceDurationMs, 26_640_000)
})

test("invalid ranges and unknown Supervisor filters return useful errors", async () => {
    assert.equal((await request("/statistics?startDate=2026-02-30", supervisorToken)).status, 400)
    assert.equal((await request("/statistics?startDate=2026-10-21&endDate=2026-10-20", supervisorToken)).status, 400)
    assert.equal((await request("/statistics?internId=missing", supervisorToken)).status, 404)
    assert.equal((await request("/statistics?projectId=missing", supervisorToken)).status, 404)
})


test("task drill-down filters task time and preserves Intern scope", async () => {
    const response = await request("/statistics?taskId=task&timeZone=UTC", supervisorToken)
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.filters.taskId, "task")
    assert.deepEqual(data.byTask.map((task) => task.id), ["task"])
    assert.equal(data.totals.taskDurationMs, 2 * 60 * 60 * 1000)
    const ownResponse = await request("/statistics/me?taskId=other-task&timeZone=UTC", internToken)
    assert.equal(ownResponse.status, 200)
    const own = await ownResponse.json()
    assert.equal(own.totals.taskDurationMs, 0)
    assert.deepEqual(own.byTask, [])
})
