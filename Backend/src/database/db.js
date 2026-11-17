import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runMigrations } from "./migrations.js"
import "dotenv/config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const databasePath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(__dirname, "../../data/database.sqlite")
const schemaPath = path.join(__dirname, "schema.sql")

fs.mkdirSync(path.dirname(databasePath), { recursive: true })

export function openDatabase(filename) {
    const connection = new Database(filename)
    try {
        connection.pragma("foreign_keys = ON")
        connection.exec(fs.readFileSync(schemaPath, "utf8"))
        runMigrations(connection)
        return connection
    } catch (error) {
        connection.close()
        throw error
    }
}

let db = openDatabase(databasePath)

function moveIntoPlace(candidate) {
    // Windows can briefly hold the destination after SQLite closes it.
    const delays = process.platform === "win32" ? [25, 75, 150] : []
    const signal = new Int32Array(new SharedArrayBuffer(4))
    for (const delay of delays) {
        try {
            fs.renameSync(candidate, databasePath)
            return
        } catch (error) {
            if (!["EACCES", "EBUSY", "EPERM"].includes(error.code)) throw error
            Atomics.wait(signal, 0, 0, delay)
        }
    }
    fs.renameSync(candidate, databasePath)
}

export function replaceDatabase(candidate, previous) {
    const mode = fs.statSync(databasePath).mode & 0o777
    fs.chmodSync(candidate, mode)
    if (db.pragma("journal_mode = DELETE", { simple: true }) !== "delete") {
        throw new Error("The database could not leave WAL mode.")
    }
    db.close()
    let replaced = false
    try {
        for (const suffix of ["-wal", "-shm", "-journal"]) {
            if (fs.existsSync(databasePath + suffix)) {
                throw new Error("The database still has an active journal.")
            }
        }
        moveIntoPlace(candidate)
        replaced = true
        db = openDatabase(databasePath)
    } catch (error) {
        if (replaced) {
            fs.copyFileSync(previous, candidate, fs.constants.COPYFILE_EXCL)
            fs.chmodSync(candidate, mode)
            moveIntoPlace(candidate)
        }
        db = openDatabase(databasePath)
        throw error
    }
}

export { db as default }
