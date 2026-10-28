import { useEffect, useRef, useState } from "react"
import { checkIn, checkOut, getAttendanceStatus } from "../services/attendanceService.js"
import "../styles/attendance.css"

function AttendancePanel() {
    const [session, setSession] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isBusy, setIsBusy] = useState(false)
    const [isStatusKnown, setIsStatusKnown] = useState(false)
    const [statusVersion, setStatusVersion] = useState(0)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const busy = useRef(false)
    const statusRequest = useRef(0)

    useEffect(() => {
        let cancelled = false

        async function loadStatus() {
            const requestId = ++statusRequest.current
            setIsLoading(true)
            try {
                const result = await getAttendanceStatus()
                if (cancelled || requestId !== statusRequest.current) return
                setSession(result.session)
                setIsStatusKnown(true)
            } catch (err) {
                if (cancelled || requestId !== statusRequest.current) return
                setIsStatusKnown(false)
                setSuccess("")
                setError(err.message)
            } finally {
                if (!cancelled && requestId === statusRequest.current) setIsLoading(false)
            }
        }

        loadStatus()

        function refreshWhenVisible() {
            if (!busy.current && document.visibilityState === "visible") {
                setError("")
                setSuccess("")
                loadStatus()
            }
        }

        window.addEventListener("focus", refreshWhenVisible)
        document.addEventListener("visibilitychange", refreshWhenVisible)
        return () => {
            cancelled = true
            statusRequest.current += 1
            window.removeEventListener("focus", refreshWhenVisible)
            document.removeEventListener("visibilitychange", refreshWhenVisible)
        }
    }, [statusVersion])

    function retryStatus() {
        setError("")
        setSuccess("")
        setIsLoading(true)
        setStatusVersion((current) => current + 1)
    }

    async function handleAttendanceAction() {
        if (busy.current || isLoading || !isStatusKnown) return

        busy.current = true
        const requestId = ++statusRequest.current
        setIsBusy(true)
        setError("")
        setSuccess("")

        try {
            const result = session ? await checkOut() : await checkIn()
            if (requestId !== statusRequest.current) return
            setSession(result.session.checkedOutAt ? null : result.session)
            setIsStatusKnown(true)
            setIsLoading(false)
            setSuccess(result.session.checkedOutAt ? "Checked out." : "Checked in.")
        } catch (err) {
            if (requestId !== statusRequest.current) return
            setError(err.message)
            setIsStatusKnown(false)
            setIsLoading(true)
            setStatusVersion((current) => current + 1)
        } finally {
            busy.current = false
            if (requestId === statusRequest.current) setIsBusy(false)
        }
    }

    return (
        <section className="task-section" aria-labelledby="attendance-heading">
            <h2 id="attendance-heading">Attendance</h2>
            <p className="task-helper">Register your arrival and departure time.</p>

            {error && <p className="error-message" role="alert">{error}</p>}
            {success && <p className="success-message" role="status">{success}</p>}

            {isLoading ? <p className="task-helper">Loading attendance...</p> : (
                <div className="attendance-panel">
                    <div>
                        <p className="attendance-status">
                            <strong>Status:</strong> {!isStatusKnown ? "Unavailable" : session ? "Checked in" : "Checked out"}
                        </p>
                        {isStatusKnown && session && <p className="attendance-time">Since {formatTime(session.checkedInAt)}</p>}
                    </div>
                    {isStatusKnown ? (
                        <button className="auth-button attendance-button" disabled={isBusy} onClick={handleAttendanceAction}>
                            {isBusy ? "Saving..." : session ? "Check Out" : "Check In"}
                        </button>
                    ) : (
                        <button className="auth-button attendance-button" disabled={isBusy} onClick={retryStatus}>
                            Retry
                        </button>
                    )}
                </div>
            )}
        </section>
    )
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export default AttendancePanel
