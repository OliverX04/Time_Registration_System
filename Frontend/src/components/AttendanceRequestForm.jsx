import { useState } from "react"
import { submitAttendanceCorrection } from "../services/attendanceService.js"
import CorrectionTimes from "./CorrectionTimes.jsx"
import { readCorrectionTime } from "../services/correctionTimes.js"

export default function AttendanceRequestForm({ session, internships, onCancel, onSubmitted }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")

    async function submit(event) {
        event.preventDefault()
        if (busy) return
        const data = new FormData(event.currentTarget)
        setError("")
        setBusy(true)
        try {
            await submitAttendanceCorrection({
                internshipId: session?.internshipId ?? data.get("internshipId"),
                sessionId: session?.id,
                expectedCheckedInAt: session?.checkedInAt,
                expectedCheckedOutAt: session?.checkedOutAt,
                checkedInAt: readCorrectionTime(data.get("start"), session?.checkedInAt),
                checkedOutAt: readCorrectionTime(data.get("end"), session?.checkedOutAt),
                reason: data.get("reason")
            })
        } catch (err) {
            setError(Object.values(err.fieldErrors ?? {}).join(" ") || err.message)
            setBusy(false)
            return
        }
        onSubmitted()
    }

    return (
        <form className="attendance-correction-form" onSubmit={submit}>
            <h2>{session ? "Request attendance correction" : "Report missing attendance"}</h2>
            <p>Times use your local time zone.</p>
            {!session && <label className="form-group">
                Internship
                <select name="internshipId" required disabled={busy}>
                    {internships.map((item) => <option key={item.id} value={item.id}>
                        {new Date(item.startedAt).toLocaleDateString()} – {item.endedAt ? new Date(item.endedAt).toLocaleDateString() : "Active"}
                    </option>)}
                </select>
            </label>}
            <CorrectionTimes start={session?.checkedInAt} end={session?.checkedOutAt}
                startLabel="Proposed check-in" endLabel="Proposed check-out" disabled={busy} />
            <label className="form-group">
                Reason
                <textarea name="reason" maxLength={1000} required disabled={busy} />
            </label>
            {error && <p className="error-message" role="alert">{error}</p>}
            <div className="attendance-form-actions">
                <button className="attendance-action attendance-action-primary" disabled={busy}>Submit request</button>
                <button className="attendance-action" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
            </div>
        </form>
    )
}
