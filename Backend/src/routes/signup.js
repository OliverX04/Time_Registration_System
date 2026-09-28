import express from "express"
import db from "../database/db.js"
import { hashPassword } from "../security/password.js"

export const signupRouter = express.Router()

signupRouter.post("/", async (req, res) => {
    const { firstName, lastName, email, password } = req.body

    if (!firstName || !lastName || !email || !password) {
        return res.status(400).send({
            error: "All fields are required"
        })
    }

    try {
        await createUser(firstName, lastName, email, password)

        res.send({
            message: "User created!"
        })
    } catch (err) {
        res.status(500).send({
            error: "Error signing up"
        })
    }
})

async function createUser(firstName, lastName, email, password) {
    const existingUser = db
        .prepare("SELECT * FROM user_account WHERE email = ?")
        .get(email)

    if (existingUser) {
        throw new Error("Email already registered")
    }

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

    return {
        firstName,
        lastName,
        email,
        role: "INTERN"
    }
}