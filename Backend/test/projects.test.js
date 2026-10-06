import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projects-test-"))
let db
let server
let baseUrl
let createToken
let supervisorToken
let internToken

before(async () => {
    process.env.DATABASE_PATH = path.join(tempDir, "database.sqlite")
    process.env.JWT_SECRET = "a-separate-secret-used-only-in-tests"
    db = (await import("../src/database/db.js")).default
    createToken = (await import("../src/security/jwt.js")).createToken
    supervisorToken = addAccount("supervisor", "SUPERVISOR")
    internToken = addAccount("intern", "INTERN")

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

async function request(method, route, body, token = supervisorToken) {
    const headers = {}

    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    if (body !== undefined) {
        headers["Content-Type"] = "application/json"
    }

    const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    const data = response.headers.get("Content-Type")?.includes("application/json") ? JSON.parse(text) : text
    return { status: response.status, body: data }
}

async function createProject(name) {
    const result = await request("POST", "/projects", { name, description: "Original description" })
    assert.equal(result.status, 201)
    return result.body.project
}

test("framework client errors retain their HTTP status without exposing internal details", async () => {
    const unsupportedCharset = await fetch(`${baseUrl}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=iso-8859-1" },
        body: "{}"
    })
    assert.equal(unsupportedCharset.status, 415)
    assert.deepEqual(await unsupportedCharset.json(), { error: "Invalid request." })

    const malformedPath = await request("GET", "/projects/%E0%A4%A/tasks")
    assert.equal(malformedPath.status, 400)
    assert.deepEqual(malformedPath.body, { error: "Invalid request." })
})

test("project routes require authentication and Interns cannot manage projects", async () => {
    const unauthenticated = await request("GET", "/projects", undefined, null)
    assert.equal(unauthenticated.status, 401)

    for (const [method, route, body] of [
        ["POST", "/projects", { name: "Forbidden" }],
        ["PATCH", "/projects/missing", { name: "Forbidden" }],
        ["POST", "/projects/missing/archive", {}],
        ["GET", "/projects?includeArchived=true", undefined]
    ]) {
        const result = await request(method, route, body, internToken)
        assert.equal(result.status, 403)
    }

    assert.equal((await request("GET", "/projects", undefined, internToken)).status, 200)
})

test("current account status and role override stale token permissions", async () => {
    const disabledToken = addAccount("disabled", "SUPERVISOR")
    db.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run("disabled")
    assert.equal((await request("GET", "/projects", undefined, disabledToken)).status, 403)
    assert.equal((await request("POST", "/projects", { name: "Denied" }, disabledToken)).status, 403)

    const demotedToken = addAccount("demoted", "SUPERVISOR")
    db.prepare("UPDATE user_account SET role = 'INTERN' WHERE id = ?").run("demoted")
    assert.equal((await request("POST", "/projects", { name: "Denied" }, demotedToken)).status, 403)
    assert.equal((await request("GET", "/projects?includeArchived=true", undefined, demotedToken)).status, 403)

    const deletedToken = addAccount("deleted", "SUPERVISOR")
    db.prepare("DELETE FROM user_account WHERE id = ?").run("deleted")
    assert.equal((await request("GET", "/projects", undefined, deletedToken)).status, 401)
    assert.equal((await request("POST", "/projects", { name: "Denied" }, deletedToken)).status, 401)
})

test("project creation trims values, supplies defaults and fixes the creator to the authenticated Supervisor", async () => {
    const result = await request("POST", "/projects", {
        name: "  Created project  ",
        description: "  Project description  ",
        createdByUserId: "intern",
        archivedAt: "2026-01-01T00:00:00.000Z",
        id: "chosen-id"
    })

    assert.equal(result.status, 201)
    assert.equal(result.body.project.name, "Created project")
    assert.equal(result.body.project.description, "Project description")
    assert.equal(result.body.project.createdByUserId, "supervisor")
    assert.equal(result.body.project.archivedAt, null)
    assert.equal(result.body.project.activeAssignmentCount, 0)
    assert.notEqual(result.body.project.id, "chosen-id")

    const defaultDescription = await request("POST", "/projects", { name: "No description" })
    assert.equal(defaultDescription.status, 201)
    assert.equal(defaultDescription.body.project.description, "")
})

test("invalid project input returns field errors without creating records", async () => {
    const before = db.prepare("SELECT COUNT(*) AS count FROM project").get().count

    for (const [body, field] of [
        [{ name: "  " }, "name"], [{ name: 42 }, "name"], [{ name: "a".repeat(101) }, "name"],
        [{ name: "Valid", description: null }, "description"],
        [{ name: "Valid", description: {} }, "description"],
        [{ name: "Valid", description: "x".repeat(2001) }, "description"],
        [null, "body"], [[], "name"]
    ]) {
        const result = await request("POST", "/projects", body)
        assert.equal(result.status, 400)
        assert.equal(typeof result.body.fieldErrors[field], "string")
    }

    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM project").get().count, before)
})

test("partial edits preserve omitted fields and cannot replace creator, id or archive status", async () => {
    const project = await createProject("Edit me")
    const rename = await request("PATCH", `/projects/${project.id}`, { name: "  Renamed  " })
    assert.equal(rename.status, 200)
    assert.equal(rename.body.project.name, "Renamed")
    assert.equal(rename.body.project.description, "Original description")

    const description = await request("PATCH", `/projects/${project.id}`, {
        description: " Updated ", createdByUserId: "intern", archivedAt: "2026-01-01", id: "replacement"
    })
    assert.equal(description.status, 200)
    assert.equal(description.body.project.name, "Renamed")
    assert.equal(description.body.project.description, "Updated")
    assert.equal(description.body.project.createdByUserId, "supervisor")
    assert.equal(description.body.project.archivedAt, null)
    assert.equal(description.body.project.id, project.id)

    for (const body of [{}, { archivedAt: "2026-01-01" }, { name: null }, { description: 10 }]) {
        assert.equal((await request("PATCH", `/projects/${project.id}`, body)).status, 400)
    }
})

test("unknown projects return 404 for edit, archive and task access", async () => {
    assert.equal((await request("PATCH", "/projects/missing", { name: "Name" })).status, 404)
    assert.equal((await request("POST", "/projects/missing/archive", {})).status, 404)
    assert.equal((await request("GET", "/projects/missing/tasks")).status, 404)
    assert.equal((await request("POST", "/projects/missing/tasks", { title: "Task" })).status, 404)
})

test("task creation keeps Piotr's response shape and rejects malformed values", async () => {
    const project = await createProject("Task project")
    const result = await request("POST", `/projects/${project.id}/tasks`, { title: "  Shared task  ", description: " Details ", createdByUserId: "supervisor" }, internToken)
    assert.equal(result.status, 201)
    assert.deepEqual(Object.keys(result.body.task).sort(), ["createdByUserId", "description", "id", "projectId", "title"])
    assert.equal(result.body.task.createdByUserId, "intern")
    assert.equal(result.body.task.title, "Shared task")
    assert.equal(result.body.task.description, "Details")

    for (const body of [{ title: 42 }, { title: "Valid", description: null }, { title: " " }, null, []]) {
        const invalid = await request("POST", `/projects/${project.id}/tasks`, body)
        assert.equal(invalid.status, 400)
        assert.equal(typeof invalid.body.fieldErrors, "object")
    }
})

test("active project assignments block archiving without changing assignments", async () => {
    const project = await createProject("Assigned project")
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)").run("active-internship", "intern", "2026-09-01T09:00:00Z")
    db.prepare("INSERT INTO project_assignment (id, internship_id, project_id, assigned_at) VALUES (?, ?, ?, ?)").run("active-assignment", "active-internship", project.id, "2026-09-01T09:00:00Z")
    const before = db.prepare("SELECT * FROM project_assignment WHERE id = ?").get("active-assignment")

    const result = await request("POST", `/projects/${project.id}/archive`, {})
    assert.equal(result.status, 409)
    assert.match(result.body.error, /active Intern assignments/)
    assert.equal(db.prepare("SELECT archived_at FROM project WHERE id = ?").get(project.id).archived_at, null)
    assert.deepEqual(db.prepare("SELECT * FROM project_assignment WHERE id = ?").get("active-assignment"), before)

    const listed = await request("GET", "/projects")
    assert.equal(listed.body.projects.find(({ id }) => id === project.id).activeAssignmentCount, 1)
})

test("archive preserves historical records, hides default lists and prevents edits and new tasks", async () => {
    const project = await createProject("Historical project")
    db.prepare("INSERT INTO internship (id, intern_id, started_at, ended_at, outcome) VALUES (?, ?, ?, ?, ?)").run("history-internship", "intern", "2026-08-01T09:00:00Z", "2026-09-01T12:00:00Z", "COMPLETED")
    db.prepare("INSERT INTO project_assignment (id, internship_id, project_id, assigned_at, ended_at) VALUES (?, ?, ?, ?, ?)").run("history-project-assignment", "history-internship", project.id, "2026-08-01T09:00:00Z", "2026-09-01T12:00:00Z")
    db.prepare("INSERT INTO task (id, project_id, created_by_user_id, title) VALUES (?, ?, ?, ?)").run("history-task", project.id, "supervisor", "Historical task")
    db.prepare("INSERT INTO task_assignment (id, internship_id, task_id, assigned_at, ended_at) VALUES (?, ?, ?, ?, ?)").run("history-task-assignment", "history-internship", "history-task", "2026-08-01T09:00:00Z", "2026-09-01T12:00:00Z")
    db.prepare("INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at) VALUES (?, ?, ?, ?)").run("history-work", "history-task-assignment", "2026-08-01T09:00:00Z", "2026-08-01T10:00:00Z")
    db.prepare("INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at) VALUES (?, ?, ?, ?)").run("history-attendance", "history-internship", "2026-08-01T09:00:00Z", "2026-08-01T12:00:00Z")
    const tables = ["user_account", "internship", "project_assignment", "task", "task_assignment", "task_time_entry", "attendance_session"]
    const before = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]))

    const result = await request("POST", `/projects/${project.id}/archive`, {})
    assert.equal(result.status, 200)
    assert.equal(new Date(result.body.project.archivedAt).toISOString(), result.body.project.archivedAt)
    assert.equal(result.body.project.id, project.id)
    assert.equal(result.body.project.name, project.name)
    assert.equal(result.body.project.description, project.description)
    assert.equal(result.body.project.createdByUserId, project.createdByUserId)
    assert.deepEqual(Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])), before)

    const repeat = await request("POST", `/projects/${project.id}/archive`, {})
    assert.equal(repeat.status, 200)
    assert.equal(repeat.body.project.archivedAt, result.body.project.archivedAt)

    const active = await request("GET", "/projects")
    assert.equal(active.body.projects.some(({ id }) => id === project.id), false)
    const all = await request("GET", "/projects?includeArchived=true")
    assert.equal(all.body.projects.some(({ id }) => id === project.id), true)

    assert.equal((await request("PATCH", `/projects/${project.id}`, { name: "Changed" })).status, 409)
    assert.equal((await request("POST", `/projects/${project.id}/tasks`, { title: "New task" })).status, 409)
    assert.equal((await request("GET", `/projects/${project.id}/tasks`)).body.tasks[0].id, "history-task")
    assert.equal((await request("GET", `/projects/${project.id}/tasks`, undefined, internToken)).status, 200)
    assert.deepEqual(db.pragma("foreign_key_check"), [])
})
