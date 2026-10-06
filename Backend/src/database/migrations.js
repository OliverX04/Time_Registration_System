import { normalizeEmail } from "../validation/accounts.js"

export function runMigrations(db) {
    db.transaction(() => {
        normalizeAccountEmails(db)
        addTaskCreator(db)
        addProjectArchive(db)
    })()
}

function normalizeAccountEmails(db) {
    const accounts = db.prepare("SELECT id, email FROM user_account").all()
    const owners = new Map()

    for (const account of accounts) {
        const email = normalizeEmail(account.email)

        if (owners.has(email)) {
            throw new Error(`Email normalization stopped: accounts ${owners.get(email)} and ${account.id} share ${email}. Correct the conflicting addresses before starting the server.`)
        }

        owners.set(email, account.id)
    }

    const updateEmail = db.prepare("UPDATE user_account SET email = ? WHERE id = ?")

    for (const account of accounts) {
        const email = normalizeEmail(account.email)

        if (email !== account.email) {
            updateEmail.run(email, account.id)
        }
    }

    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_account_normalized_email
        ON user_account(lower(trim(email)))
    `)
}

function addTaskCreator(db) {
    const taskColumns = db
        .prepare("PRAGMA table_info(task)")
        .all()
        .map((column) => column.name)

    if (!taskColumns.includes("created_by_user_id")) {
        db.exec(`
            ALTER TABLE task
            ADD COLUMN created_by_user_id TEXT
            REFERENCES user_account(id)
        `)
    }

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_created_by_user_id
        ON task(created_by_user_id)
    `)
}

function addProjectArchive(db) {
    const projectColumns = db
        .prepare("PRAGMA table_info(project)")
        .all()
        .map((column) => column.name)

    if (!projectColumns.includes("archived_at")) {
        db.exec("ALTER TABLE project ADD COLUMN archived_at TEXT")
    }
}
