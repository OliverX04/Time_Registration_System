import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import AttendanceRequestForm from "../components/AttendanceRequestForm.jsx"
import { getAttendanceHistory } from "../services/attendanceService.js"
import "../styles/attendance.css"
import "../styles/attendanceManagement.css"

const historyPath = "/intern-dashboard/attendance-history"

export default function AttendanceCorrectionRequest() {
    const [history, setHistory] = useState(null)
    const [error, setError] = useState("")
    const [requestType, setRequestType] = useState("existing")
    const [selection, setSelection] = useState("")
    const [busy, setBusy] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        let active = true
        getAttendanceHistory().then(
            (result) => { if (active) setHistory(result) },
            (err) => { if (active) setError(err.message) }
        )
        return () => { active = false }
    }, [])

    const pendingIds = new Set(history?.requests.filter((request) => request.status === "PENDING")
        .map((request) => request.sessionId))
    const sessionsByDay = new Map()
    for (const session of history?.sessions ?? []) {
        const day = new Date(session.checkedInAt).toLocaleDateString()
        if (!sessionsByDay.has(day)) sessionsByDay.set(day, [])
        sessionsByDay.get(day).push(session)
    }
    const session = history?.sessions.find((item) => item.id === selection)

    return (
        <AppLayout>
            <div className="auth-card dashboard-card attendance-history-card">
                <Link className="attendance-history-link" to={historyPath}>← Back to Attendance History</Link>
                <h1>Request correction</h1>
                {error && <p className="error-message" role="alert">{error}</p>}
                {!history && !error && <p role="status">Loading attendance…</p>}
                {history?.internships.length === 0 && <p>You need an internship before you can request a correction.</p>}
                {history?.internships.length > 0 && (
                    <label className="form-group">
                        What would you like to do?
                        <select value={requestType} disabled={busy} onChange={(event) => {
                            setRequestType(event.target.value)
                            setSelection("")
                        }}>
                            <option value="existing">Request correction</option>
                            <option value="missing">Report missing attendance</option>
                        </select>
                    </label>
                )}
                {requestType === "existing" && history?.internships.length > 0 && (
                    <label className="form-group">
                        Attendance entry
                        <select value={selection} disabled={busy || sessionsByDay.size === 0}
                            onChange={(event) => setSelection(event.target.value)}>
                            <option value="">{sessionsByDay.size ? "Choose a day and time" : "No attendance entries yet"}</option>
                            {[...sessionsByDay].map(([day, sessions]) => <optgroup key={day} label={day}>
                                {sessions.map((item) => <option key={item.id} value={item.id} disabled={pendingIds.has(item.id)}>
                                    {formatTime(item.checkedInAt)} – {item.checkedOutAt ? formatTime(item.checkedOutAt) : "In progress"}
                                    {pendingIds.has(item.id) ? " (request pending)" : ""}
                                </option>)}
                            </optgroup>)}
                        </select>
                    </label>
                )}
                {(requestType === "missing" || session) && (
                    <AttendanceRequestForm key={session?.id ?? requestType} session={session} internships={history.internships}
                        busy={busy} setBusy={setBusy}
                        onCancel={() => navigate(historyPath)}
                        onSubmitted={() => navigate(historyPath, { replace: true, state: { correctionSubmitted: true } })} />
                )}
            </div>
        </AppLayout>
    )
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
