import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, "../../data")
const databasePath = path.join(dataDir, "database.sqlite")
const schemaPath = path.join(__dirname, "schema.sql")

fs.mkdirSync(dataDir, { recursive: true })

const db = new Database(databasePath)

db.pragma("foreign_keys = ON")
db.exec(fs.readFileSync(schemaPath, "utf8"))

export default db