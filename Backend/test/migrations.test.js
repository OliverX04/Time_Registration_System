import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import Database from "better-sqlite3"
import { runMigrations } from "../src/database/migrations.js"

const schema = fs.readFileSync(new URL("../src/database/schema.sql", import.meta.url), "utf8")
const legacySchema = schema.replace(/^    archived_at TEXT,\r?\n/m, "").replace(/CREATE TABLE IF NOT EXISTS task \([\s\S]*?\);/, `
    CREATE TABLE IF NOT EXISTS task (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
    );
`)

function createLegacyDatabase() {
    const db = new Database(":memory:")
    db.exec(legacySchema)
    return db
}

function insertAccount(db, id, email, role = "INTERN") {
    db.prepare(`
        INSERT INTO user_account (id, first_name, last_name, email, password_hash, role)
        VALUES (?, 'First', 'Last', ?, 'existing-password-hash', ?)
    `).run(id, email, role)
}

function records(db) {
    const tables = ["user_account", "internship", "project", "project_assignment", "task", "task_assignment", "attendance_session", "task_time_entry"]
    return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]))
}

test("migration normalizes legacy email while preserving identities, history and existing tasks", () => {
    const db = createLegacyDatabase()

    try {
        assert.equal(db.pragma("table_info(project)").some(({ name }) => name === "archived_at"), false)
        insertAccount(db, "intern", " Intern@Example.COM ")
        insertAccount(db, "supervisor", "BOSS@EXAMPLE.COM", "SUPERVISOR")
        db.exec(`
            INSERT INTO internship (id, intern_id, started_at, ended_at, outcome)
            VALUES ('internship', 'intern', '2026-09-01T09:00:00Z', '2026-10-01T12:00:00Z', 'COMPLETED');
            INSERT INTO project (id, created_by_user_id, name, description)
            VALUES ('project', 'supervisor', 'Existing project', 'Keep this');
            INSERT INTO project_assignment (id, internship_id, project_id, assigned_at, ended_at)
            VALUES ('project-assignment', 'internship', 'project', '2026-09-01T09:00:00Z', '2026-10-01T12:00:00Z');
            INSERT INTO task (id, project_id, title, description)
            VALUES ('task', 'project', 'Existing task', 'Keep this too');
            INSERT INTO task_assignment (id, internship_id, task_id, assigned_at)
            VALUES ('task-assignment', 'internship', 'task', '2026-09-01T09:00:00Z');
            INSERT INTO attendance_session (id, internship_id, checked_in_at, checked_out_at)
            VALUES ('attendance', 'internship', '2026-09-01T09:00:00Z', '2026-09-01T12:00:00Z');
            INSERT INTO task_time_entry (id, task_assignment_id, started_at, ended_at)
            VALUES ('work', 'task-assignment', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z');
        `)
        const expected = records(db)
        expected.user_account[0].email = "intern@example.com"
        expected.user_account[1].email = "boss@example.com"
        expected.task[0].created_by_user_id = null
        expected.project[0].archived_at = null

        runMigrations(db)
        assert.deepEqual(records(db), expected)
        assert.deepEqual(db.pragma("foreign_key_check"), [])

        runMigrations(db)
        assert.deepEqual(records(db), expected)

        assert.throws(() => insertAccount(db, "duplicate", " INTERN@EXAMPLE.COM "), /UNIQUE constraint failed/)
    } finally {
        db.close()
    }
})

test("canonical email collisions stop migration and leave all records and schema unchanged", () => {
    const db = createLegacyDatabase()

    try {
        insertAccount(db, "one", "Person@Example.com")
        insertAccount(db, "two", " person@example.com ")
        const before = records(db)
        const columnsBefore = db.pragma("table_info(task)")

        assert.throws(() => runMigrations(db), /Email normalization stopped: accounts one and two/)
        assert.deepEqual(records(db), before)
        assert.deepEqual(db.pragma("table_info(task)"), columnsBefore)
        assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_user_account_normalized_email'").get(), undefined)

        db.prepare("UPDATE user_account SET email = ? WHERE id = ?").run("second@example.com", "two")
        runMigrations(db)
        assert.equal(db.prepare("SELECT email FROM user_account WHERE id = ?").get("one").email, "person@example.com")
    } finally {
        db.close()
    }
})

test("a database error rolls back any email updates already performed", () => {
    const db = createLegacyDatabase()

    try {
        insertAccount(db, "one", "FIRST@EXAMPLE.COM")
        insertAccount(db, "two", "SECOND@EXAMPLE.COM")
        db.exec(`
            CREATE TRIGGER reject_second_email_update BEFORE UPDATE OF email ON user_account
            WHEN OLD.id = 'two'
            BEGIN
                SELECT RAISE(ABORT, 'Cannot update this account');
            END;
        `)
        const before = records(db)

        assert.throws(() => runMigrations(db), /Cannot update this account/)
        assert.deepEqual(records(db), before)
    } finally {
        db.close()
    }
})
