export function runMigrations(db) {
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
