import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "attendance-test-"))
let db
let server
let baseUrl
let createToken
let internToken
let supervisorToken

before(async () => {
    process.env.DATABASE_PATH = path.join(tempDir, "database.sqlite")
    process.env.JWT_SECRET = "attendance-test-secret"
    db = (await import("../src/database/db.js")).default
    createToken = (await import("../src/security/jwt.js")).createToken
    internToken = addAccount("intern", "INTERN")
    supervisorToken = addAccount("supervisor", "SUPERVISOR")
    addAccount("waiting", "INTERN")
    db.prepare("INSERT INTO internship (id, intern_id, started_at) VALUES (?, ?, ?)")
        .run("active-internship", "intern", "2026-10-01T08:00:00.000Z")

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

async function request(method, route, token = internToken) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const response = await fetch(`${baseUrl}${route}`, { method, headers })
    return { status: response.status, body: await response.json() }
}

test("attendance routes require an enabled Intern with an active internship", async () => {
    assert.equal((await request("GET", "/attendance/status", null)).status, 401)
    assert.equal((await request("GET", "/attendance/status", supervisorToken)).status, 403)

    const waitingToken = createToken({ id: "waiting", email: "waiting@example.com", role: "INTERN" })
    const waiting = await request("GET", "/attendance/status", waitingToken)
    assert.equal(waiting.status, 409)
    assert.match(waiting.body.error, /active internship/)

    db.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run("intern")
    assert.equal((await request("GET", "/attendance/status")).status, 403)
    db.prepare("UPDATE user_account SET is_enabled = 1 WHERE id = ?").run("intern")
})

test("an Intern can check in once and read the current status", async () => {
    const first = await request("POST", "/attendance/check-in")
    assert.equal(first.status, 201)
    assert.equal(first.body.session.internshipId, "active-internship")
    assert.equal(first.body.session.checkedOutAt, null)
    assert.equal(new Date(first.body.session.checkedInAt).toISOString(), first.body.session.checkedInAt)

    const duplicate = await request("POST", "/attendance/check-in")
    assert.equal(duplicate.status, 409)
    assert.match(duplicate.body.error, /already checked in/)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM attendance_session").get().count, 1)

    const status = await request("GET", "/attendance/status")
    assert.equal(status.status, 200)
    assert.equal(status.body.isCheckedIn, true)
    assert.equal(status.body.session.id, first.body.session.id)
})

test("an Intern can check out and register another attendance period", async () => {
    const checkout = await request("POST", "/attendance/check-out")
    assert.equal(checkout.status, 200)
    assert.ok(checkout.body.session.checkedOutAt > checkout.body.session.checkedInAt)

    const closedStatus = await request("GET", "/attendance/status")
    assert.equal(closedStatus.status, 200)
    assert.equal(closedStatus.body.isCheckedIn, false)
    assert.equal(closedStatus.body.session, null)

    const duplicateCheckout = await request("POST", "/attendance/check-out")
    assert.equal(duplicateCheckout.status, 409)
    assert.match(duplicateCheckout.body.error, /not checked in/)

    const secondCheckIn = await request("POST", "/attendance/check-in")
    assert.equal(secondCheckIn.status, 201)
    assert.notEqual(secondCheckIn.body.session.id, checkout.body.session.id)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM attendance_session").get().count, 2)
})
