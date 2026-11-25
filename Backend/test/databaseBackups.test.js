import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

test("scheduled backups support Supervisor-only configuration, deletion, restore and undo", async t => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "database-backups-test-"))
    process.env.DATABASE_PATH = path.join(tempDir, "database.sqlite")
    process.env.JWT_SECRET = "database-backups-test-secret"
    const database = await import("../src/database/db.js")
    const { ensureScheduledBackup } = await import("../src/database/backups.js")
    const { createToken } = await import("../src/security/jwt.js")
    const { trackDatabaseWork } = await import("../src/database/pendingWork.js")
    const { app } = await import("../src/app.js")
    const server = app.listen(0, "127.0.0.1")
    t.after(async () => {
        await new Promise(resolve => server.close(resolve))
        database.default.close()
        fs.rmSync(tempDir, { recursive: true, force: true })
    })
    await new Promise(resolve => server.once("listening", resolve))
    const url = `http://127.0.0.1:${server.address().port}/database-backups`
    function request(token, body, target = "/restore", method = "POST") {
        return fetch(body ? url + target : url, {
            method: body ? method : "GET",
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        })
    }

    const supervisor = { id: "supervisor", email: "supervisor@example.test", role: "SUPERVISOR" }
    const intern = { id: "intern", email: "intern@example.test", role: "INTERN" }
    const insert = database.default.prepare(`
        INSERT INTO user_account (id, first_name, last_name, email, password_hash, role)
        VALUES (?, 'Original', 'Fixture', ?, 'test-only', ?)
    `)
    insert.run(supervisor.id, supervisor.email, supervisor.role)
    insert.run(intern.id, intern.email, intern.role)
    assert.equal(database.default.pragma("journal_mode = WAL", { simple: true }), "wal")

    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T14:00:00Z") })
    ensureScheduledBackup()
    database.default.prepare("UPDATE user_account SET first_name = 'New' WHERE id = ?").run(intern.id)
    ensureScheduledBackup()
    t.mock.timers.tick(24 * 60 * 60 * 1000)
    ensureScheduledBackup()

    const originalToken = createToken(supervisor)
    const internToken = createToken(intern)
    const getBackups = async token => {
        const result = await request(token)
        assert.equal(result.status, 200)
        return (await result.json()).backups
    }
    const backups = await getBackups(originalToken)
    assert.deepEqual(backups.map(backup => backup.id).sort(), [
        "daily-2026-11-17T02_00.sqlite", "daily-2026-11-18T02_00.sqlite"
    ])
    const restorePoint = { id: "daily-2026-11-17T02_00.sqlite" }
    assert.equal((await request()).status, 401)
    assert.equal((await request(internToken)).status, 403)
    assert.equal((await request(internToken, restorePoint)).status, 403)
    database.default.prepare("UPDATE user_account SET is_enabled = 0 WHERE id = ?").run(supervisor.id)
    assert.equal((await request(originalToken, restorePoint)).status, 403)
    database.default.prepare("UPDATE user_account SET is_enabled = 1 WHERE id = ?").run(supervisor.id)
    assert.equal((await request(originalToken, { id: "../database.sqlite" })).status, 404)

    const weekly = { frequency: "weekly", time: "18:30", weekday: 5 }
    const saveSchedule = (token, schedule) => request(token, schedule, "/schedule", "PUT")
    assert.equal((await saveSchedule(internToken, weekly)).status, 403)
    assert.equal((await saveSchedule(originalToken, { ...weekly, time: "24:00" })).status, 400)
    assert.equal((await saveSchedule(originalToken, weekly)).status, 200)
    ensureScheduledBackup()
    assert.equal((await getBackups(originalToken)).length, 2)
    t.mock.timers.setTime(new Date("2026-11-20T17:29:00Z").getTime())
    ensureScheduledBackup()
    assert.equal((await getBackups(createToken(supervisor))).length, 2)
    t.mock.timers.tick(60_000)
    ensureScheduledBackup()
    ensureScheduledBackup()
    const restoreToken = createToken(supervisor)
    assert.deepEqual((await getBackups(restoreToken)).filter(backup => backup.type === "weekly")
        .map(backup => backup.id), ["weekly-2026-11-20T18_30.sqlite"])

    const weeklyId = "weekly-2026-11-20T18_30.sqlite"
    const deleteBackup = (token, id) => fetch(`${url}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
    })
    assert.equal((await deleteBackup(createToken(intern), weeklyId)).status, 403)
    assert.equal((await deleteBackup(restoreToken, "../database.sqlite")).status, 404)
    assert.equal((await deleteBackup(restoreToken, "schedule.json")).status, 404)
    assert.equal((await deleteBackup(restoreToken, weeklyId)).status, 200)
    assert.equal(fs.existsSync(path.join(`${process.env.DATABASE_PATH}.backups`, weeklyId)), false)
    ensureScheduledBackup()
    assert.equal((await getBackups(restoreToken)).some(backup => backup.id === weeklyId), false)
    assert.equal((await request(restoreToken, { id: weeklyId })).status, 404)

    const { promise, resolve } = Promise.withResolvers()
    const inFlight = trackDatabaseWork(() => promise)()
    try {
        assert.equal((await request(restoreToken, restorePoint)).status, 409)
    } finally {
        resolve()
        await inFlight
    }

    const readName = () => database.default.prepare("SELECT first_name FROM user_account WHERE id = ?").pluck().get(intern.id)
    assert.equal((await request(restoreToken, restorePoint)).status, 200)
    assert.equal(readName(), "Original")
    assert.equal((await request(restoreToken)).status, 401)

    const nextToken = createToken(supervisor)
    assert.deepEqual((await (await request(nextToken)).json()).schedule, {
        ...weekly, timeZone: "Europe/Copenhagen"
    })
    const undo = (await getBackups(nextToken)).find(backup => backup.type === "before-restore")
    assert.ok(undo)
    assert.equal((await request(nextToken, { id: undo.id })).status, 200)
    assert.equal(readName(), "New")
    assert.equal((await request(nextToken)).status, 401)
    assert.equal((await request(originalToken)).status, 401)

    const manualToken = createToken(supervisor)
    assert.equal((await request(null, {}, "", "POST")).status, 401)
    assert.equal((await request(createToken(intern), {}, "", "POST")).status, 403)
    const first = await request(manualToken, {}, "", "POST")
    assert.equal(first.status, 201)
    const { backup: manual } = await first.json()
    assert.equal(manual.type, "manual")
    const second = await request(manualToken, {}, "", "POST")
    assert.equal(second.status, 201)
    assert.notEqual((await second.json()).backup.id, manual.id)
    assert.equal((await getBackups(manualToken)).some(backup => backup.id === manual.id), true)
    database.default.prepare("UPDATE user_account SET first_name = 'After manual backup' WHERE id = ?").run(intern.id)
    assert.equal((await request(manualToken, { id: manual.id })).status, 200)
    assert.equal(readName(), "New")
    assert.equal((await deleteBackup(createToken(supervisor), manual.id)).status, 200)
})
