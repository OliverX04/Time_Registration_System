import express from "express"
import db from "../database/db.js"
import { deleteBackup, getBackupSchedule, listBackups, restoreBackup, setBackupSchedule } from "../database/backups.js"
import { hasPendingDatabaseWork } from "../database/pendingWork.js"
import { requireAuth } from "../security/requireAuth.js"

export const databaseBackupsRouter = express.Router()

databaseBackupsRouter.use(requireAuth, (req, res, next) => {
    const supervisor = db.prepare(
        "SELECT 1 FROM user_account WHERE id = ? AND role = 'SUPERVISOR' AND is_enabled = 1"
    ).get(req.user.id)
    if (!supervisor) {
        return res.status(403).send({ error: "Supervisor access required." })
    }
    res.set("Cache-Control", "no-store")
    next()
})

databaseBackupsRouter.get("/", (req, res) => {
    res.send({ backups: listBackups(), schedule: getBackupSchedule() })
})

databaseBackupsRouter.put("/schedule", (req, res) => {
    const schedule = setBackupSchedule(req.body)
    if (!schedule) {
        return res.status(400).send({ error: "Choose a valid backup frequency, time and day." })
    }
    res.send({ schedule })
})

databaseBackupsRouter.delete("/:id", (req, res) => {
    if (!deleteBackup(req.params.id)) {
        return res.status(404).send({ error: "Backup not found." })
    }
    res.send({ message: "Backup deleted." })
})

databaseBackupsRouter.post("/restore", (req, res) => {
    if (hasPendingDatabaseWork()) {
        return res.status(409).send({ error: "The database is busy. Try restoring again in a moment." })
    }
    try {
        if (!restoreBackup(req.body?.id)) {
            return res.status(404).send({ error: "Backup not found." })
        }
        res.send({ message: "Database restored. Sign in again." })
    } catch (error) {
        console.error("Database restore failed:", error)
        res.status(500).send({ error: "Unable to restore the selected backup." })
    }
})
