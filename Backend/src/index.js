import { app } from "./app.js"
import { ensureScheduledBackup } from "./database/backups.js"

const port = Number(process.env.PORT || 3100)
const host = process.env.HOST || "0.0.0.0"

app.listen(port, host, () => {
    console.log(`Server running on http://localhost:${port}`)
    checkBackupSchedule()
    setInterval(checkBackupSchedule, 60_000).unref()
})

function checkBackupSchedule() {
    try {
        ensureScheduledBackup()
    } catch (error) {
        console.error("Scheduled database backup failed:", error)
    }
}
