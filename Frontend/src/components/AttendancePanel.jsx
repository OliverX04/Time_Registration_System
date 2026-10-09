import { useEffect, useState } from "react"
import { checkIn, checkOut, getAttendanceStatus } from "../services/attendanceService.js"
import "../styles/attendance.css"

function AttendancePanel() {
    const [session, setSession] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    useEffect(() => {
        let cancelled = false

        async function loadStatus() {
            try {
                const result = await getAttendanceStatus()
                if (!cancelled) setSession(result.session)
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadStatus()
        return () => { cancelled = true }
    }, [])

    async function handleAttendanceAction() {
        if (isBusy || isLoading) return

        setIsBusy(true)
        setError("")
        setSuccess("")

        try {
            const result = session ? await checkOut() : await checkIn()
            setSession(result.session.checkedOutAt ? null : result.session)
            setSuccess(result.session.checkedOutAt ? "Checked out." : "Checked in.")
        } catch (err) {
            setError(err.message)
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <section className="task-section" aria-labelledby="attendance-heading">
            <h2 id="attendance-heading">Attendance</h2>
            <p className="task-helper">Register your arrival and departure time.</p>

            {error && <p className="error-message" role="alert">{error}</p>}
            {success && <p className="success-message" role="status">{success}</p>}

            {isLoading ? <p className="task-helper">Loading attendance...</p> : !error && (
                <div className="attendance-panel">
                    <div>
                        <p className="attendance-status">
                            <strong>Status:</strong> {session ? "Checked in" : "Checked out"}
                        </p>
                        {session && <p className="attendance-time">Since {formatTime(session.checkedInAt)}</p>}
                    </div>
                    <button className="auth-button attendance-button" disabled={isBusy} onClick={handleAttendanceAction}>
                        {isBusy ? "Saving..." : session ? "Check Out" : "Check In"}
                    </button>
                </div>
            )}
        </section>
    )
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export default AttendancePanel
