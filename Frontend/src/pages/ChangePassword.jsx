import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import AppLayout from "../components/AppLayout.jsx"
import { changePassword, getToken, logoutUser } from "../services/authService.js"

function ChangePassword() {
    const [formToken] = useState(getToken)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const mounted = useRef(false)
    const navigate = useNavigate()

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
    }, [])

    async function handleSubmit(event) {
        event.preventDefault()
        if (busy) return

        setError("")
        setNotice("")
        if (!formToken || getToken() !== formToken) {
            setError("Your login changed. Reload this page before changing your password.")
            return
        }

        const { currentPassword, newPassword, confirmPassword } = Object.fromEntries(new FormData(event.currentTarget))
        if (newPassword !== confirmPassword) {
            setError("The new passwords do not match.")
            return
        }

        setBusy(true)
        try {
            await changePassword(currentPassword, newPassword, formToken)
            if (getToken() !== formToken) {
                if (mounted.current) {
                    setNotice("Password changed for the previous login. Reload this page to continue.")
                }
                return
            }

            logoutUser()
            if (mounted.current) {
                navigate("/login", { replace: true, state: { passwordChanged: true } })
            }
        } catch (err) {
            if (mounted.current) setError(err.message)
        } finally {
            if (mounted.current) setBusy(false)
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
                    {notice && <p className="success-message" role="status">{notice}</p>}
                    <button className="auth-button" type="submit" disabled={busy}>
                        {busy ? "Saving..." : "Change password"}
                    </button>
                </form>
            </div>
        </AppLayout>
    )
}

export default ChangePassword
