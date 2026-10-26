
import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import {
    getToken,
    getCurrentUser,
    checkAccountStatus,
    logoutUser
} from "../services/authService.js"

function ProtectedRoute({ children, requiredRole }) {
    const token = getToken()
    const user = getCurrentUser()
    const userId = user?.id

    const [status, setStatus] = useState("checking")

    useEffect(() => {
        let cancelled = false

        async function verifyAccount() {
            if (!token || !userId) {
                setStatus("loggedOut")
                return
            }

            try {
                const isEnabled = await checkAccountStatus()

                if (cancelled) return

                if (!isEnabled) {
                    logoutUser()
                    setStatus("loggedOut")
                } else {
                    setStatus("allowed")
                }
            } catch {
                if (!cancelled) {
                    setStatus("error")
                }
            }
        }

        verifyAccount()

        return () => {
            cancelled = true
        }
    }, [token, userId])

    if (!token || !userId || status === "loggedOut") {
        return <Navigate to="/login" replace />
    }

    if (user.role !== requiredRole) {
        return <Navigate to="/login" replace />
    }

    if (status === "checking") {
        return <p>Checking account access...</p>
    }

    if (status === "error") {
        return (
            <div>
                <p>Unable to verify your account.</p>
                <button onClick={() => window.location.reload()}>
                    Try Again
                </button>
            </div>
        )
    }

    return children
}

export default ProtectedRoute
