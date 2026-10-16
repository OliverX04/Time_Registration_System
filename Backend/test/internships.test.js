import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "internships-test-"))

let db
let server
let baseUrl
let createToken
let supervisorToken
let internToken

before(async () => {
    process.env.DATABASE_PATH = path.join(tempDir, "database.sqlite")
    process.env.JWT_SECRET = "internships-test-secret"

    db = (await import("../src/database/db.js")).default
    createToken = (await import("../src/security/jwt.js")).createToken

    supervisorToken = addAccount("supervisor", "SUPERVISOR")
    internToken = addAccount("intern", "INTERN")

    const { app } = await import("../src/app.js")

    server = app.listen(0, "127.0.0.1")

    await new Promise((resolve) => {
        server.once("listening", resolve)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve())
        })
    }

    db?.close()

    fs.rmSync(tempDir, {
        recursive: true,
        force: true
    })
})

function addAccount(id, role) {
    const email = `${id}@example.com`

    db.prepare(`
        INSERT INTO user_account (
            id, first_name, last_name,
            email, password_hash, role
        )
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

    return {
        status: response.status,
        body: await response.json()
    }
}


test("only Supervisors can manage internships", async () => {
    // A user without a login token cannot access the intern list
    const unauthenticated = await request("GET", "/internships", undefined, null)
    assert.equal(unauthenticated.status, 401)

    // An Intern cannot access the intern list
    const internAccess = await request("GET", "/internships", undefined, internToken)
    assert.equal(internAccess.status, 403)

    // A Supervisor can access the intern list
    const supervisorAccess = await request("GET", "/internships")
    assert.equal(supervisorAccess.status, 200)

    // The response should contain an array of interns
    assert.ok(Array.isArray(supervisorAccess.body.interns))
})


test("Supervisor can activate an intern", async () => {
    // Create a student waiting for activation
    addAccount("student1", "INTERN")

    db.prepare(
        "UPDATE user_account SET is_enabled = 0 WHERE id = ?"
    ).run("student1")

    // Supervisor activates the student
    const result = await request(
        "POST",
        "/internships/student1/activate"
    )

    assert.equal(result.status, 201)

    // Verify the account is now enabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student1")

    assert.equal(account.is_enabled, 1)

    // Verify an internship was created
    const internship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("student1")

    assert.ok(internship)
    assert.ok(internship.started_at)
    assert.equal(internship.ended_at, null)
})



test("Supervisor cannot activate an already active intern", async () => {
    // Create an intern specifically for this test
    addAccount("duplicate-intern", "INTERN")

    // Activate the intern for the first time
    const firstActivation = await request(
        "POST",
        "/internships/duplicate-intern/activate"
    )

    assert.equal(firstActivation.status, 201)

    // Try to activate the same intern again
    const secondActivation = await request(
        "POST",
        "/internships/duplicate-intern/activate"
    )

    assert.equal(secondActivation.status, 409)

    // Verify there is still only one active internship
    const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM internship
        WHERE intern_id = ? AND ended_at IS NULL
    `).get("duplicate-intern")

    assert.equal(count.count, 1)
})



test("Supervisor can deactivate an intern and preserve internship history", async () => {
    // Create an intern specifically for this test
    addAccount("student2", "INTERN")

    // Activate the intern first
    const activation = await request(
        "POST",
        "/internships/student2/activate"
    )

    assert.equal(activation.status, 201)

    // Supervisor deactivates the intern
    const result = await request(
        "POST",
        "/internships/student2/deactivate",
        { outcome: "COMPLETED" }
    )

    assert.equal(result.status, 200)

    // Check that the account is disabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student2")

    assert.equal(account.is_enabled, 0)

    // Check that the internship history is preserved
    const internship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("student2")

    assert.ok(internship)
    assert.ok(internship.ended_at)
    assert.equal(internship.outcome, "COMPLETED")
})


test("Supervisor cannot deactivate an intern who is still checked in", async () => {
    // Create and activate an intern
    const token = addAccount("student3", "INTERN")

    const activation = await request(
        "POST",
        "/internships/student3/activate"
    )

    assert.equal(activation.status, 201)

    // Intern checks in but does not check out
    const checkIn = await request(
        "POST",
        "/attendance/check-in",
        undefined,
        token
    )

    assert.equal(checkIn.status, 201)

    // Supervisor attempts to deactivate the intern
    const result = await request(
        "POST",
        "/internships/student3/deactivate",
        { outcome: "COMPLETED" }
    )

    // Deactivation should be rejected
    assert.equal(result.status, 409)

    // Check that the intern is still enabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student3")

    assert.equal(account.is_enabled, 1)

    // Check that the internship is still active
    const internship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("student3")

    assert.equal(internship.ended_at, null)
})



test("Supervisor can deactivate an intern after checkout", async () => {
    // Create an intern specifically for this test
    const token = addAccount("checkout-intern", "INTERN")

    // Activate the intern
    const activation = await request(
        "POST",
        "/internships/checkout-intern/activate"
    )

    assert.equal(activation.status, 201)

    // Intern checks in
    const checkIn = await request(
        "POST",
        "/attendance/check-in",
        undefined,
        token
    )

    assert.equal(checkIn.status, 201)

    // Intern checks out
    const checkOut = await request(
        "POST",
        "/attendance/check-out",
        undefined,
        token
    )

    assert.equal(checkOut.status, 200)

    // Supervisor deactivates the intern
    const result = await request(
        "POST",
        "/internships/checkout-intern/deactivate",
        { outcome: "COMPLETED" }
    )

    assert.equal(result.status, 200)

    // Verify the account is disabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("checkout-intern")

    assert.equal(account.is_enabled, 0)

    // Verify the internship has ended
    const internship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("checkout-intern")

    assert.ok(internship.ended_at)
    assert.equal(internship.outcome, "COMPLETED")
})


test("Reactivating an intern creates a new internship and preserves history", async () => {
    // Create and activate an intern
    addAccount("student4", "INTERN")

    const firstActivation = await request(
        "POST",
        "/internships/student4/activate"
    )

    assert.equal(firstActivation.status, 201)

    // Save the ID of the first internship
    const firstInternship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("student4")

    // End the first internship
    const deactivation = await request(
        "POST",
        "/internships/student4/deactivate",
        { outcome: "COMPLETED" }
    )

    assert.equal(deactivation.status, 200)

    // Reactivate the same intern
    const secondActivation = await request(
        "POST",
        "/internships/student4/activate"
    )

    assert.equal(secondActivation.status, 201)

    // Retrieve both internship records
    const internships = db.prepare(`
        SELECT * FROM internship
        WHERE intern_id = ?
        ORDER BY rowid
    `).all("student4")

    // There should now be two different internships
    assert.equal(internships.length, 2)
    assert.notEqual(internships[0].id, internships[1].id)

    // The first internship must remain completed
    assert.equal(internships[0].id, firstInternship.id)
    assert.ok(internships[0].ended_at)
    assert.equal(internships[0].outcome, "COMPLETED")

    // The second internship must be active
    assert.equal(internships[1].ended_at, null)
    assert.ok(internships[1].started_at)

    // The intern should be enabled again
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student4")

    assert.equal(account.is_enabled, 1)
})


test("Interns cannot activate or deactivate other interns", async () => {
    // Create a student awaiting activation
    addAccount("student5", "INTERN")

    db.prepare(
        "UPDATE user_account SET is_enabled = 0 WHERE id = ?"
    ).run("student5")

    // An Intern tries to activate the student
    const activation = await request(
        "POST",
        "/internships/student5/activate",
        undefined,
        internToken
    )

    assert.equal(activation.status, 403)

    // An Intern tries to deactivate the student
    const deactivation = await request(
        "POST",
        "/internships/student5/deactivate",
        { outcome: "COMPLETED" },
        internToken
    )

    assert.equal(deactivation.status, 403)

    // Verify the account is still disabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student5")

    assert.equal(account.is_enabled, 0)

    // Verify no internship was created
    const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM internship
        WHERE intern_id = ?
    `).get("student5")

    assert.equal(count.count, 0)
})


test("Supervisor cannot deactivate an intern with an invalid outcome", async () => {
    // Create and activate a new intern
    addAccount("student6", "INTERN")

    const activation = await request(
        "POST",
        "/internships/student6/activate"
    )

    assert.equal(activation.status, 201)

    // Try to deactivate using an invalid outcome
    const result = await request(
        "POST",
        "/internships/student6/deactivate",
        { outcome: "UNKNOWN" }
    )

    // The backend should reject the request
    assert.equal(result.status, 400)

    // Verify the account remains enabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student6")

    assert.equal(account.is_enabled, 1)

    // Verify the internship remains active
    const internship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("student6")

    assert.equal(internship.ended_at, null)
    assert.equal(internship.outcome, null)
})


test("Supervisor cannot deactivate an intern with an unfinished task timer", async () => {
    // Create and activate an intern
    addAccount("student7", "INTERN")

    const activation = await request(
        "POST",
        "/internships/student7/activate"
    )

    assert.equal(activation.status, 201)

    // Find the new internship
    const internship = db.prepare(
        "SELECT * FROM internship WHERE intern_id = ?"
    ).get("student7")

    // Create a project
    db.prepare(`
        INSERT INTO project (id, created_by_user_id, name)
        VALUES (?, ?, ?)
    `).run("test-project", "supervisor", "Test Project")

    // Create a task belonging to the project
    db.prepare(`
        INSERT INTO task (id, project_id, title)
        VALUES (?, ?, ?)
    `).run("test-task", "test-project", "Test Task")

    // Assign the task to the intern
    db.prepare(`
        INSERT INTO task_assignment (
            id, internship_id, task_id, assigned_at
        )
        VALUES (?, ?, ?, ?)
    `).run(
        "test-assignment",
        internship.id,
        "test-task",
        "2026-10-01T08:00:00.000Z"
    )

    // Start a task timer without stopping it
    db.prepare(`
        INSERT INTO task_time_entry (
            id, task_assignment_id, started_at
        )
        VALUES (?, ?, ?)
    `).run(
        "test-timer",
        "test-assignment",
        "2026-10-01T09:00:00.000Z"
    )

    // Supervisor attempts to deactivate the intern
    const result = await request(
        "POST",
        "/internships/student7/deactivate",
        { outcome: "COMPLETED" }
    )

    // Deactivation should be rejected
    assert.equal(result.status, 409)

    // Verify the account remains enabled
    const account = db.prepare(
        "SELECT is_enabled FROM user_account WHERE id = ?"
    ).get("student7")

    assert.equal(account.is_enabled, 1)

    // Verify the internship is still active
    const updatedInternship = db.prepare(
        "SELECT * FROM internship WHERE id = ?"
    ).get(internship.id)

    assert.equal(updatedInternship.ended_at, null)

    // Verify the task timer remains unfinished
    const timer = db.prepare(
        "SELECT * FROM task_time_entry WHERE id = ?"
    ).get("test-timer")

    assert.equal(timer.ended_at, null)
})

