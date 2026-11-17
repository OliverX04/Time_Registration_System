import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { getToken, logoutUser } from "../services/authService.js"
import { loadDatabaseBackups, restoreDatabaseBackup, saveBackupSchedule } from "../services/databaseBackupService.js"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" })
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const backupTypes = { daily: "Daily backup", weekly: "Weekly backup", "before-restore": "Before restore" }

function backupLabel(backup) {
    return `${dateFormat.format(new Date(backup.createdAt))} (${backupTypes[backup.type]})`
}

export default function DatabaseBackups() {
    const [backups, setBackups] = useState([])
    const [selectedId, setSelectedId] = useState("")
    const [loading, setLoading] = useState(true)
    const [restoring, setRestoring] = useState(false)
    const [error, setError] = useState("")
    const [schedule, setSchedule] = useState(null)
    const [savingSchedule, setSavingSchedule] = useState(false)
    const [scheduleError, setScheduleError] = useState("")
    const [scheduleNotice, setScheduleNotice] = useState("")
    const navigate = useNavigate()

    useEffect(() => {
        const controller = new AbortController()
        loadDatabaseBackups(controller.signal)
            .then(data => {
                setBackups(data.backups)
                setSchedule(data.schedule)
            })
            .catch(error => {
                if (!controller.signal.aborted) setError(error.message)
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [])

    function updateSchedule(field, value) {
        setSchedule(current => ({ ...current, [field]: value }))
        setScheduleNotice("")
        setScheduleError("")
    }

    async function handleSchedule(event) {
        event.preventDefault()
        if (savingSchedule || restoring) return
        setSavingSchedule(true)
        setScheduleNotice("")
        setScheduleError("")
        try {
            setSchedule(await saveBackupSchedule(schedule))
            setScheduleNotice("Backup schedule saved.")
        } catch (error) {
            setScheduleError(error.message)
        } finally {
            setSavingSchedule(false)
        }
    }

    async function handleRestore(event) {
        event.preventDefault()
        const selected = backups.find(backup => backup.id === selectedId)
        if (!selected || restoring || savingSchedule) return
        if (!window.confirm(`Restore ${backupLabel(selected)}? Changes made after this backup will be rolled back. Everyone will need to sign in again.`)) return

        const token = getToken()
        setError("")
        setRestoring(true)
        try {
            await restoreDatabaseBackup(selectedId)
            if (getToken() === token) logoutUser()
            navigate("/login", { replace: true, state: { databaseRestored: true } })
        } catch (error) {
            setError(error.message)
        } finally {
            setRestoring(false)
        }
    }

    return (
        <AppLayout>
            <section className="auth-card dashboard-card">
                <h1>Database backups</h1>
                {loading && <p role="status">Loading backups…</p>}
                {error && <p className="error-message" role="alert">{error}</p>}
                {schedule && (
                    <form onSubmit={handleSchedule}>
                        <h2>Backup schedule</h2>
                        <div className="form-group">
                            <label htmlFor="backup-frequency">Frequency</label>
                            <select id="backup-frequency" value={schedule.frequency} disabled={savingSchedule || restoring}
                                onChange={event => updateSchedule("frequency", event.target.value)}>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        {schedule.frequency === "weekly" && (
                            <div className="form-group">
                                <label htmlFor="backup-weekday">Day of the week</label>
                                <select id="backup-weekday" value={schedule.weekday} disabled={savingSchedule || restoring}
                                    onChange={event => updateSchedule("weekday", Number(event.target.value))}>
                                    {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="backup-time">Time ({schedule.timeZone})</label>
                            <input id="backup-time" type="time" value={schedule.time} required
                                disabled={savingSchedule || restoring}
                                onChange={event => updateSchedule("time", event.target.value)} />
                        </div>
                        {scheduleError && <p className="error-message" role="alert">{scheduleError}</p>}
                        {scheduleNotice && <p className="success-message" role="status">{scheduleNotice}</p>}
                        <button type="submit" className="auth-button" disabled={savingSchedule || restoring}>
                            {savingSchedule ? "Saving…" : "Save schedule"}
                        </button>
                    </form>
                )}
                {!loading && !error && backups.length === 0 && <p>No backups available yet.</p>}
                {backups.length > 0 && (
                    <form onSubmit={handleRestore}>
                        <h2>Restore</h2>
                        <div className="form-group">
                            <label htmlFor="database-backup">Restore point</label>
                            <select id="database-backup" value={selectedId} disabled={restoring}
                                onChange={event => setSelectedId(event.target.value)} required>
                                <option value="">Select a backup</option>
                                {backups.map(backup => (
                                    <option key={backup.id} value={backup.id}>{backupLabel(backup)}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="auth-button" disabled={!selectedId || restoring || savingSchedule}>
                            {restoring ? "Restoring…" : "Restore database"}
                        </button>
                    </form>
                )}
            </section>
        </AppLayout>
    )
}
