import express from "express"
import db from "../database/db.js"
import { comparePassword } from "../security/password.js"
import { createToken } from "../security/jwt.js"

export const loginRouter = express.Router()

loginRouter.post("/", async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).send({
            error: "Email and password are required"
        })
    }

    try {
        const user = await authenticateUser(email, password)

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
        res.status(401).send({
            error: "Unauthorized"
        })
    }
})

async function authenticateUser(email, password) {
    const user = db
        .prepare("SELECT * FROM user_account WHERE email = ?")
        .get(email)

    if (!user) {
        throw new Error("Invalid credentials")
    }

    if (!user.is_enabled) {
        throw new Error("Account disabled")
    }

    const passwordMatch = await comparePassword(
        password,
        user.password_hash
    )

    if (!passwordMatch) {
        throw new Error("Invalid credentials")
    }

    return user
}