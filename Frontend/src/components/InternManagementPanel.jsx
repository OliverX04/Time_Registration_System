import "../styles/internManagement.css"

import { useEffect, useMemo, useState } from "react"
import {
    getInterns,
    activateIntern,
    deactivateIntern,
    setProjectAssignment
} from "../services/internshipService.js"
import { getProjects } from "../services/projectService.js"

function InternManagementPanel() {
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

    async function handleActivate(intern) {
        if (busy) return

        const confirmed = window.confirm(
            `Activate ${intern.firstName} ${intern.lastName}?`
        )

        if (!confirmed) return

        setBusy(true)
        setError("")

        try {
            await activateIntern(intern.id)
            setInterns(await getInterns())
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    async function handleDeactivate(intern) {
        if (busy) return

        const outcome = window.prompt(
            "Enter COMPLETED or DISCONTINUED:",
            "COMPLETED"
        )

        if (outcome === null) return

        const selectedOutcome = outcome.trim().toUpperCase()

        if (!["COMPLETED", "DISCONTINUED"].includes(selectedOutcome)) {
            setError("Please enter COMPLETED or DISCONTINUED.")
            return
        }

        const confirmed = window.confirm(
            `Deactivate ${intern.firstName} ${intern.lastName}?`
        )

        if (!confirmed) return

        setBusy(true)
        setError("")

        try {
            await deactivateIntern(intern.id, selectedOutcome)
            setInterns(await getInterns())
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
                                    <tr key={intern.id}>
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

function formatDate(value) {
    return `Ended ${new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Copenhagen"
    }).format(new Date(value))}`
}

export default InternManagementPanel
