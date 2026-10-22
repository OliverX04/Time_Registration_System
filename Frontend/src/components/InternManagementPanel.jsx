import "../styles/internManagement.css"

import { useEffect, useState } from "react"
import {
    getInterns,
    activateIntern,
    deactivateIntern,
    setProjectAssignment
} from "../services/internshipService.js"
import { getProjects } from "../services/projectService.js"

function InternManagementPanel() {
    const [interns, setInterns] = useState([])
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [projects, setProjects] = useState([])
    const [selectedProjects, setSelectedProjects] = useState({})
    const [message, setMessage] = useState("")

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
                View registered students and manage their internship status.
            </p>

            {error && (
                <p className="intern-error-message" role="alert">
                    {error}
                </p>
            )}
            {message && <p role="status">{message}</p>}

            {interns.length === 0 && !error && (
                <p>No registered interns found.</p>
            )}

            {interns.map((intern) => (
                <div key={intern.id} className="intern-card">
                    <h3>
                        {intern.firstName} {intern.lastName}
                    </h3>

                    <p>Email: {intern.email}</p>
                    <p>Current project: {intern.currentProjectName || "Unassigned"}</p>
                    {Boolean(intern.internshipId && intern.isEnabled) && (
                        <div className="intern-project-controls">
                            <label htmlFor={`project-${intern.id}`}>Project</label>
                            <select
                                id={`project-${intern.id}`}
                                value={selectedProjects[intern.id] ?? intern.currentProjectId ?? ""}
                                disabled={busy}
                                onChange={(event) => setSelectedProjects({ ...selectedProjects, [intern.id]: event.target.value })}
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
                                {intern.currentProjectId ? "Change Project" : "Assign Project"}
                            </button>
                            {intern.currentProjectId && (
                                <button type="button" className="intern-button deactivate-button" disabled={busy} onClick={() => handleProjectAssignment(intern, null)}>
                                    End Assignment
                                </button>
                            )}
                            {projects.length === 0 && <p>No active projects available. Create a project first.</p>}
                        </div>
                    )}

                    <p>
                        Status:{" "}
                        <span
                            className={
                                intern.internshipId
                                    ? "intern-active"
                                    : intern.isEnabled
                                        ? "intern-awaiting"
                                        : "intern-inactive"
                            }
                        >
                            {intern.internshipId
                                ? "Active"
                                : intern.isEnabled
                                    ? "Awaiting activation"
                                    : "Inactive"}
                        </span>
                    </p>

                    {intern.internshipId ? (
                        <button
                            type="button"
                            className="intern-button deactivate-button"
                            disabled={busy}
                            onClick={() => handleDeactivate(intern)}
                        >
                            Deactivate Intern
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="intern-button activate-button"
                            disabled={busy}
                            onClick={() => handleActivate(intern)}
                        >
                            Activate Intern
                        </button>
                    )}
                </div>
            ))}
        </section>
    )
}

export default InternManagementPanel
