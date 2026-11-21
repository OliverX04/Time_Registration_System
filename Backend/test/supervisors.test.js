
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { hashPassword, comparePassword } from "../src/security/password.js"

const backendDir = fileURLToPath(new URL("../", import.meta.url))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "supervisors-test-"))
const databasePath = path.join(tempDir, "database.sqlite")
const password = "test-password"

let db
let server
let baseUrl
let supervisorToken
let internToken

before(async () => {
    process.env.DATABASE_PATH = databasePath
    process.env.JWT_SECRET = "supervisor-tests-only-secret"

    db = (await import("../src/database/db.js")).default
    const { app } = await import("../src/app.js")

    const insertAccount = db.prepare(`
        INSERT INTO user_account (
            first_name, last_name, email, password_hash, role, is_enabled
        ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    const passwordHash = await hashPassword(password)

    insertAccount.run(
        "Existing", "Supervisor", "existing@example.com",
        passwordHash, "SUPERVISOR", 1
    )

    insertAccount.run(
        "Test", "Intern", "intern@example.com",
        passwordHash, "INTERN", 1
    )

    server = app.listen(0, "127.0.0.1")
    await new Promise(resolve => server.once("listening", resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const supervisorLogin = await request("/login", {
        email: "existing@example.com", password
    })
    supervisorToken = supervisorLogin.response.headers.get("Authorization")

    const internLogin = await request("/login", {
        email: "intern@example.com", password
    })
    internToken = internLogin.response.headers.get("Authorization")
})

after(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve))
    }
    db?.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
})

async function request(route, input, authorization) {
    const response = await fetch(`${baseUrl}${route}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(authorization && { Authorization: authorization })
        },
        body: JSON.stringify(input)
    })

    return { response, body: await response.json() }
}

function registration(email = "new-supervisor@example.com") {
    return {
        firstName: "New",
        lastName: "Supervisor",
        email,
        password
    }
}

test("unauthenticated users cannot register Supervisors", async () => {
    const result = await request("/supervisors", registration())
    assert.equal(result.response.status, 401)
})

test("Interns cannot register Supervisors", async () => {
    const result = await request("/supervisors", registration(), internToken)
    assert.equal(result.response.status, 403)
})

test("an existing Supervisor can register another Supervisor", async () => {
    const result = await request(
        "/supervisors",
        registration(" NEW-SUPERVISOR@Example.com "),
        supervisorToken
    )

    assert.equal(result.response.status, 201)

    const account = db.prepare(
        "SELECT * FROM user_account WHERE email = ?"
    ).get("new-supervisor@example.com")

    assert.ok(account)
    assert.equal(account.first_name, "New")
    assert.equal(account.last_name, "Supervisor")
    assert.equal(account.role, "SUPERVISOR")
    assert.equal(account.is_enabled, 1)
    assert.notEqual(account.password_hash, password)
    assert.equal(await comparePassword(password, account.password_hash), true)

    const login = await request("/login", {
        email: "new-supervisor@example.com",
        password
    })

    assert.equal(login.response.status, 200)
    assert.equal(login.body.user.role, "SUPERVISOR")
})

test("duplicate Supervisor emails are rejected", async () => {
    const result = await request(
        "/supervisors",
        registration("NEW-SUPERVISOR@example.com"),
        supervisorToken
    )

    assert.equal(result.response.status, 409)
})

test("disabled Supervisors cannot register another Supervisor", async () => {
    db.prepare(
        "UPDATE user_account SET is_enabled = 0 WHERE email = ?"
    ).run("existing@example.com")

    const result = await request(
        "/supervisors",
        registration("another@example.com"),
        supervisorToken
    )

    assert.equal(result.response.status, 403)
})
