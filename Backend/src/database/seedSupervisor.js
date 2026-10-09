import "dotenv/config"
import db from "./db.js"
import { hashPassword } from "../security/password.js"
import { validateRegistration } from "../validation/accounts.js"

async function seedSupervisor() {
    const { values, fieldErrors } = validateRegistration({
        firstName: process.env.SUPERVISOR_FIRST_NAME,
        lastName: process.env.SUPERVISOR_LAST_NAME,
        email: process.env.SUPERVISOR_EMAIL,
        password: process.env.SUPERVISOR_PASSWORD
    })

    if (Object.keys(fieldErrors).length) {
        for (const [field, message] of Object.entries(fieldErrors)) {
            console.error(`${field}: ${message}`)
        }

        process.exitCode = 1
        return
    }

    const existingSupervisor = db
        .prepare("SELECT * FROM user_account WHERE role = ?")
        .get("SUPERVISOR")

    if (existingSupervisor) {
        console.log("A supervisor already exists.")
        return
    }

    if (db.prepare("SELECT id FROM user_account WHERE email = ?").get(values.email)) {
        console.error("Supervisor email is already registered to another account.")
        process.exitCode = 1
        return
    }

    const hashedPassword = await hashPassword(values.password)

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
        values.firstName,
        values.lastName,
        values.email,
        hashedPassword,
        "SUPERVISOR"
    )

    console.log("First supervisor created successfully.")
}

seedSupervisor()
    .catch(() => {
        console.error("Could not create the first supervisor.")
        process.exitCode = 1
    })
    .finally(() => db.close())
