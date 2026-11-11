import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { CorrectionDetails } from "../components/AttendanceCorrectionRequests.jsx"
import { getAttendanceHistory } from "../services/attendanceService.js"
import "../styles/attendance.css"
import "../styles/attendanceManagement.css"

export default function AttendanceCorrectionHistory() {
    const [requests, setRequests] = useState(null)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        getAttendanceHistory().then(
            ({ requests }) => {
                if (active) setRequests(requests.filter((request) => request.status !== "PENDING"))
            },
            (err) => { if (active) setError(err.message) }
        )
        return () => { active = false }
    }, [])

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <Link className="attendance-history-link" to="/intern-dashboard/attendance-history">
                    ← Back to Attendance History
                </Link>
                <h1>Correction request history</h1>
                {error && <p className="error-message" role="alert">{error}</p>}
                {!requests && !error && <p role="status">Loading correction history…</p>}
                {requests?.length === 0 && <p>No reviewed requests yet.</p>}
                {requests?.map((request) => <article className="attendance-correction-form" key={request.id}>
                    <strong>{request.status === "APPROVED" ? "Approved" : "Rejected"}</strong>
                    <CorrectionDetails request={request} />
                </article>)}
            </div>
        </AppLayout>
    )
}
