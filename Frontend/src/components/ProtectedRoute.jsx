import { Navigate } from "react-router-dom"
import {
    getToken,
    getCurrentUser
} from "../services/authService.js"

function ProtectedRoute({ children, requiredRole }) {
    const token = getToken()
    const user = getCurrentUser()

    if (!token || !user) {
        return <Navigate to="/login" replace />
    }

    if (user.role !== requiredRole) {
        if (user.role === "INTERN") {
            return <Navigate to="/intern-dashboard" replace />
        }

        if (user.role === "SUPERVISOR") {
            return <Navigate to="/supervisor-dashboard" replace />
        }

        return <Navigate to="/login" replace />
    }

    return children
}

export default ProtectedRoute