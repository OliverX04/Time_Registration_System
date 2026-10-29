import PresenceSchedule from "./PresenceSchedule.jsx"
import "../styles/internManagement.css"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import {
    getInterns,
    activateIntern,
    deactivateIntern,
    setProjectAssignment
} from "../services/internshipService.js"
import { getProjects } from "../services/projectService.js"

function InternManagementPanel() {
    const [scheduleIntern, setScheduleIntern] = useState(null)
    const pageSize = 20
    const [interns, setInterns] = useState([])
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [projects, setProjects] = useState([])
    const [selectedProjects, setSelectedProjects] = useState({})
    const [message, setMessage] = useState("")
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("all")
    const [page, setPage] = useState(1)
    const [deactivationCandidate, setDeactivationCandidate] = useState(null)
    const [deactivationOutcome, setDeactivationOutcome] = useState("COMPLETED")
    const [activationCandidate, setActivationCandidate] = useState(null)
    const [activationStartDate, setActivationStartDate] = useState("")
    const [activationError, setActivationError] = useState("")

    const filteredInterns = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase()
        return interns.filter((intern) => {
            const status = intern.internshipId
                ? "active"
                : intern.isEnabled
                    ? "awaiting"
                    : intern.lastOutcome
                        ? "former"
                        : "inactive"
            const matchesStatus = statusFilter === "all" || status === statusFilter
            const searchableText = [
                intern.firstName,
                intern.lastName,
                intern.email,
                intern.currentProjectName
            ].filter(Boolean).join(" ").toLocaleLowerCase()
            return matchesStatus && (!normalizedSearch || searchableText.includes(normalizedSearch))
        })
    }, [interns, search, statusFilter])

    const pageCount = Math.max(1, Math.ceil(filteredInterns.length / pageSize))
    const visibleInterns = filteredInterns.slice((page - 1) * pageSize, page * pageSize)

    useEffect(() => {
        let cancelled = false

        async function loadInterns() {
            try {
                const [data, availableProjects] = await Promise.all([getInterns(), getProjects()])
                if (!cancelled) {
                    setInterns(data)
                    setProjects(availableProjects)
                }
            } catch (err) {
                if (!cancelled) setError(err.message)
            }
        }

        loadInterns()

        return () => {
            cancelled = true
        }
    }, [])

    async function handleProjectAssignment(intern, projectId) {
        if (busy) return
        setBusy(true)
        setError("")
        setMessage("")
        try {
            await setProjectAssignment(intern.id, projectId)
            const [data, availableProjects] = await Promise.all([getInterns(), getProjects()])
            setInterns(data)
            setProjects(availableProjects)
            setSelectedProjects({})
            setMessage(`Project assignment ${projectId === null ? "ended" : "saved"} for ${intern.firstName} ${intern.lastName}.`)
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    function handleActivate(intern) {
        if (busy) return
        setError("")
        setMessage("")
        setActivationError("")
        setActivationStartDate(todayDate())
        setActivationCandidate(intern)
    }

    async function confirmActivate(event) {
        event.preventDefault()
        if (busy || !activationCandidate) return

        setBusy(true)
        setActivationError("")
        let activated = false
        try {
            await activateIntern(activationCandidate.id, activationStartDate)
            activated = true
            setActivationCandidate(null)
            setMessage(`${activationCandidate.firstName} ${activationCandidate.lastName} was activated.`)
            setInterns(await getInterns())
        } catch (err) {
            if (activated) setError("The Intern was activated, but the list could not be refreshed. Reload the page to see the updated list.")
            else setActivationError(err.fieldErrors?.startDate || err.message)
        } finally {
            setBusy(false)
        }
    }

    function handleDeactivate(intern) {
        setError("")
        setMessage("")
        setDeactivationOutcome("COMPLETED")
        setDeactivationCandidate(intern)
    }

    async function confirmDeactivate(event) {
        event.preventDefault()
        if (busy || !deactivationCandidate) return

        setBusy(true)
        setError("")

        try {
            await deactivateIntern(deactivationCandidate.id, deactivationOutcome)
            setInterns(await getInterns())
            setMessage(`${deactivationCandidate.firstName} ${deactivationCandidate.lastName} was deactivated.`)
            setDeactivationCandidate(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="intern-management">
            <h2>Manage Interns</h2>

            <p>
                Search, filter and manage registered students.
            </p>

            <div className="intern-list-controls">
                <label>
                    <span>Search interns</span>
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value)
                            setPage(1)
                        }}
                        placeholder="Name, email or project"
                    />
                </label>
                <label>
                    <span>Status</span>
                    <select
                        value={statusFilter}
                        onChange={(event) => {
                            setStatusFilter(event.target.value)
                            setPage(1)
                        }}
                    >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="awaiting">Awaiting activation</option>
                        <option value="former">Former interns</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </label>
                <p className="intern-result-count">{filteredInterns.length} interns</p>
            </div>

            {error && (
                <p className="intern-error-message" role="alert">
                    {error}
                </p>
            )}
            {message && <p role="status">{message}</p>}



            {activationCandidate && <ActivationDialog
                intern={activationCandidate}
                startDate={activationStartDate}
                setStartDate={setActivationStartDate}
                busy={busy}
                error={activationError}
                onSubmit={confirmActivate}
                onCancel={() => setActivationCandidate(null)}
            />}

            {deactivationCandidate && (
                <div className="intern-dialog-backdrop">
                    <form
                        className="intern-deactivation-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="intern-deactivation-title"
                        onSubmit={confirmDeactivate}
                    >
                        <h3 id="intern-deactivation-title">
                            Deactivate {deactivationCandidate.firstName} {deactivationCandidate.lastName}?
                        </h3>
                        <p>This ends the current internship and disables the intern account.</p>
                        <label htmlFor="intern-deactivation-outcome">Outcome</label>
                        <select
                            id="intern-deactivation-outcome"
                            value={deactivationOutcome}
                            onChange={(event) => setDeactivationOutcome(event.target.value)}
                            disabled={busy}
                        >
                            <option value="COMPLETED">Completed</option>
                            <option value="DISCONTINUED">Discontinued</option>
                        </select>
                        {error && <p className="intern-error-message" role="alert">{error}</p>}
                        <div className="intern-deactivation-actions">
                            <button
                                type="button"
                                className="intern-dialog-cancel"
                                disabled={busy}
                                onClick={() => setDeactivationCandidate(null)}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="intern-button deactivate-button" disabled={busy}>
                                {busy ? "Deactivating…" : "Deactivate intern"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {interns.length === 0 && !error && (
                <p>No registered interns found.</p>
            )}

            {interns.length > 0 && filteredInterns.length === 0 && (
                <p className="intern-empty-state">No interns match these filters.</p>
            )}

            {filteredInterns.length > 0 && (
                <>
                    <div className="intern-table-wrap">
                        <table className="intern-table">
                            <thead>
                                <tr><th>Intern</th><th>Project</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {visibleInterns.map((intern) => (
                                    <Fragment key={intern.id}>
                                    <tr>
                                        <th scope="row">
                                            <strong>{intern.firstName} {intern.lastName}</strong>
                                            <span>{intern.email}</span>
                                        </th>
                                        <td>
                                            <span>{intern.currentProjectName || intern.lastProjectName || "Unassigned"}</span>
                                            {Boolean(intern.internshipId && intern.isEnabled) && (
                                                <div className="intern-project-controls">
                                                    <select
                                                        aria-label={`Project for ${intern.firstName} ${intern.lastName}`}
                                                        value={selectedProjects[intern.id] ?? intern.currentProjectId ?? ""}
                                                        disabled={busy}
                                                        onChange={(event) => setSelectedProjects((current) => ({ ...current, [intern.id]: event.target.value }))}
                                                    >
                                                        <option value="">Choose a project</option>
                                                        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="intern-button activate-button"
                                                        disabled={busy || !selectedProjects[intern.id] || selectedProjects[intern.id] === intern.currentProjectId}
                                                        onClick={() => handleProjectAssignment(intern, selectedProjects[intern.id])}
                                                    >
                                                        {intern.currentProjectId ? "Change" : "Assign"}
                                                    </button>
                                                    {intern.currentProjectId && (
                                                        <button type="button" className="intern-button deactivate-button" disabled={busy} onClick={() => handleProjectAssignment(intern, null)}>
                                                            End
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={intern.internshipId ? "intern-active" : intern.isEnabled ? "intern-awaiting" : "intern-inactive"}>
                                                {intern.internshipId
                                                    ? "Active"
                                                    : intern.isEnabled
                                                        ? "Awaiting activation"
                                                        : intern.lastOutcome
                                                            ? `Former · ${intern.lastOutcome.toLowerCase()}`
                                                            : "Inactive"}
                                            </span>
                                            {!intern.internshipId && intern.lastEndedAt && (
                                                <div>{formatDate(intern.lastEndedAt)}</div>
                                            )}
                                        </td>
                                        <td>
                                            {Boolean(intern.isEnabled) && <button type="button" className="intern-button activate-button" disabled={busy} onClick={() => setScheduleIntern(intern)}>Schedule</button>}
                                            {intern.internshipId ? (
                                                <button type="button" className="intern-button deactivate-button" disabled={busy} onClick={() => handleDeactivate(intern)}>
                                                    Deactivate
                                                </button>
                                            ) : (
                                                <button type="button" className="intern-button activate-button" disabled={busy} onClick={() => handleActivate(intern)}>
                                                    Activate
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {scheduleIntern?.id === intern.id && <tr className="intern-schedule-row"><td colSpan={4}>
            {scheduleIntern && <PresenceSchedule key={scheduleIntern.id} intern={scheduleIntern} onCancel={() => setScheduleIntern(null)} onSaved={async () => {
                setInterns(await getInterns())
                setScheduleIntern(null)
                setMessage("Presence schedule saved.")
            }} />}
                                    </td></tr>}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredInterns.length > pageSize && (
                        <div className="intern-pagination" aria-label="Intern list pages">
                            <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredInterns.length)} of {filteredInterns.length}</span>
                            <div>
                                <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                                <span>Page {page} of {pageCount}</span>
                                <button type="button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}

function ActivationDialog({ intern, startDate, setStartDate, busy, error, onSubmit, onCancel }) {
    const dialog = useRef(null)

    useEffect(() => {
        dialog.current.showModal()
    }, [])

    return (
        <dialog className="intern-activation-dialog" ref={dialog} aria-labelledby="intern-activation-title"
            onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}>
            <form onSubmit={onSubmit}>
                <h3 id="intern-activation-title">Activate {intern.firstName} {intern.lastName}?</h3>
                <p>Choose the first day of their internship.</p>
                <label htmlFor="intern-activation-start">Internship start date</label>
                <input id="intern-activation-start" type="date" value={startDate} max={todayDate()} required disabled={busy}
                    aria-describedby="intern-activation-hint" aria-invalid={Boolean(error)}
                    onChange={(event) => setStartDate(event.target.value)} />
                <small id="intern-activation-hint">Use the actual first day, even if it was earlier this week. Attendance can then be added for the missed days.</small>
                {error && <p className="intern-error-message" role="alert">{error}</p>}
                <div className="intern-deactivation-actions">
                    <button type="button" className="intern-dialog-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
                    <button type="submit" className="intern-button activate-button" disabled={busy}>
                        {busy ? "Activating..." : "Activate intern"}
                    </button>
                </div>
            </form>
        </dialog>
    )
}

function todayDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date())
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${values.year}-${values.month}-${values.day}`
}

function formatDate(value) {
    return `Ended ${new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Copenhagen"
    }).format(new Date(value))}`
}

export default InternManagementPanel
