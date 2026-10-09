import { useEffect, useState } from "react"
import AppLayout from "../components/AppLayout.jsx"
import { getAttendanceHistory } from "../services/attendanceService.js"
import "../styles/attendance.css"

function AttendanceHistory() {
    const [sessions, setSessions] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let cancelled = false

        async function loadHistory() {
            try {
                const result = await getAttendanceHistory()
                if (!cancelled) setSessions(result.sessions)
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadHistory()
        return () => { cancelled = true }
    }, [])

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <h1>Attendance History</h1>
                <p className="auth-subtitle">Your registered attendance sessions, newest first.</p>

                {isLoading && <p className="task-helper">Loading attendance history...</p>}
                {error && <p className="error-message" role="alert">{error}</p>}

                {!isLoading && !error && sessions.length === 0 && (
                    <p className="task-empty">No attendance sessions yet.</p>
                )}

                {!isLoading && !error && sessions.length > 0 && (
                    <div className="attendance-history">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Date</th>
                                    <th scope="col">Check In</th>
                                    <th scope="col">Check Out</th>
                                    <th scope="col">Duration</th>
                                    <th scope="col">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map((session) => (
                                    <tr key={session.id}>
                                        <td>{formatDate(session.checkedInAt)}</td>
                                        <td>{formatTime(session.checkedInAt)}</td>
                                        <td>{session.checkedOutAt ? formatTime(session.checkedOutAt) : "—"}</td>
                                        <td>{session.checkedOutAt ? formatDuration(session) : "—"}</td>
                                        <td>{session.checkedOutAt ? "Completed" : "In progress"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppLayout>
    )
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString()
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatDuration(session) {
    const durationMs = new Date(session.checkedOutAt).getTime() - new Date(session.checkedInAt).getTime()

    if (durationMs < 60000) return "< 1 min"

    const totalMinutes = Math.floor(durationMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) return `${minutes}m`
    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
}

export default AttendanceHistory
