import express from "express"
import cors from "cors"
import { signupRouter } from "./routes/signup.js"
import { loginRouter } from "./routes/login.js"
import { projectsRouter } from "./routes/projects.js"
import { attendanceRouter } from "./routes/attendance.js"

export const app = express()

app.use(cors({ exposedHeaders: "Authorization" }))
app.use(express.json())

app.use("/signup", signupRouter)
app.use("/login", loginRouter)
app.use("/projects", projectsRouter)
app.use("/attendance", attendanceRouter)

app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).send({
            error: "Request body must be valid JSON.",
            fieldErrors: { body: "Check the JSON request body." }
        })
    }

    if (err.type === "entity.too.large") {
        return res.status(413).send({ error: "Request body is too large." })
    }

    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500
    res.status(status).send({ error: status < 500 ? "Invalid request." : "An unexpected server error occurred." })
})
