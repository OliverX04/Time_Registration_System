import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { getToken, logoutUser } from "../services/authService.js"
import { createDatabaseBackup, deleteDatabaseBackup, loadDatabaseBackups, restoreDatabaseBackup, saveBackupSchedule } from "../services/databaseBackupService.js"
import "../styles/databaseBackups.css"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" })
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const backupTypes = { daily: "Daily backup", weekly: "Weekly backup", manual: "Manual backup", "before-restore": "Before restore" }

function backupLabel(backup) {
    return `${dateFormat.format(new Date(backup.createdAt))} (${backupTypes[backup.type]})`
}

export default function DatabaseBackups() {
    const [backups, setBackups] = useState([])
    const [selectedId, setSelectedId] = useState("")
    const [loading, setLoading] = useState(true)
    const [restoring, setRestoring] = useState(false)
    const [creatingBackup, setCreatingBackup] = useState(false)
    const [backupNotice, setBackupNotice] = useState("")
    const [deletingId, setDeletingId] = useState("")
    const [deleteNotice, setDeleteNotice] = useState("")
    const [error, setError] = useState("")
    const [schedule, setSchedule] = useState(null)
    const [savingSchedule, setSavingSchedule] = useState(false)
    const [scheduleError, setScheduleError] = useState("")
    const [scheduleNotice, setScheduleNotice] = useState("")
    const navigate = useNavigate()
    const selected = backups.find(backup => backup.id === selectedId)
    const busy = restoring || savingSchedule || creatingBackup || Boolean(deletingId)

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

    async function handleBackupNow() {
        if (busy) return
        setCreatingBackup(true)
        setBackupNotice("")
        setDeleteNotice("")
        setError("")
        try {
            const backup = await createDatabaseBackup()
            setBackups(current => [backup, ...current])
            setBackupNotice("Backup created.")
        } catch (error) {
            setError(error.message)
        } finally {
            setCreatingBackup(false)
        }
    }

    async function handleSchedule(event) {
        event.preventDefault()
        if (busy) return
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
        if (!selected || busy) return
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

    async function handleDelete(backup) {
        if (busy || !window.confirm(`Permanently delete ${backupLabel(backup)}?`)) return
        setDeletingId(backup.id)
        setError("")
        setDeleteNotice("")
        try {
            await deleteDatabaseBackup(backup.id)
            setBackups(current => current.filter(item => item.id !== backup.id))
            setSelectedId(current => current === backup.id ? "" : current)
            setDeleteNotice("Backup deleted.")
        } catch (error) {
            setError(error.message)
        } finally {
            setDeletingId("")
        }
    }

    return (
        <AppLayout>
            <section className="auth-card dashboard-card">
                <h1>Database backups</h1>
                <button type="button" className="auth-button" disabled={busy || loading}
                    onClick={handleBackupNow}>
                    {creatingBackup ? "Creating backup…" : "Backup now"}
                </button>
                {backupNotice && <p className="success-message" role="status">{backupNotice}</p>}
                {loading && <p role="status">Loading backups…</p>}
                {error && <p className="error-message" role="alert">{error}</p>}
                {schedule && (
                    <form onSubmit={handleSchedule}>
                        <h2>Backup schedule</h2>
                        <div className="form-group">
                            <label htmlFor="backup-frequency">Frequency</label>
                            <select id="backup-frequency" value={schedule.frequency} disabled={busy}
                                onChange={event => updateSchedule("frequency", event.target.value)}>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        {schedule.frequency === "weekly" && (
                            <div className="form-group">
                                <label htmlFor="backup-weekday">Day of the week</label>
                                <select id="backup-weekday" value={schedule.weekday} disabled={busy}
                                    onChange={event => updateSchedule("weekday", Number(event.target.value))}>
                                    {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="backup-time">Time ({schedule.timeZone})</label>
                            <input id="backup-time" type="time" value={schedule.time} required
                                disabled={busy}
                                onChange={event => updateSchedule("time", event.target.value)} />
                        </div>
                        {scheduleError && <p className="error-message" role="alert">{scheduleError}</p>}
                        {scheduleNotice && <p className="success-message" role="status">{scheduleNotice}</p>}
                        <button type="submit" className="auth-button" disabled={busy}>
                            {savingSchedule ? "Saving…" : "Save schedule"}
                        </button>
                    </form>
                )}
                {!loading && !error && backups.length === 0 && <p>No backups available yet.</p>}
                {backups.length > 0 && (
                    <form onSubmit={handleRestore}>
                        <h2>Restore</h2>
                        <details className="backup-picker">
                            <summary>{selected ? backupLabel(selected) : "Select a restore point"}</summary>
                            <ul className="backup-list">
                                {backups.map(backup => (
                                    <li key={backup.id}>
                                        <label>
                                            <input type="radio" name="restore-point" value={backup.id}
                                                checked={selectedId === backup.id} disabled={busy}
                                                onChange={() => setSelectedId(backup.id)} />
                                            {backupLabel(backup)}
                                        </label>
                                        <button type="button" className="backup-delete" disabled={busy}
                                            aria-label={`Delete backup from ${backupLabel(backup)}`}
                                            title="Delete backup" onClick={() => handleDelete(backup)}>
                                            <span aria-hidden="true">🗑︎</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </details>
                        <button type="submit" className="auth-button" disabled={!selected || busy}>
                            {restoring ? "Restoring…" : "Restore database"}
                        </button>
                    </form>
                )}
                {deleteNotice && <p className="success-message" role="status">{deleteNotice}</p>}
            </section>
        </AppLayout>
    )
}
