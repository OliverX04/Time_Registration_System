import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { CorrectionDetails } from "../components/AttendanceCorrectionRequests.jsx"
import { getAttendanceCorrectionRequests, getAttendanceHistory } from "../services/attendanceService.js"
import "../styles/attendance.css"
import "../styles/attendanceManagement.css"

export default function AttendanceCorrectionHistory({ supervisor = false }) {
    const [requests, setRequests] = useState(null)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        const load = supervisor ? getAttendanceCorrectionRequests(true) : getAttendanceHistory()
        load.then(
            ({ requests }) => {
                if (active) setRequests(requests.filter((request) => request.status !== "PENDING"))
            },
            (err) => { if (active) setError(err.message) }
        )
        return () => { active = false }
    }, [supervisor])

    return (
        <AppLayout>
            <div className="auth-card dashboard-card attendance-history-card">
                <Link className="attendance-history-link" to={supervisor ? "/supervisor-dashboard/attendance" : "/intern-dashboard/attendance-history"}>
                    ← Back to {supervisor ? "Attendance" : "Attendance History"}
                </Link>
                <h1>Correction request history</h1>
                {error && <p className="error-message" role="alert">{error}</p>}
                {!requests && !error && <p role="status">Loading correction history…</p>}
                {requests?.length === 0 && <p>No reviewed requests yet.</p>}
                {requests?.map((request) => <article className="attendance-correction-form" key={request.id}>
                    {supervisor && <h2>{request.firstName} {request.lastName} ({request.email})</h2>}
                    <strong>{request.status === "APPROVED" ? "Approved" : "Rejected"}</strong>
                    {supervisor && request.reviewedAt && <p>Reviewed {new Date(request.reviewedAt).toLocaleString()}</p>}
                    <CorrectionDetails request={request} />
                </article>)}
            </div>
        </AppLayout>
    )
}
