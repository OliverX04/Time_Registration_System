import { useEffect, useRef, useState } from "react"
import CorrectionTimes from "./CorrectionTimes.jsx"
import { readCorrectionTime } from "../services/correctionTimes.js"
import { correctTaskTimeEntry } from "../services/taskTimeService.js"
import "../styles/attendanceManagement.css"

export default function TaskTimeCorrectionForm({ entry, onCancel, onSaved }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const mounted = useRef(false)

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
    }, [])

    async function submit(event) {
        event.preventDefault()
        if (busy) return
        const data = new FormData(event.currentTarget)
        setError("")
        setBusy(true)
        try {
            await correctTaskTimeEntry(entry,
                readCorrectionTime(data, "start", entry.startedAt),
                readCorrectionTime(data, "end", entry.endedAt))
        } catch (err) {
            if (mounted.current) {
                setError(Object.values(err.fieldErrors ?? {}).join(" ") || err.message)
                setBusy(false)
            }
            return
        }
        if (mounted.current) onSaved()
    }

    return (
        <form className="attendance-correction-form task-time-correction" onSubmit={submit}>
            <p>Times use your local time zone.</p>
            <CorrectionTimes start={entry.startedAt} end={entry.endedAt}
                startLabel="Start time" endLabel="End time" disabled={busy} />
            {error && <p className="error-message" role="alert">{error}</p>}
            <div className="attendance-form-actions">
                <button className="project-action project-action-primary" disabled={busy}>Save correction</button>
                <button className="project-action" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
            </div>
        </form>
    )
}
