import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { attendanceQueueChanged, getAttendanceCorrectionRequests, reviewAttendanceCorrection } from "../services/attendanceService.js"

export function CorrectionDetails({ request }) {
    const timestamp = (value) => value ? new Date(value).toLocaleString() : "Open"
    return (
        <>
            <p>{request.sessionId
                ? `Original: ${timestamp(request.originalIn)} – ${timestamp(request.originalOut)}`
                : "Missing attendance record"}</p>
            <p>Proposed: {timestamp(request.proposedIn)} – {timestamp(request.proposedOut)}</p>
            <p>Reason: {request.reason}</p>
        </>
    )
}

export default function AttendanceCorrectionRequests({ onApproved, disabled, busy, setBusy }) {
    const [requests, setRequests] = useState(null)
    const [error, setError] = useState("")
    const [version, setVersion] = useState(0)

    useEffect(() => {
        let active = true
        getAttendanceCorrectionRequests().then(
            ({ requests }) => {
                if (active) {
                    setRequests(requests)
                    window.dispatchEvent(new Event(attendanceQueueChanged))
                }
            },
            (err) => { if (active) setError(err.message) }
        )
        return () => { active = false }
    }, [version])

    async function review(request, decision) {
        if (busy || disabled) return
        setBusy(true)
        setError("")
        try {
            await reviewAttendanceCorrection(request.id, decision)
            setRequests((current) => current.filter((item) => item.id !== request.id))
            window.dispatchEvent(new Event(attendanceQueueChanged))
            if (decision === "APPROVED") onApproved(request.internId)
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="attendance-request-queue" aria-labelledby="attendance-request-queue-title">
            <div className="attendance-request-queue-heading">
                <h2 id="attendance-request-queue-title">Attendance correction requests</h2>
                <div className="attendance-request-queue-actions">
                    <Link className="attendance-history-link" to="corrections">Show history</Link>
                    <button className="attendance-action attendance-queue-reload" type="button"
                        aria-label="Refresh requests" title="Refresh requests" disabled={busy || (!requests && !error)}
                        onClick={() => { setRequests(null); setError(""); setVersion((current) => current + 1) }}>
                        <span aria-hidden="true">↻</span>
                    </button>
                </div>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            {!requests && !error && <p className="attendance-muted" role="status">Loading requests…</p>}
            {requests?.length === 0 && <p className="attendance-muted">No pending requests.</p>}
            {requests?.map((request) => (
                <article className="attendance-correction-form" key={request.id}>
                    <h3>{request.firstName} {request.lastName} ({request.email})</h3>
                    <CorrectionDetails request={request} />
                    <div className="attendance-form-actions">
                        <button className="attendance-action attendance-action-primary" type="button"
                            disabled={busy || disabled} onClick={() => review(request, "APPROVED")}>Approve</button>
                        <button className="attendance-action" type="button"
                            disabled={busy || disabled} onClick={() => review(request, "REJECTED")}>Reject</button>
                    </div>
                </article>
            ))}
        </section>
    )
}
