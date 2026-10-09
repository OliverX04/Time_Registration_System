import db from "./db.js"

function seedDevelopmentData() {
    const supervisor = db
        .prepare("SELECT id FROM user_account WHERE role = ? LIMIT 1")
        .get("SUPERVISOR")

    const creatorId = supervisor?.id

    if (!creatorId) {
        console.log("Create a supervisor before seeding development data.")
        db.close()
        return
    }

    const existingProject = db
        .prepare("SELECT id FROM project WHERE name = ?")
        .get("Demo Project")

    if (existingProject) {
        console.log("Development project already exists.")
        db.close()
        return
    }

    const insertProject = db.prepare(`
        INSERT INTO project (
            created_by_user_id,
            name,
            description
        )
        VALUES (?, ?, ?)
    `)

    const projectResult = insertProject.run(
        creatorId,
        "Demo Project",
        "Temporary project for task definition development."
    )

    const project = db
        .prepare("SELECT id FROM project WHERE rowid = ?")
        .get(projectResult.lastInsertRowid)

    const insertTask = db.prepare(`
        INSERT INTO task (
            project_id,
            created_by_user_id,
            title,
            description
        )
        VALUES (?, ?, ?, ?)
    `)

    insertTask.run(
        project.id,
        creatorId,
        "Prepare project overview",
        "Example task for development and testing."
    )

    insertTask.run(
        project.id,
        creatorId,
        "Register implementation notes",
        "Example task that can later be replaced by real project management data."
    )

    console.log("Development data seeded successfully.")
    db.close()
}

seedDevelopmentData()
