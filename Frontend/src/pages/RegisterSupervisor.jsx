import AppLayout from "../components/AppLayout.jsx"
import { useState } from "react"
import { registerSupervisor } from "../services/supervisorService.js"

function RegisterSupervisor() {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [fieldErrors, setFieldErrors] = useState({})
    const [message, setMessage] = useState("")

    async function handleSubmit(event) {
        event.preventDefault()

        if (busy) return

        setBusy(true)
        setError("")
        setFieldErrors({})
        setMessage("")

        const form = event.currentTarget
        const formData = new FormData(form)

        try {
            const result = await registerSupervisor(
                formData.get("firstName"),
                formData.get("lastName"),
                formData.get("email"),
                formData.get("password")
            )

            setMessage(result.message)
            form.reset()
        } catch (err) {
            setError(err.message)
            setFieldErrors(err.fieldErrors ?? {})
        } finally {
            setBusy(false)
        }
    }
    return (
        <AppLayout>
            <section className="auth-card register-supervisor-card">
                <h1>Register New Supervisor</h1>
                <p className="auth-subtitle">
                    Create an account for another Supervisor.
                </p>
                {error && (
                    <p className="error-message" role="alert">
                        {error}
                    </p>
                )}

                {message && (
                    <p className="success-message" role="status">
                        {message}
                    </p>
                )}
                <form onSubmit={handleSubmit}>
                    <div className="name-row">
                        <div className="form-group">
                            <label htmlFor="firstName">First name</label>
                            <input id="firstName" name="firstName" type="text" required
                                aria-invalid={Boolean(fieldErrors.firstName)}
                                aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined} />
                            {fieldErrors.firstName && <p id="firstName-error" className="field-error">{fieldErrors.firstName}</p>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="lastName">Last name</label>
                            <input id="lastName" name="lastName" type="text" required
                                aria-invalid={Boolean(fieldErrors.lastName)}
                                aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined} />
                            {fieldErrors.lastName && <p id="lastName-error" className="field-error">{fieldErrors.lastName}</p>}
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" required
                            aria-invalid={Boolean(fieldErrors.email)}
                            aria-describedby={fieldErrors.email ? "email-error" : undefined} />
                        {fieldErrors.email && <p id="email-error" className="field-error">{fieldErrors.email}</p>}
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Initial password</label>
                        <input id="password" name="password" type="password" autoComplete="new-password" required
                            aria-invalid={Boolean(fieldErrors.password)}
                            aria-describedby={fieldErrors.password ? "password-error" : undefined} />
                        {fieldErrors.password && <p id="password-error" className="field-error">{fieldErrors.password}</p>}
                    </div>

                    <button type="submit" className="auth-button" disabled={busy}>
                        {busy ? "Registering..." : "Register Supervisor"}
                    </button>
                </form>
            </section>
        </AppLayout>
    )
}

export default RegisterSupervisor
