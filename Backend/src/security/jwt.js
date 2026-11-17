import jwt from "jsonwebtoken"
import db from "../database/db.js"
import "dotenv/config"

function sessionRevision() {
    return db.prepare("SELECT value FROM session_revision WHERE singleton = 1").pluck().get()
}

export function createToken(user) {
    const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            revision: sessionRevision()
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    )

    return token
}

export function verifyToken(token) {
    const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
    )

    if (decoded.revision !== sessionRevision()) {
        throw new Error("The database has been restored since this login.")
    }
    return decoded
}
