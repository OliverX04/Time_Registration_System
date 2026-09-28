import jwt from "jsonwebtoken"
import "dotenv/config"

export function createToken(user) {
    const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role
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

    return decoded
}