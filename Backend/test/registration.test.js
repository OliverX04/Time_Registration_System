import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import Database from "better-sqlite3"
import { hashPassword, comparePassword } from "../src/security/password.js"

const backendDir = fileURLToPath(new URL("../", import.meta.url))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "registration-test-"))
const databasePath = path.join(tempDir, "database.sqlite")
const password = "a-password-for-testing"
let db
let server
let baseUrl

before(async () => {
    const legacyDb = new Database(databasePath)
    legacyDb.exec(fs.readFileSync(path.join(backendDir, "src/database/schema.sql"), "utf8"))
    const insertLegacyAccount = legacyDb.prepare(`
        INSERT INTO user_account (id, first_name, last_name, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?, ?)
    `)
    insertLegacyAccount.run("legacy-intern", "Legacy", "Intern", " Legacy@Example.com ", await hashPassword("oldpass"), "INTERN")
    insertLegacyAccount.run("legacy-spaces", "Legacy", "Spaces", "spaces@example.com", await hashPassword(" ".repeat(15)), "INTERN")
    insertLegacyAccount.run("legacy-long", "Legacy", "Long", "long@example.com", await hashPassword("x".repeat(73)), "INTERN")
    legacyDb.close()

    process.env.DATABASE_PATH = databasePath
    process.env.JWT_SECRET = "a-separate-secret-used-only-in-tests"

    db = (await import("../src/database/db.js")).default
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

function registration(overrides = {}) {
    return {
        firstName: " Test ",
        lastName: " Intern ",
        email: "person@example.com",
        password,
        ...overrides
    }
}

async function request(route, input) {
    const response = await fetch(`${baseUrl}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
    })

    return { response, body: await response.json() }
}

test("registration trims names, normalizes email and always creates an Intern without an internship", async () => {
    const result = await request("/signup", registration({
        email: "  PERSON@Example.Com ",
        studentNumber: " 001234 ",
        role: "SUPERVISOR",
        isEnabled: false
    }))

    assert.equal(result.response.status, 201)
    const account = db.prepare("SELECT * FROM user_account WHERE email = ?").get("person@example.com")
    assert.equal(account.first_name, "Test")
    assert.equal(account.last_name, "Intern")
    assert.equal(account.student_number, null)
    assert.equal(account.role, "INTERN")
    assert.equal(account.is_enabled, 1)
    assert.notEqual(account.password_hash, password)
    assert.equal(await comparePassword(password, account.password_hash), true)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM internship WHERE intern_id = ?").get(account.id).count, 0)
})

test("email case and whitespace variants cannot create another account", async () => {
    const result = await request("/signup", registration({ email: " PERSON@EXAMPLE.COM " }))
    assert.equal(result.response.status, 409)
    assert.match(result.body.fieldErrors.email, /already registered/)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_account WHERE email = ?").get("person@example.com").count, 1)
})

test("concurrent registrations receive one success and one useful conflict response", async () => {
    const responses = await Promise.all([
        request("/signup", registration({ email: "concurrent@example.com" })),
        request("/signup", registration({ email: " CONCURRENT@EXAMPLE.COM " }))
    ])

    assert.deepEqual(responses.map(({ response }) => response.status).sort(), [201, 409])
    assert.match(responses.find(({ response }) => response.status === 409).body.fieldErrors.email, /already registered/)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_account WHERE email = ?").get("concurrent@example.com").count, 1)
})

test("invalid names, emails, passwords and body types receive field errors", async () => {
    const invalidFields = [
        ["firstName", "   "], ["firstName", 7], ["firstName", "a".repeat(101)],
        ["lastName", null], ["lastName", {}], ["lastName", "a".repeat(101)],
        ["email", 42], ["email", "wrong"], ["email", "a b@example.com"],
        ["email", `${"a".repeat(243)}@example.com`],
        ["password", 123], ["password", ""], ["password", null], ["password", {}]
    ]
    const countBefore = db.prepare("SELECT COUNT(*) AS count FROM user_account").get().count

    for (const [field, value] of invalidFields) {
        const result = await request("/signup", registration({ [field]: value }))
        assert.equal(result.response.status, 400, `${field} should be rejected`)
        assert.equal(typeof result.body.fieldErrors[field], "string")
    }

    for (const body of [null, [], {}, "text"]) {
        const result = await request("/signup", body)
        assert.equal(result.response.status, 400)
    }

    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_account").get().count, countBefore)
})

test("registration accepts nonempty passwords without strength rules and hashes them", async () => {
    const passwords = [" spaced-password ", "a", "123", " ", "é".repeat(37), "😀".repeat(19), "a".repeat(73)]

    for (const [index, value] of passwords.entries()) {
        const email = `password-${index}@example.com`
        const signup = await request("/signup", registration({ email, password: value }))
        assert.equal(signup.response.status, 201)
        const account = db.prepare("SELECT password_hash FROM user_account WHERE email = ?").get(email)
        assert.notEqual(account.password_hash, value)
        assert.equal(await comparePassword(value, account.password_hash), true)
        const login = await request("/login", { email, password: value })
        assert.equal(login.response.status, 200)
        assert.match(login.response.headers.get("Authorization"), /^Bearer /)
    }

    const trimmedLogin = await request("/login", { email: "password-0@example.com", password: "spaced-password" })
    assert.equal(trimmedLogin.response.status, 401)

})

test("login accepts normalized email and existing shorter passwords without changing account identity", async () => {
    const result = await request("/login", { email: " LEGACY@EXAMPLE.COM ", password: "oldpass" })
    assert.equal(result.response.status, 200)
    assert.equal(result.body.user.id, "legacy-intern")
    assert.equal(result.body.user.email, "legacy@example.com")
    assert.equal("password_hash" in result.body.user, false)

    const wrongPassword = await request("/login", { email: "legacy@example.com", password: "incorrect" })
    assert.equal(wrongPassword.response.status, 401)
})

test("existing whitespace-only and over-72-byte passwords can still log in", async () => {
    const accounts = [
        { email: "spaces@example.com", password: " ".repeat(15), id: "legacy-spaces" },
        { email: "long@example.com", password: "x".repeat(73), id: "legacy-long" }
    ]

    for (const account of accounts) {
        const result = await request("/login", { email: account.email, password: account.password })
        assert.equal(result.response.status, 200)
        assert.equal(result.body.user.id, account.id)
        assert.match(result.response.headers.get("Authorization"), /^Bearer /)

    }
})

test("disabled accounts and malformed login fields cannot log in", async () => {
    db.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run("legacy-intern")
    const disabled = await request("/login", { email: "legacy@example.com", password: "oldpass" })
    assert.equal(disabled.response.status, 401)

    for (const body of [null, { email: 15, password }, { email: "person@example.com", password: {} }]) {
        const result = await request("/login", body)
        assert.equal(result.response.status, 400)
        assert.equal(typeof result.body.fieldErrors, "object")
    }
})

test("invalid JSON returns a JSON error response", async () => {
    const response = await fetch(`${baseUrl}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken"
    })

    assert.equal(response.status, 400)
    assert.match(response.headers.get("Content-Type"), /application\/json/)
    assert.match((await response.json()).error, /valid JSON/)
})

test("first Supervisor setup accepts a simple password, normalizes email and is safe to repeat", async () => {
    const seedPath = path.join(backendDir, "src/database/seedSupervisor.js")
    const seedDbPath = path.join(tempDir, "seed.sqlite")
    const env = {
        ...process.env,
        DATABASE_PATH: seedDbPath,
        SUPERVISOR_FIRST_NAME: " First ",
        SUPERVISOR_LAST_NAME: " Supervisor ",
        SUPERVISOR_EMAIL: " BOSS@Example.com ",
        SUPERVISOR_PASSWORD: "a"
    }

    assert.throws(() => execFileSync(process.execPath, [seedPath], {
        cwd: backendDir, env: { ...env, SUPERVISOR_PASSWORD: "" }, stdio: "pipe"
    }), (error) => error.status === 1 && /Enter a password/.test(error.stderr.toString()))

    execFileSync(process.execPath, [seedPath], { cwd: backendDir, env, stdio: "pipe" })
    execFileSync(process.execPath, [seedPath], { cwd: backendDir, env, stdio: "pipe" })

    const seedDb = new Database(seedDbPath)
    try {
        const accounts = seedDb.prepare("SELECT first_name, last_name, email, role, student_number FROM user_account").all()
        assert.deepEqual(accounts, [{
            first_name: "First", last_name: "Supervisor", email: "boss@example.com", role: "SUPERVISOR", student_number: null
        }])
        const stored = seedDb.prepare("SELECT password_hash FROM user_account").get()
        assert.notEqual(stored.password_hash, "a")
        assert.equal(await comparePassword("a", stored.password_hash), true)
    } finally {
        seedDb.close()
    }
})
