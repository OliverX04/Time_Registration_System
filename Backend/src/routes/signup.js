import express from "express"
import db from "../database/db.js"
import { hashPassword } from "../security/password.js"
import { validateRegistration } from "../validation/accounts.js"

export const signupRouter = express.Router()

signupRouter.post("/", async (req, res) => {
    const { values, fieldErrors } = validateRegistration(req.body)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({
            error: "Please correct the registration fields.",
            fieldErrors
        })
    }

    const conflict = findConflict(values)

    if (conflict) {
        return res.status(409).send(conflict)
    }

    try {
        await createUser(values)

        res.status(201).send({
            message: "User created!"
        })
    } catch (err) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
            const conflict = findConflict(values)

            if (conflict) {
                return res.status(409).send(conflict)
            }
        }

        res.status(500).send({
            error: "Error signing up"
        })
    }
})

function findConflict({ email }) {
    if (db.prepare("SELECT id FROM user_account WHERE email = ?").get(email)) {
        return {
            error: "An account with these details already exists.",
            fieldErrors: { email: "This email address is already registered." }
        }
    }

    return null
}

async function createUser({ firstName, lastName, email, password }) {
    const hashedPassword = await hashPassword(password)

    const insertUser = db.prepare(`
        INSERT INTO user_account (
            first_name,
            last_name,
            email,
            password_hash,
            role
        )
        VALUES (?, ?, ?, ?, ?)
    `)

    insertUser.run(
        firstName,
        lastName,
        email,
        hashedPassword,
        "INTERN"
    )
}
