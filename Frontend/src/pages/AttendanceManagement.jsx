import { useEffect, useState } from "react"
import AppLayout from "../components/AppLayout.jsx"
import { getInterns } from "../services/internshipService.js"
import {
    addAttendance,
    deleteAttendance,
    getManagedAttendance,
    updateAttendance
} from "../services/attendanceService.js"
import "../styles/attendanceManagement.css"

function AttendanceManagement() {
    const [interns, setInterns] = useState([])
    const [selectedInternId, setSelectedInternId] = useState("")
    const [search, setSearch] = useState("")
    const [attendance, setAttendance] = useState(null)
    const [form, setForm] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [isInternsLoading, setIsInternsLoading] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [internsVersion, setInternsVersion] = useState(0)
    const [attendanceVersion, setAttendanceVersion] = useState(0)
    const [internsError, setInternsError] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    useEffect(() => {
        let cancelled = false

        async function loadInterns() {
            setIsInternsLoading(true)
            setInternsError("")
            try {
                const result = await getInterns()
                if (cancelled) return
                setInterns(result)
            } catch (err) {
                if (!cancelled) setInternsError(err.message)
            } finally {
                if (!cancelled) setIsInternsLoading(false)
            }
        }

        loadInterns()
        return () => { cancelled = true }
    }, [internsVersion])

    useEffect(() => {
        let cancelled = false
        if (!selectedInternId) return

        async function loadAttendance() {
            setIsLoading(true)
            setAttendance(null)
            setError("")
            try {
                const result = await getManagedAttendance(selectedInternId)
                if (!cancelled) setAttendance({ ...result, sessions: sortSessions(result.sessions) })
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadAttendance()
        return () => { cancelled = true }
    }, [selectedInternId, attendanceVersion])

    function changeIntern(event) {
        setSelectedInternId(event.target.value)
        setIsLoading(Boolean(event.target.value))
        setAttendance(null)
        setForm(null)
        setFieldErrors({})
        setError("")
        setSuccess("")
    }

    function openForm(session = null) {
        const internship = session
            ? attendance.internships.find((item) => item.id === session.internshipId)
            : attendance.internships.find((item) => !item.endedAt) || attendance.internships[0]
        setForm(createForm(internship, session))
        setFieldErrors({})
        setError("")
        setSuccess("")
    }

    function reloadAttendance() {
        setForm(null)
        setFieldErrors({})
        setSuccess("")
        setAttendanceVersion((current) => current + 1)
    }

    async function saveAttendance(event) {
        event.preventDefault()
        if (isSaving || !form) return
        const checkedInAt = readTimestamp(form.checkedInAt, form.session?.checkedInAt)
        const checkedOutAt = form.checkedOutAt
            ? readTimestamp(form.checkedOutAt, form.session?.checkedOutAt)
            : null
        const errors = {}
        if (!checkedInAt) errors.checkedInAt = "Enter a valid check-in date and time."
        if (form.checkedOutAt && !checkedOutAt) errors.checkedOutAt = "Enter a valid check-out date and time."
        if (checkedInAt && checkedOutAt && Date.parse(checkedOutAt) <= Date.parse(checkedInAt)) {
            errors.checkedOutAt = "Check-out must be later than check-in."
        }
        setFieldErrors(errors)
        setError("")
        setSuccess("")
        if (Object.keys(errors).length) return

        setIsSaving(true)
        try {
            const values = { checkedInAt, checkedOutAt }
            const result = form.session
                ? await updateAttendance(form.session.id, {
                    ...values,
                    expectedCheckedInAt: form.session.checkedInAt,
                    expectedCheckedOutAt: form.session.checkedOutAt
                })
                : await addAttendance(selectedInternId, { ...values, internshipId: form.internshipId })
            setAttendance((current) => ({
                ...current,
                sessions: sortSessions([
                    ...current.sessions.filter((session) => session.id !== result.session.id),
                    result.session
                ])
            }))
            setSuccess(form.session ? "Attendance updated." : "Attendance added.")
            setForm(null)
        } catch (err) {
            setError(err.message)
            setFieldErrors(err.fieldErrors || {})
        } finally {
            setIsSaving(false)
        }
    }

    async function removeAttendance(session) {
        if (isSaving || form) return
        const name = `${attendance.intern.firstName} ${attendance.intern.lastName}`
        if (!window.confirm(`Delete the attendance record starting ${formatTimestamp(session.checkedInAt)} for ${name}? This cannot be undone.`)) return
        setIsSaving(true)
        setError("")
        setSuccess("")
        try {
            await deleteAttendance(session)
            setAttendance((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== session.id) }))
            setSuccess("Attendance deleted.")
        } catch (err) {
            setError(err.message)
        } finally {
            setIsSaving(false)
        }
    }

    const selectedName = attendance ? `${attendance.intern.firstName} ${attendance.intern.lastName}` : ""
    const matchingInterns = interns.filter((intern) =>
        `${intern.firstName} ${intern.lastName} ${intern.email}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    )
    const selectedIntern = interns.find((intern) => intern.id === selectedInternId)
    const keepSelectedOption = selectedIntern && !matchingInterns.some((intern) => intern.id === selectedInternId)

    return (
        <AppLayout>
            <div className="auth-card dashboard-card attendance-management">
                <h1>Attendance</h1>
                <p className="attendance-description">Add missing visits or correct an Intern's check-in and check-out times.</p>

                <div className="attendance-management-toolbar">
                    <div className="form-group attendance-intern-search">
                        <label htmlFor="attendance-search">Search Interns</label>
                        <input id="attendance-search" type="search" value={search} placeholder="Name or email" disabled={isSaving || isInternsLoading}
                            onChange={(event) => setSearch(event.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="attendance-intern">Intern</label>
                        <select id="attendance-intern" value={selectedInternId} onChange={changeIntern}
                            disabled={isInternsLoading || isSaving || interns.length === 0}>
                            <option value="">{isInternsLoading ? "Loading Interns..." : "Select an Intern"}</option>
                            {keepSelectedOption && <option value={selectedIntern.id}>{selectedIntern.firstName} {selectedIntern.lastName} ({selectedIntern.email})</option>}
                            {matchingInterns.map((intern) => (
                                <option key={intern.id} value={intern.id}>{intern.firstName} {intern.lastName} ({intern.email})</option>
                            ))}
                        </select>
                    </div>
                    <button className="attendance-action attendance-action-primary" type="button" onClick={() => openForm()}
                        disabled={isLoading || isSaving || !attendance?.internships.length || Boolean(form)}>
                        Add attendance
                    </button>
                </div>

                {!isInternsLoading && !internsError && !selectedInternId && <p className="attendance-muted">
                    {interns.length === 0 ? "No registered Interns are available." : "Choose an Intern to view and correct their attendance."}
                </p>}
                {search.trim() && matchingInterns.length === 0 && <p className="attendance-muted">No Interns match this search. {selectedInternId ? "Your current selection is unchanged." : "Try another name or email."}</p>}

                {internsError && <div className="error-message" role="alert">
                    <p>{internsError}</p>
                    <button className="attendance-action" type="button" onClick={() => setInternsVersion((current) => current + 1)}>Retry</button>
                </div>}
                {error && <div className="error-message" role="alert">
                    <p>{error}</p>
                    <button className="attendance-action" type="button" disabled={isSaving || isLoading} onClick={reloadAttendance}>Reload attendance</button>
                    {form && <small>Reloading closes this form and loads the latest records.</small>}
                </div>}
                {success && <p className="success-message" role="status">{success}</p>}
                {isLoading && <p className="attendance-muted" role="status">Loading attendance...</p>}

                {form && <form className="attendance-correction-form" onSubmit={saveAttendance}>
                    <h2>{form.session ? "Edit attendance" : "Add attendance"}</h2>
                    <p className="attendance-muted">{selectedName} · {attendance.intern.email}<br />Times use your local time zone.</p>
                    {!form.session && attendance.internships.length > 1 && <div className="form-group">
                        <label htmlFor="attendance-internship">Internship</label>
                        <select id="attendance-internship" value={form.internshipId} disabled={isSaving}
                            onChange={(event) => setForm(createForm(attendance.internships.find((item) => item.id === event.target.value)))}>
                            {attendance.internships.map((internship) => <option key={internship.id} value={internship.id}>
                                {formatInternship(internship)}
                            </option>)}
                        </select>
                    </div>}
                    <div className="attendance-form-times">
                        <div className="form-group">
                            <label htmlFor="correction-check-in">Check-in</label>
                            <input id="correction-check-in" type="datetime-local" value={form.checkedInAt} required autoFocus disabled={isSaving}
                                aria-invalid={Boolean(fieldErrors.checkedInAt)} aria-describedby={fieldErrors.checkedInAt ? "correction-check-in-error" : undefined}
                                onChange={(event) => setForm((current) => ({ ...current, checkedInAt: event.target.value }))} />
                            {fieldErrors.checkedInAt && <p className="field-error" id="correction-check-in-error">{fieldErrors.checkedInAt}</p>}
                        </div>
                        <div className="form-group">
                            <label htmlFor="correction-check-out">Check-out <span className="attendance-optional">optional</span></label>
                            <input id="correction-check-out" type="datetime-local" value={form.checkedOutAt} disabled={isSaving}
                                aria-invalid={Boolean(fieldErrors.checkedOutAt)} aria-describedby={`correction-check-out-hint${fieldErrors.checkedOutAt ? " correction-check-out-error" : ""}`}
                                onChange={(event) => setForm((current) => ({ ...current, checkedOutAt: event.target.value }))} />
                            <small id="correction-check-out-hint">Leave empty only if the Intern is still checked in.</small>
                            {fieldErrors.checkedOutAt && <p className="field-error" id="correction-check-out-error">{fieldErrors.checkedOutAt}</p>}
                        </div>
                    </div>
                    <div className="attendance-form-actions">
                        <button className="attendance-action attendance-action-primary" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save attendance"}</button>
                        <button className="attendance-action" type="button" disabled={isSaving} onClick={() => { setForm(null); setFieldErrors({}); setError("") }}>Cancel</button>
                    </div>
                </form>}

                {attendance && !isLoading && <section aria-label={`Attendance for ${selectedName}`}>
                    <div className="attendance-management-heading">
                        <div><h2>{selectedName}</h2><p className="attendance-muted attendance-selected-email">{attendance.intern.email}</p></div>
                        <p className="attendance-muted">{attendance.sessions.length} {attendance.sessions.length === 1 ? "record" : "records"}</p>
                    </div>
                    {attendance.internships.length === 0 && <p className="attendance-muted">This Intern has no internship yet. Start their internship under Interns before adding attendance.</p>}
                    {attendance.internships.length > 0 && attendance.sessions.length === 0 && <p className="attendance-muted">No attendance recorded. Use Add attendance to enter a missing visit.</p>}
                    {attendance.sessions.length > 0 && <ul className="attendance-management-list">
                        {attendance.sessions.map((session) => <li className="attendance-management-row" key={session.id}>
                            <div><span className="attendance-record-label">Check-in</span><strong>{formatTimestamp(session.checkedInAt)}</strong></div>
                            <div><span className="attendance-record-label">Check-out</span><strong>{session.checkedOutAt ? formatTimestamp(session.checkedOutAt) : "Still checked in"}</strong></div>
                            <div><span className="attendance-record-label">Duration</span><strong className={!session.checkedOutAt ? "attendance-open" : ""}>{formatDuration(session)}</strong></div>
                            <div className="attendance-record-actions">
                                <button className="attendance-action" type="button" disabled={isSaving || Boolean(form)} onClick={() => openForm(session)}
                                    aria-label={`Edit attendance starting ${formatTimestamp(session.checkedInAt)}`}>Edit</button>
                                <button className="attendance-action attendance-action-danger" type="button" disabled={isSaving || Boolean(form)} onClick={() => removeAttendance(session)}
                                    aria-label={`Delete attendance starting ${formatTimestamp(session.checkedInAt)}`}>Delete</button>
                            </div>
                        </li>)}
                    </ul>}
                </section>}
            </div>
        </AppLayout>
    )
}

function sortSessions(sessions) {
    return [...sessions].sort((first, second) => Date.parse(second.checkedInAt) - Date.parse(first.checkedInAt))
}

function createForm(internship, session = null) {
    const end = Math.min(Date.now(), internship.endedAt ? Date.parse(internship.endedAt) : Date.now())
    const start = Math.max(Date.parse(internship.startedAt), end - 60 * 60 * 1000)
    return {
        session,
        internshipId: internship.id,
        checkedInAt: toLocalInputValue(session?.checkedInAt || new Date(start).toISOString()),
        checkedOutAt: session ? toLocalInputValue(session.checkedOutAt) : toLocalInputValue(new Date(end).toISOString())
    }
}

function toLocalInputValue(timestamp) {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    const pad = (value) => String(value).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function readTimestamp(value, original) {
    if (original && value === toLocalInputValue(original)) return original
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatInternship(internship) {
    const start = new Date(internship.startedAt).toLocaleDateString()
    return internship.endedAt ? `${start} to ${new Date(internship.endedAt).toLocaleDateString()}` : `Active internship since ${start}`
}

function formatDuration(session) {
    if (!session.checkedOutAt) return "In progress"
    const minutes = Math.floor((Date.parse(session.checkedOutAt) - Date.parse(session.checkedInAt)) / 60000)
    if (minutes < 1) return "Less than 1 min"
    const hours = Math.floor(minutes / 60)
    return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`
}

export default AttendanceManagement
