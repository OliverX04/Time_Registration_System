import AppLayout from "../components/AppLayout.jsx"
import { useState } from "react"
import { registerSupervisor } from "../services/supervisorService.js"

function RegisterSupervisor() {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    async function handleSubmit(event) {
        event.preventDefault()

        if (busy) return

        setBusy(true)
        setError("")
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
        } finally {
            setBusy(false)
        }
    }
    return (
        <AppLayout>
            <section className="auth-card">
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
                            <input id="firstName" name="firstName" type="text" required />
                        </div>

                        <div className="form-group">
                            <label htmlFor="lastName">Last name</label>
                            <input id="lastName" name="lastName" type="text" required />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" required />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Initial password</label>
                        <input id="password" name="password" type="password" required />
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