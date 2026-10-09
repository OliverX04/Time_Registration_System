import express from "express"
import db from "../database/db.js"
import { comparePassword } from "../security/password.js"
import { createToken } from "../security/jwt.js"
import { validateLogin } from "../validation/accounts.js"

export const loginRouter = express.Router()

loginRouter.post("/", async (req, res) => {
    const { values, fieldErrors } = validateLogin(req.body)

    if (Object.keys(fieldErrors).length) {
        return res.status(400).send({
            error: "Please enter your email and password.",
            fieldErrors
        })
    }

    try {
        const user = await authenticateUser(values.email, values.password)

        if (!user) {
            return res.status(401).send({ error: "Unauthorized" })
        }

        const token = createToken(user)

        res
            .set("Authorization", `Bearer ${token}`)
            .status(200)
            .send({
                user: {
                    id: user.id,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    email: user.email,
                    role: user.role
                }
            })
    } catch (err) {
        res.status(500).send({
            error: "Error logging in"
        })
    }
})

async function authenticateUser(email, password) {
    const user = db
        .prepare("SELECT * FROM user_account WHERE email = ?")
        .get(email)

    if (!user) {
        return null
    }

    if (!user.is_enabled) {
        return null
    }

    const passwordMatch = await comparePassword(
        password,
        user.password_hash
    )

    if (!passwordMatch) {
        return null
    }

    return user
}
