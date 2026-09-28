import express from "express"
import cors from "cors"
import { signupRouter } from "./routes/signup.js"
import { loginRouter } from "./routes/login.js"

const app = express()

app.use(express.json())
app.use(cors({ exposedHeaders: "Authorization" }))

app.use("/signup", signupRouter)
app.use("/login", loginRouter)

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000")
})