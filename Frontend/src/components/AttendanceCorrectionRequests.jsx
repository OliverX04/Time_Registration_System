import { useEffect, useState } from "react"
import { getAttendanceCorrectionRequests, reviewAttendanceCorrection } from "../services/attendanceService.js"

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

export default function AttendanceCorrectionRequests({ onApproved, disabled }) {
    const [requests, setRequests] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [version, setVersion] = useState(0)

    useEffect(() => {
        let active = true
        getAttendanceCorrectionRequests().then(
            ({ requests }) => { if (active) setRequests(requests) },
            (err) => { if (active) setError(err.message) }
        )
        return () => { active = false }
    }, [version])

    async function review(id, decision) {
        setBusy(true)
        setError("")
        try {
            await reviewAttendanceCorrection(id, decision)
            setRequests((current) => current.filter((request) => request.id !== id))
            if (decision === "APPROVED") onApproved()
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section aria-label="Attendance correction requests">
            <h2>Attendance correction requests</h2>
            <button className="attendance-action" type="button" disabled={busy}
                onClick={() => { setRequests(null); setError(""); setVersion((current) => current + 1) }}>Refresh requests</button>
            {error && <p className="error-message" role="alert">{error}</p>}
            {!requests && !error && <p>Loading requests…</p>}
            {requests?.length === 0 && <p>No pending requests.</p>}
            {requests?.map((request) => (
                <article className="attendance-correction-form" key={request.id}>
                    <h3>{request.firstName} {request.lastName} ({request.email})</h3>
                    <CorrectionDetails request={request} />
                    <div className="attendance-form-actions">
                        <button className="attendance-action attendance-action-primary" type="button"
                            disabled={busy || disabled} onClick={() => review(request.id, "APPROVED")}>Approve</button>
                        <button className="attendance-action" type="button"
                            disabled={busy || disabled} onClick={() => review(request.id, "REJECTED")}>Reject</button>
                    </div>
                </article>
            ))}
        </section>
    )
}
