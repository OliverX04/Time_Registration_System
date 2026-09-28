import "dotenv/config"
import db from "./db.js"
import { hashPassword } from "../security/password.js"

async function seedSupervisor() {
    const firstName = process.env.SUPERVISOR_FIRST_NAME
    const lastName = process.env.SUPERVISOR_LAST_NAME
    const email = process.env.SUPERVISOR_EMAIL
    const password = process.env.SUPERVISOR_PASSWORD

    if (!firstName || !lastName || !email || !password) {
        console.log("Supervisor information is missing in .env.")
        db.close()
        return
    }

    const existingSupervisor = db
        .prepare("SELECT * FROM user_account WHERE role = ?")
        .get("SUPERVISOR")

    if (existingSupervisor) {
        console.log("A supervisor already exists.")
        db.close()
        return
    }

    const hashedPassword = await hashPassword(password)

    const insertSupervisor = db.prepare(`
        INSERT INTO user_account (
            first_name,
            last_name,
            email,
            password_hash,
            role
        )
        VALUES (?, ?, ?, ?, ?)
    `)

    insertSupervisor.run(
        firstName,
        lastName,
        email,
        hashedPassword,
        "SUPERVISOR"
    )

    console.log("First supervisor created successfully.")

    db.close()
}

seedSupervisor()