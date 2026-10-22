import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-assignments-test-"))
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

function activeIntern(id) {
    const token = addAccount(id, "INTERN")
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)")
        .run(id, id, "2026-01-01T00:00:00.000Z")
    return token
}

function assign(internId, projectId, token = supervisorToken) {
    return request("PUT", `/internships/${internId}/project-assignment`, { projectId }, token)
}

function end(internId, token = supervisorToken) {
    return request("POST", `/internships/${internId}/project-assignment/end`, undefined, token)
}

function history(internId) {
    return db.prepare("SELECT * FROM project_assignment WHERE internship_id = ? ORDER BY rowid").all(internId)
}

test("assign, change and end preserve history and restrict Intern project and task access", async () => {
    const token = activeIntern("lifecycle")
    const first = await createProject("First")
    const second = await createProject("Second")
    const task = (await request("POST", `/projects/${first.id}/tasks`, { title: "Old task" })).body.task
    assert.equal((await assign("lifecycle", first.id)).status, 201)
    const original = history("lifecycle")[0]
    const joined = await request("POST", "/task-time/assignments", { taskId: task.id }, token)
    assert.equal(joined.status, 201)
    assert.deepEqual((await request("GET", "/projects", undefined, token)).body.projects.map(p => p.id), [first.id])
    const listed = (await request("GET", "/internships")).body.interns.find(i => i.id === "lifecycle")
    assert.equal(listed.currentProjectId, first.id)
    assert.equal(listed.currentProjectName, first.name)
    assert.equal((await assign("lifecycle", first.id)).status, 200)
    assert.deepEqual(history("lifecycle"), [original])
    assert.equal((await assign("lifecycle", second.id)).status, 200)
    const changed = history("lifecycle")
    assert.equal(changed.length, 2)
    assert.deepEqual(changed[0], { ...original, ended_at: changed[1].assigned_at })
    assert.equal(changed[1].ended_at, null)
    assert.equal(db.prepare("SELECT ended_at FROM task_assignment WHERE id = ?").get(joined.body.assignment.id).ended_at, changed[0].ended_at)
    assert.deepEqual((await request("GET", "/projects", undefined, token)).body.projects.map(p => p.id), [second.id])
    for (const [method, route, body] of [
        ["GET", `/projects/${first.id}/tasks`],
        ["POST", `/projects/${first.id}/tasks`, { title: "Denied" }],
        ["PATCH", `/projects/${first.id}/tasks/${task.id}`, { title: "Denied" }],
        ["GET", `/task-time/tasks/${task.id}/history`]
    ]) assert.equal((await request(method, route, body, token)).status, 404)
    assert.equal((await end("lifecycle")).status, 200)
    const ended = history("lifecycle")
    assert.ok(ended.every(a => a.ended_at !== null))
    assert.equal((await end("lifecycle")).status, 200)
    assert.deepEqual(history("lifecycle"), ended)
    assert.deepEqual((await request("GET", "/projects", undefined, token)).body.projects, [])
    assert.equal((await request("GET", `/projects/${second.id}/tasks`, undefined, token)).status, 404)
})

test("multiple Interns can share a project; repeated and concurrent requests keep one active assignment", async () => {
    activeIntern("parallel-one")
    activeIntern("parallel-two")
    const first = await createProject("Shared")
    const second = await createProject("Concurrent destination")
    const repeats = await Promise.all(Array.from({ length: 10 }, () => assign("parallel-one", first.id)))
    assert.equal(repeats.filter(r => r.status === 201).length, 1)
    assert.ok(repeats.every(r => [200, 201].includes(r.status)))
    assert.equal(history("parallel-one").length, 1)
    assert.equal((await assign("parallel-two", first.id)).status, 201)
    assert.equal((await request("GET", "/projects")).body.projects.find(p => p.id === first.id).activeAssignmentCount, 2)
    const changes = await Promise.all(Array.from({ length: 10 }, (_, i) => assign("parallel-one", i % 2 ? first.id : second.id)))
    assert.ok(changes.every(r => r.status === 200))
    assert.equal(history("parallel-one").filter(a => a.ended_at === null).length, 1)
    assert.throws(() => db.prepare("INSERT INTO project_assignment (internship_id, project_id, assigned_at) VALUES (?, ?, ?)").run("parallel-one", first.id, new Date().toISOString()), /UNIQUE constraint failed/)
    const mixed = await Promise.all([end("parallel-one"), assign("parallel-one", second.id), end("parallel-one")])
    assert.ok(mixed.every(r => [200, 201].includes(r.status)))
    assert.ok(history("parallel-one").filter(a => a.ended_at === null).length <= 1)
})

test("only currently enabled Supervisors can assign or end assignments", async () => {
    activeIntern("permissions")
    const project = await createProject("Permissions")
    const disabled = addAccount("disabled-supervisor", "SUPERVISOR")
    db.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run("disabled-supervisor")
    const demoted = addAccount("demoted-supervisor", "SUPERVISOR")
    db.prepare("UPDATE user_account SET role = 'INTERN' WHERE id = ?").run("demoted-supervisor")
    for (const [token, status] of [[null, 401], [internToken, 403], [disabled, 403], [demoted, 403]]) {
        assert.equal((await assign("permissions", project.id, token)).status, status)
        assert.equal((await end("permissions", token)).status, status)
    }
    assert.deepEqual(history("permissions"), [])
})

test("invalid Interns, inactive internships, malformed projects and archived projects leave history unchanged", async () => {
    activeIntern("validation")
    const project = await createProject("Valid")
    const archived = await createProject("Archived")
    await request("POST", `/projects/${archived.id}/archive`)
    await assign("validation", project.id)
    const before = history("validation")
    for (const value of [null, {}, [], 42, "", "   "]) {
        assert.equal((await assign("validation", value)).status, 400)
    }
    assert.equal((await assign("validation", "missing")).status, 404)
    assert.equal((await assign("validation", archived.id)).status, 409)
    for (const id of ["missing", "supervisor"]) {
        assert.equal((await assign(id, project.id)).status, 404)
        assert.equal((await end(id)).status, 404)
    }
    assert.equal((await assign("intern", project.id)).status, 409)
    activeIntern("ended-internship")
    db.prepare("UPDATE internship SET ended_at = ? WHERE id = ?").run(new Date().toISOString(), "ended-internship")
    assert.equal((await assign("ended-internship", project.id)).status, 409)
    db.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run("validation")
    assert.equal((await assign("validation", project.id)).status, 409)
    assert.equal((await end("validation")).status, 409)
    assert.deepEqual(history("validation"), before)
})

test("failed insertion rolls back ending the previous assignment", async () => {
    activeIntern("rollback")
    const first = await createProject("Rollback source")
    const second = await createProject("Rollback target")
    await assign("rollback", first.id)
    const before = history("rollback")
    db.exec(`CREATE TRIGGER reject_assignment BEFORE INSERT ON project_assignment
        WHEN NEW.internship_id = 'rollback'
        BEGIN SELECT RAISE(ABORT, 'Test failure'); END;`)
    try {
        assert.equal((await assign("rollback", second.id)).status, 500)
        assert.deepEqual(history("rollback"), before)
    } finally {
        db.exec("DROP TRIGGER reject_assignment")
    }
})

test("open task timers block changes and ending without modifying records", async () => {
    const token = activeIntern("timer")
    const first = await createProject("Timer source")
    const second = await createProject("Timer target")
    await assign("timer", first.id)
    const task = (await request("POST", `/projects/${first.id}/tasks`, { title: "Running" })).body.task
    const assignment = (await request("POST", "/task-time/assignments", { taskId: task.id }, token)).body.assignment
    db.prepare("INSERT INTO task_time_entry (task_assignment_id, started_at) VALUES (?, ?)").run(assignment.id, "2026-01-01T00:00:00.000Z")
    const before = history("timer")
    assert.equal((await assign("timer", second.id)).status, 409)
    assert.equal((await end("timer")).status, 409)
    assert.deepEqual(history("timer"), before)
    assert.equal(db.prepare("SELECT ended_at FROM task_assignment WHERE id = ?").get(assignment.id).ended_at, null)
})


