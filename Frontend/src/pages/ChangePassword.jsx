import { useState } from "react"
import { useNavigate } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { changePassword, logoutUser } from "../services/authService.js"

function ChangePassword() {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const navigate = useNavigate()

    async function handleSubmit(event) {
        event.preventDefault()
        if (busy) return

        const { currentPassword, newPassword, confirmPassword } = Object.fromEntries(new FormData(event.currentTarget))
        setError("")
        if (newPassword !== confirmPassword) {
            setError("The new passwords do not match.")
            return
        }

        setBusy(true)
        try {
            await changePassword(currentPassword, newPassword)
            logoutUser()
            navigate("/login", { replace: true, state: { passwordChanged: true } })
        } catch (err) {
            setError(err.message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <h1>Change password</h1>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="currentPassword">Current password</label>
                        <input id="currentPassword" name="currentPassword" type="password"
                            autoComplete="current-password" required disabled={busy} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="newPassword">New password</label>
                        <input id="newPassword" name="newPassword" type="password"
                            autoComplete="new-password" required disabled={busy} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm new password</label>
                        <input id="confirmPassword" name="confirmPassword" type="password"
                            autoComplete="new-password" required disabled={busy} />
                    </div>
                    {error && <p className="error-message" role="alert">{error}</p>}
                    <button className="auth-button" type="submit" disabled={busy}>
                        {busy ? "Saving..." : "Change password"}
                    </button>
                </form>
            </div>
        </AppLayout>
    )
}

export default ChangePassword
