import "../styles/internManagement.css"

import { useEffect, useState } from "react"
import {
    getInterns,
    activateIntern,
    deactivateIntern
} from "../services/internshipService.js"

function InternManagementPanel() {
    const [interns, setInterns] = useState([])
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let cancelled = false

        async function loadInterns() {
            try {
                const data = await getInterns()
                if (!cancelled) setInterns(data)
            } catch (err) {
                if (!cancelled) setError(err.message)
            }
        }

        loadInterns()

        return () => {
            cancelled = true
        }
    }, [])

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

            {interns.length === 0 && !error && (
                <p>No registered interns found.</p>
            )}

            {interns.map((intern) => (
                <div key={intern.id} className="intern-card">
                    <h3>
                        {intern.firstName} {intern.lastName}
                    </h3>

                    <p>Email: {intern.email}</p>

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
