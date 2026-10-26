import { verifyToken } from "./jwt.js"

export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).send({
            error: "Unauthorized"
        })
    }

    const token = authHeader.split(" ")[1]

    if (!token) {
        return res.status(401).send({
            error: "Unauthorized"
        })
    }

    try {
        const decoded = verifyToken(token)

        req.user = decoded

        next()
    } catch (err) {
        res.status(401).send({
            error: "Unauthorized"
        })
    }
}