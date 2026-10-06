import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runMigrations } from "./migrations.js"
import "dotenv/config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const databasePath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(__dirname, "../../data/database.sqlite")
const schemaPath = path.join(__dirname, "schema.sql")

fs.mkdirSync(path.dirname(databasePath), { recursive: true })

const db = new Database(databasePath)

db.pragma("foreign_keys = ON")
db.exec(fs.readFileSync(schemaPath, "utf8"))
runMigrations(db)

export default db
