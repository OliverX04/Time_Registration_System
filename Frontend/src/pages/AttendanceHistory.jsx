import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { getAttendanceHistory } from "../services/attendanceService.js"
import { getCurrentUser } from "../services/authService.js"
import AttendanceRequestForm from "../components/AttendanceRequestForm.jsx"
import { CorrectionDetails } from "../components/AttendanceCorrectionRequests.jsx"
import "../styles/attendance.css"
import "../styles/attendanceManagement.css"

function AttendanceHistory() {
    const [sessions, setSessions] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")
    const [internships, setInternships] = useState([])
    const [requests, setRequests] = useState([])
    const pendingRequests = requests.filter((request) => request.status === "PENDING")
    const [form, setForm] = useState(null)
    const [version, setVersion] = useState(0)
    const [notice, setNotice] = useState("")
    const [newApprovals, setNewApprovals] = useState([])
    const userId = getCurrentUser()?.id
    const sessionGroups = groupSessionsByDate(sessions)

    useEffect(() => {
        let cancelled = false

        async function loadHistory() {
            try {
                const result = await getAttendanceHistory()
                if (!cancelled) {
                    setError("")
                    setSessions(result.sessions)
                    setInternships(result.internships)
                    setRequests(result.requests)
                    const unseen = takeUnseenApprovals(result.requests, userId)
                    if (unseen.length) setNewApprovals(unseen)
                }
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadHistory()
        return () => { cancelled = true }
    }, [version, userId])

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <h1>Attendance History</h1>
                <p className="auth-subtitle">Your registered attendance sessions, newest first.</p>

                {isLoading && <p className="task-helper">Loading attendance history...</p>}
                {error && <p className="error-message" role="alert">{error}</p>}
                {notice && <p className="success-message" role="status">{notice}</p>}
                <button className="attendance-action" type="button" disabled={Boolean(form) || isLoading}
                    onClick={() => { setIsLoading(true); setVersion((current) => current + 1) }}>Refresh history</button>
                {internships.length > 0 && <button className="attendance-action" type="button"
                    disabled={Boolean(form)} onClick={() => setForm({ session: null })}>Report missing attendance</button>}
                {form && <AttendanceRequestForm session={form.session} internships={internships}
                    onCancel={() => setForm(null)} onSubmitted={() => {
                        setForm(null)
                        setNotice("Correction request submitted.")
                        setIsLoading(true)
                        setVersion((current) => current + 1)
                    }} />}
                {!isLoading && !error && <section aria-label="Your correction requests">
                    <h2>Your correction requests</h2>
                    {newApprovals.length > 0 && (
                        <div className="attendance-approval-notice" role="status">
                            <h3>{newApprovals.length === 1 ? "✓ Correction approved" : "✓ Corrections approved"}</h3>
                            {newApprovals.map((request) => <article key={request.id}>
                                <CorrectionDetails request={request} />
                            </article>)}
                        </div>
                    )}
                    {pendingRequests.length === 0 && <p>You don't have any pending requests :D</p>}
                    {pendingRequests.map((request) => <article className="attendance-correction-form" key={request.id}>
                        <strong>Pending</strong>
                        <CorrectionDetails request={request} />
                    </article>)}
                    <Link className="attendance-history-link" to="corrections">Show history</Link>
                </section>}

                {!isLoading && !error && sessions.length === 0 && (
                    <p className="task-empty">No attendance sessions yet.</p>
                )}

                {!isLoading && !error && sessions.length > 0 && (
                    <div className="attendance-history">
                        {sessionGroups.map((group) => (
                            <section className="attendance-day" key={group.dateKey}>
                                <div className="attendance-day-heading">
                                    <h2 className="attendance-date">{formatDate(group.sessions[0].checkedInAt)}</h2>
                                    <p className="attendance-day-total">
                                        Total: <strong>{formatDailyTotal(group.sessions)}</strong>
                                    </p>
                                </div>

                                <div className="attendance-entry-list">
                                    <div className="attendance-entry-headings" aria-hidden="true">
                                        <span>Check In</span>
                                        <span>Check Out</span>
                                        <span>Duration</span>
                                        <span>Status</span>
                                    </div>

                                    {group.sessions.map((session) => (
                                        <article className="attendance-entry" key={session.id}>
                                            <p aria-label={`Check In: ${formatTime(session.checkedInAt)}`}>
                                                <strong>{formatTime(session.checkedInAt)}</strong>
                                            </p>
                                            <p aria-label={`Check Out: ${session.checkedOutAt ? formatTime(session.checkedOutAt) : "Not checked out"}`}>
                                                <strong>{session.checkedOutAt ? formatTime(session.checkedOutAt) : "—"}</strong>
                                            </p>
                                            <p aria-label={`Duration: ${session.checkedOutAt ? formatDuration(session) : "Not available"}`}>
                                                <strong>{session.checkedOutAt ? formatDuration(session) : "—"}</strong>
                                            </p>
                                            <div>
                                                <strong>{session.checkedOutAt ? "Completed" : "In progress"}</strong>
                                                <button className="attendance-action" type="button"
                                                    aria-label={`Request correction for ${formatDate(session.checkedInAt)} at ${formatTime(session.checkedInAt)}`}
                                                    disabled={Boolean(form) || requests.some((request) => request.sessionId === session.id && request.status === "PENDING")}
                                                    onClick={() => setForm({ session })}>Request correction</button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    )
}

function takeUnseenApprovals(requests, userId) {
    if (!userId) return []
    const key = `attendance-seen-approvals:${userId}`
    try {
        const seen = new Set(JSON.parse(localStorage.getItem(key) ?? "[]"))
        const unseen = requests.filter((request) => request.status === "APPROVED" && !seen.has(request.id))
        if (unseen.length) {
            unseen.forEach((request) => seen.add(request.id))
            localStorage.setItem(key, JSON.stringify([...seen]))
        }
        return unseen
    } catch {
        return []
    }
}

function groupSessionsByDate(sessions) {
    const groups = new Map()

    sessions.forEach((session) => {
        const date = new Date(session.checkedInAt)
        const dateKey = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-")

        if (!groups.has(dateKey)) groups.set(dateKey, [])
        groups.get(dateKey).push(session)
    })

    return Array.from(groups, ([dateKey, groupedSessions]) => ({
        dateKey,
        sessions: groupedSessions
    }))
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    })
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatDuration(session) {
    const durationMs = new Date(session.checkedOutAt).getTime() - new Date(session.checkedInAt).getTime()

    return formatDurationMs(durationMs)
}

function formatDailyTotal(sessions) {
    const totalMs = sessions.reduce((total, session) => {
        if (!session.checkedOutAt) return total

        return total + new Date(session.checkedOutAt).getTime() - new Date(session.checkedInAt).getTime()
    }, 0)

    return formatDurationMs(totalMs)
}

function formatDurationMs(durationMs) {
    if (durationMs <= 0) return "0m"
    if (durationMs < 60000) return "< 1 min"

    const totalMinutes = Math.floor(durationMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) return `${minutes}m`
    if (minutes === 0) return `${hours}h`
    return `${hours}h ${minutes}m`
}

export default AttendanceHistory
