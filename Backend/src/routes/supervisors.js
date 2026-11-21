import express from "express"
import db from "../database/db.js"
import { requireAuth } from "../security/requireAuth.js"
import { hashPassword } from "../security/password.js"
import { validateRegistration } from "../validation/accounts.js"

export const supervisorsRouter = express.Router()

supervisorsRouter.use(requireAuth)

function requireSupervisor(req, res, next) {
    if (typeof req.user?.id !== "string") {
        return res.status(401).send({ error: "Unauthorized" })
    }

    const user = db.prepare(
        "SELECT role, is_enabled FROM user_account WHERE id = ?"
    ).get(req.user.id)

    if (!user || !user.is_enabled || user.role !== "SUPERVISOR") {
        return res.status(403).send({
            error: "Only active Supervisors can register other Supervisors."
        })
    }

    next()
}
supervisorsRouter.post("/", requireSupervisor, async (req, res) => {
    const { values, fieldErrors } = validateRegistration(req.body)

    if (Object.keys(fieldErrors).length > 0) {
        return res.status(400).send({
            error: "Please correct the registration fields.",
            fieldErrors
        })
    }

    const existingUser = db.prepare(
        "SELECT id FROM user_account WHERE email = ?"
    ).get(values.email)

    if (existingUser) {
        return res.status(409).send({
            error: "An account with this email already exists.",
            fieldErrors: {
                email: "This email address is already registered."
            }
        })
    }

    try {
        const passwordHash = await hashPassword(values.password)

        db.prepare(`
            INSERT INTO user_account (
                first_name,
                last_name,
                email,
                password_hash,
                role,
                is_enabled
            )
            VALUES (?, ?, ?, ?, 'SUPERVISOR', 1)
        `).run(
            values.firstName,
            values.lastName,
            values.email,
            passwordHash
        )

        return res.status(201).send({
            message: "Supervisor registered successfully."
        })
    } catch (err) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).send({
                error: "An account with this email already exists.",
                fieldErrors: {
                    email: "This email address is already registered."
                }
            })
        }

        return res.status(500).send({
            error: "Could not register Supervisor."
        })
    }
})