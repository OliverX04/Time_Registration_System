import Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import db, { databasePath, openDatabase, replaceDatabase } from "./db.js"
import { defaultSchedule, latestScheduledSlot, publicSchedule, validateSchedule } from "./backupSchedule.js"

const directory = `${databasePath}.backups`
const scheduledName = /^(?:daily|weekly)-\d{4}-\d{2}-\d{2}(?:T\d{2}_\d{2})?\.sqlite$/
const snapshotName = /^(?:before-restore|manual)-\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}\.\d{3}Z-[a-f0-9-]{36}\.sqlite$/
const schedulePath = path.join(directory, "schedule.json")

function hasEnabledSupervisor(connection) {
    return Boolean(connection.prepare(
        "SELECT 1 FROM user_account WHERE role = 'SUPERVISOR' AND is_enabled = 1 LIMIT 1"
    ).get())
}

function describeBackup(filename, stats) {
    return {
        id: filename,
        type: filename.startsWith("before-restore-") ? "before-restore" : filename.split("-")[0],
        createdAt: stats.mtime.toISOString()
    }
}

function reserveDirectory(parent) {
    return fs.mkdtempSync(path.join(parent, ".time-registration-"))
}

function readSchedule() {
    if (!fs.existsSync(schedulePath)) return defaultSchedule
    const settings = JSON.parse(fs.readFileSync(schedulePath, "utf8"))
    const schedule = validateSchedule(settings)
    if (!schedule || !Number.isFinite(Date.parse(settings.updatedAt))) {
        throw new Error("Invalid backup schedule on disk.")
    }
    return { ...schedule, updatedAt: settings.updatedAt }
}

export function getBackupSchedule() {
    return publicSchedule(readSchedule())
}

export function setBackupSchedule(value) {
    const schedule = validateSchedule(value)
    if (!schedule) return null
    const current = readSchedule()
    if (current.frequency === schedule.frequency && current.time === schedule.time && current.weekday === schedule.weekday) {
        return publicSchedule(current)
    }

    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const scratch = reserveDirectory(directory)
    try {
        const candidate = path.join(scratch, "schedule.json")
        const settings = { ...schedule, updatedAt: new Date().toISOString() }
        fs.writeFileSync(candidate, JSON.stringify(settings), { flag: "wx", mode: 0o600 })
        fs.renameSync(candidate, schedulePath)
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
    }
    return publicSchedule(schedule)
}

function saveSnapshot(filename) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const scratch = reserveDirectory(directory)
    try {
        const candidate = path.join(scratch, "snapshot.sqlite")
        db.prepare("VACUUM INTO ?").run(candidate)
        fs.renameSync(candidate, path.join(directory, filename))
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
    }
}

export function ensureScheduledBackup() {
    const schedule = readSchedule()
    const slot = latestScheduledSlot(schedule, new Date())
    if (schedule.updatedAt && slot <= latestScheduledSlot(schedule, new Date(schedule.updatedAt))) return
    const filename = `${schedule.frequency}-${slot}.sqlite`
    const target = path.join(directory, filename)
    if (!fs.existsSync(target) && !fs.existsSync(`${target}.deleted`) && hasEnabledSupervisor(db)) {
        saveSnapshot(filename)
    }
}

export function createManualBackup() {
    const timestamp = new Date().toISOString().replaceAll(":", "_")
    const filename = `manual-${timestamp}-${randomUUID()}.sqlite`
    saveSnapshot(filename)
    return describeBackup(filename, fs.statSync(path.join(directory, filename)))
}

export function listBackups() {
    if (!fs.existsSync(directory)) return []
    return fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && (scheduledName.test(entry.name) || snapshotName.test(entry.name)))
        .map(entry => describeBackup(entry.name, fs.statSync(path.join(directory, entry.name))))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function findBackupFile(id) {
    if (typeof id !== "string" || (!scheduledName.test(id) && !snapshotName.test(id))) return null
    const source = path.join(directory, id)
    return fs.lstatSync(source, { throwIfNoEntry: false })?.isFile() ? source : null
}

export function deleteBackup(id) {
    const source = findBackupFile(id)
    if (!source) return false
    if (scheduledName.test(id)) {
        // Keep the completed slot recorded so the scheduler does not recreate it.
        fs.writeFileSync(`${source}.deleted`, "", { flag: "a", mode: 0o600 })
    }
    fs.unlinkSync(source)
    return true
}

export function restoreBackup(id) {
    const source = findBackupFile(id)
    if (!source) return false

    const scratch = reserveDirectory(path.dirname(databasePath))
    try {
        const candidate = path.join(scratch, "restore.sqlite")
        const backup = new Database(source, { readonly: true, fileMustExist: true })
        try {
            backup.prepare("VACUUM INTO ?").run(candidate)
        } finally {
            backup.close()
        }

        const restored = openDatabase(candidate)
        try {
            const integrity = restored.pragma("integrity_check", { simple: true })
            const violations = restored.pragma("foreign_key_check")
            if (integrity !== "ok" || violations.length || !hasEnabledSupervisor(restored)) {
                throw new Error("The snapshot failed validation.")
            }
            restored.prepare("INSERT OR REPLACE INTO session_revision (singleton, value) VALUES (1, ?)").run(randomUUID())
        } finally {
            restored.close()
        }

        const timestamp = new Date().toISOString().replaceAll(":", "_")
        const previous = `before-restore-${timestamp}-${randomUUID()}.sqlite`
        saveSnapshot(previous)
        replaceDatabase(candidate, path.join(directory, previous))
        return true
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
    }
}
