import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task-time-test-"))
let db
let server
let baseUrl
let createToken
let internToken
let supervisorToken
let managedInternToken
let unassignedInternToken

before(async () => {
    process.env.DATABASE_PATH = path.join(tempDir, "database.sqlite")
    process.env.JWT_SECRET = "task-time-test-secret"
    db = (await import("../src/database/db.js")).default
    createToken = (await import("../src/security/jwt.js")).createToken
    internToken = addAccount("intern", "INTERN")
    supervisorToken = addAccount("supervisor", "SUPERVISOR")
    addAccount("other-intern", "INTERN")
    managedInternToken = addAccount("managed-intern", "INTERN")
    unassignedInternToken = addAccount("unassigned-intern", "INTERN")

    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)")
        .run("internship", "intern", "2026-10-01T08:00:00.000Z")
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)")
        .run("other-internship", "other-intern", "2026-10-01T08:00:00.000Z")
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)")
        .run("managed-internship", "managed-intern", "2026-10-01T08:00:00.000Z")
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)")
        .run("unassigned-internship", "unassigned-intern", "2026-10-01T08:00:00.000Z")

    addProject("project", "Active project", null)
    addProject("archived-project", "Archived project", "2026-10-15T08:00:00.000Z")
    addProject("second-project", "Second project", null)
    addProjectAssignment("project-assignment", "internship", "project", null)
    addProjectAssignment("other-project-assignment", "other-internship", "project", null)
    addProjectAssignment("managed-project-assignment", "managed-internship", "project", null)
    addProjectAssignment("archived-project-assignment", "internship", "archived-project", "2026-10-15T08:00:00.000Z")

    addTask("task-a", "project", "Task A")
    addTask("task-b", "project", "Task B")
    addTask("task-self", "project", "Self-service task")
    addTask("archived-task", "archived-project", "Archived task")
    addTask("task-c", "second-project", "Task C")
    addTaskAssignment("assignment-a", "internship", "task-a", null)
    addTaskAssignment("assignment-b", "internship", "task-b", null)
    addTaskAssignment("ended-assignment", "internship", "task-b", "2026-10-15T08:00:00.000Z")
    addTaskAssignment("other-assignment", "other-internship", "task-a", null)
    addTaskAssignment("archived-assignment", "internship", "archived-task", null)

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

function addAccount(id, role) {
    const email = `${id}@example.com`
    db.prepare(`
        INSERT INTO user_account (id, first_name, last_name, email, password_hash, role)
        VALUES (?, 'Test', 'Account', ?, 'unused-hash', ?)
    `).run(id, email, role)
    return createToken({ id, email, role })
}

function addProject(id, name, archivedAt) {
    db.prepare(`
        INSERT INTO project (id, created_by_user_id, name, archived_at)
        VALUES (?, 'supervisor', ?, ?)
    `).run(id, name, archivedAt)
}

function addProjectAssignment(id, internshipId, projectId, endedAt) {
    db.prepare(`
        INSERT INTO project_assignment (id, internship_id, project_id, assigned_at, ended_at)
        VALUES (?, ?, ?, '2026-10-01T08:00:00.000Z', ?)
    `).run(id, internshipId, projectId, endedAt)
}

function addTask(id, projectId, title) {
    db.prepare(`
        INSERT INTO task (id, project_id, created_by_user_id, title)
        VALUES (?, ?, 'supervisor', ?)
    `).run(id, projectId, title)
}

function addTaskAssignment(id, internshipId, taskId, endedAt) {
    db.prepare(`
        INSERT INTO task_assignment (id, internship_id, task_id, assigned_at, ended_at)
        VALUES (?, ?, ?, '2026-10-01T08:00:00.000Z', ?)
    `).run(id, internshipId, taskId, endedAt)
}

function hoursFromNow(hours) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

async function request(method, route, body, token = internToken) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    if (body !== undefined) {
        headers["Content-Type"] = "application/json"
    }

    const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    })

    return { status: response.status, body: await response.json() }
}

test("task time routes require an enabled Intern", async () => {
    assert.equal((await request("GET", "/task-time/assignments", undefined, null)).status, 401)
    assert.equal((await request("GET", "/task-time/assignments", undefined, supervisorToken)).status, 403)

    db.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run("intern")
    assert.equal((await request("GET", "/task-time/assignments")).status, 403)
    db.prepare("UPDATE user_account SET is_enabled = 1 WHERE id = ?").run("intern")
})

test("an Intern sees only their active task assignments", async () => {
    const result = await request("GET", "/task-time/assignments")

    assert.equal(result.status, 200)
    assert.deepEqual(result.body.assignments.map((assignment) => assignment.id), ["assignment-a", "assignment-b"])
    assert.equal(result.body.assignments[0].projectName, "Active project")
    assert.equal(result.body.assignments[0].taskTitle, "Task A")
    assert.equal(result.body.assignments[0].internNote, "")
    assert.equal(result.body.assignments[0].canLeave, false)
})

test("task history returns task totals and entries to project Interns and Supervisors", async () => {
    db.prepare(`
        INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at)
        VALUES (?, ?, ?, ?)
    `).run("history-entry-intern", "assignment-a", "2026-10-12T09:00:00.000Z", "2026-10-12T09:30:00.000Z")
    db.prepare(`
        INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at)
        VALUES (?, ?, ?, ?)
    `).run("history-entry-other", "other-assignment", "2026-10-12T10:00:00.000Z", "2026-10-12T10:45:00.000Z")

    const internHistory = await request("GET", "/task-time/tasks/task-a/history")
    assert.equal(internHistory.status, 200)
    assert.equal(internHistory.body.task.id, "task-a")
    assert.equal(internHistory.body.totalDurationMs, 75 * 60 * 1000)
    assert.equal(internHistory.body.entries.length, 2)
    assert.deepEqual(
        internHistory.body.contributors.map(({ internId, durationMs }) => ({ internId, durationMs })),
        [
            { internId: "intern", durationMs: 30 * 60 * 1000 },
            { internId: "other-intern", durationMs: 45 * 60 * 1000 }
        ]
    )

    const supervisorHistory = await request("GET", "/task-time/tasks/task-a/history", undefined, supervisorToken)
    assert.equal(supervisorHistory.status, 200)
    assert.equal(supervisorHistory.body.entries.length, 2)

    const unassignedHistory = await request("GET", "/task-time/tasks/task-a/history", undefined, unassignedInternToken)
    assert.equal(unassignedHistory.status, 404)
})

test("an Intern can join and leave a task only in their active project", async () => {
    const joined = await request("POST", "/task-time/assignments", { taskId: "task-self" })
    assert.equal(joined.status, 201)
    assert.equal(joined.body.assignment.taskId, "task-self")
    assert.equal(joined.body.assignment.canLeave, true)

    const duplicate = await request("POST", "/task-time/assignments", { taskId: "task-self" })
    assert.equal(duplicate.status, 200)
    assert.equal(duplicate.body.assignment.id, joined.body.assignment.id)

    const outsideProject = await request("POST", "/task-time/assignments", { taskId: "task-c" })
    assert.equal(outsideProject.status, 404)

    const noted = await request("PATCH", `/task-time/assignments/${joined.body.assignment.id}/note`, {
        note: "  Implementation details  "
    })
    assert.equal(noted.status, 200)
    assert.equal(noted.body.assignment.internNote, "Implementation details")

    const cannotEditAnotherIntern = await request("PATCH", "/task-time/assignments/other-assignment/note", {
        note: "No"
    })
    assert.equal(cannotEditAnotherIntern.status, 404)

    const ended = await request("POST", `/task-time/assignments/${joined.body.assignment.id}/end`, {})
    assert.equal(ended.status, 200)
    assert.equal(typeof ended.body.assignment.endedAt, "string")
    assert.equal((await request("POST", `/task-time/assignments/${joined.body.assignment.id}/end`, {})).status, 404)
})

test("an Intern can register manual task time", async () => {
    const startedAt = hoursFromNow(-6)
    const endedAt = hoursFromNow(-5)
    const result = await request("POST", "/task-time/entries", {
        taskAssignmentId: " assignment-a ",
        startedAt,
        endedAt
    })

    assert.equal(result.status, 201)
    assert.equal(result.body.entry.taskAssignmentId, "assignment-a")
    assert.equal(result.body.entry.taskTitle, "Task A")
    assert.equal(result.body.entry.projectName, "Active project")
    assert.equal(result.body.entry.startedAt, startedAt)
    assert.equal(result.body.entry.endedAt, endedAt)
})

test("invalid task time fields do not create entries", async () => {
    const before = db.prepare("SELECT COUNT(*) AS count FROM task_time_entry").get().count

    for (const [body, field] of [
        [null, "body"],
        [{ startedAt: hoursFromNow(-2), endedAt: hoursFromNow(-1) }, "taskAssignmentId"],
        [{ taskAssignmentId: "assignment-a", startedAt: "invalid", endedAt: hoursFromNow(-1) }, "startedAt"],
        [{ taskAssignmentId: "assignment-a", startedAt: hoursFromNow(-1), endedAt: "invalid" }, "endedAt"],
        [{ taskAssignmentId: "assignment-a", startedAt: hoursFromNow(-1), endedAt: hoursFromNow(-2) }, "endedAt"],
        [{ taskAssignmentId: "assignment-a", startedAt: hoursFromNow(24), endedAt: hoursFromNow(25) }, "endedAt"]
    ]) {
        const result = await request("POST", "/task-time/entries", body)
        assert.equal(result.status, 400)
        assert.equal(typeof result.body.fieldErrors[field], "string")
    }

    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM task_time_entry").get().count, before)
})

test("an Intern cannot use another or inactive assignment", async () => {
    for (const taskAssignmentId of ["other-assignment", "ended-assignment", "archived-assignment", "missing"]) {
        const result = await request("POST", "/task-time/entries", {
            taskAssignmentId,
            startedAt: hoursFromNow(-12),
            endedAt: hoursFromNow(-11)
        })

        assert.equal(result.status, 404)
    }
})

test("task time cannot overlap the Intern's entry on another task", async () => {
    const existingStart = hoursFromNow(-3)
    const existingEnd = hoursFromNow(-2)
    db.prepare(`
        INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at)
        VALUES ('existing-entry', 'assignment-a', ?, ?)
    `).run(existingStart, existingEnd)

    const overlap = await request("POST", "/task-time/entries", {
        taskAssignmentId: "assignment-b",
        startedAt: hoursFromNow(-2.5),
        endedAt: hoursFromNow(-1.5)
    })
    assert.equal(overlap.status, 409)
    assert.match(overlap.body.error, /overlap/)

    const adjacent = await request("POST", "/task-time/entries", {
        taskAssignmentId: "assignment-b",
        startedAt: existingEnd,
        endedAt: hoursFromNow(-1)
    })
    assert.equal(adjacent.status, 201)
})

test("only Supervisors can manage task assignments", async () => {
    const denied = await request("GET", "/task-time/management/assignments", undefined, internToken)
    assert.equal(denied.status, 403)
})

test("a Supervisor assigns multiple Interns to tasks without changing project assignments", async () => {
    const missingProject = await request("POST", "/task-time/management/assignments", {
        internId: "unassigned-intern",
        taskId: "task-a"
    }, supervisorToken)
    assert.equal(missingProject.status, 409)
    assert.match(missingProject.body.error, /project/)

    const created = await request("POST", "/task-time/management/assignments", {
        internId: "managed-intern",
        taskId: "task-a"
    }, supervisorToken)

    assert.equal(created.status, 201)
    assert.equal(created.body.assignment.internId, "managed-intern")
    assert.equal(created.body.assignment.projectId, "project")
    assert.equal(created.body.assignment.taskId, "task-a")
    assert.equal(created.body.assignment.assignedByUserId, "supervisor")

    const selfRemovalDenied = await request(
        "POST",
        `/task-time/assignments/${created.body.assignment.id}/end`,
        {},
        managedInternToken
    )
    assert.equal(selfRemovalDenied.status, 403)
    assert.equal(db.prepare("SELECT ended_at FROM task_assignment WHERE id = ?").get(created.body.assignment.id).ended_at, null)
    assert.equal(db.prepare(`
        SELECT COUNT(*) AS count
        FROM task_assignment
        WHERE task_id = 'task-a' AND ended_at IS NULL
    `).get().count, 3)

    const duplicate = await request("POST", "/task-time/management/assignments", {
        internId: "managed-intern",
        taskId: "task-a"
    }, supervisorToken)
    assert.equal(duplicate.status, 200)
    assert.equal(duplicate.body.assignment.id, created.body.assignment.id)

    const secondTask = await request("POST", "/task-time/management/assignments", {
        internId: "managed-intern",
        taskId: "task-b"
    }, supervisorToken)
    assert.equal(secondTask.status, 201)
    assert.equal(db.prepare(`
        SELECT COUNT(*) AS count
        FROM project_assignment
        WHERE internship_id = 'managed-internship' AND ended_at IS NULL
    `).get().count, 1)

    const differentProject = await request("POST", "/task-time/management/assignments", {
        internId: "managed-intern",
        taskId: "task-c"
    }, supervisorToken)
    assert.equal(differentProject.status, 409)
    assert.equal(db.prepare(`
        SELECT COUNT(*) AS count
        FROM task_assignment
        WHERE internship_id = 'managed-internship' AND ended_at IS NULL
    `).get().count, 2)
    assert.equal(db.prepare(`
        SELECT project_id AS projectId
        FROM project_assignment
        WHERE internship_id = 'managed-internship' AND ended_at IS NULL
    `).get().projectId, "project")

    const listed = await request("GET", "/task-time/management/assignments", undefined, supervisorToken)
    assert.equal(listed.status, 200)
    assert.equal(listed.body.assignments.some(({ id }) => id === secondTask.body.assignment.id), true)

    const ended = await request(
        "POST",
        `/task-time/management/assignments/${secondTask.body.assignment.id}/end`,
        {},
        supervisorToken
    )
    assert.equal(ended.status, 200)
    assert.equal(typeof ended.body.assignment.endedAt, "string")
    assert.equal(db.prepare("SELECT ended_at FROM task_assignment WHERE id = ?").get(secondTask.body.assignment.id).ended_at, ended.body.assignment.endedAt)
})
