import { useNavigate } from "react-router-dom"
import {
    getCurrentUser,
    logoutUser
} from "../services/authService.js"
import TaskDefinitionPanel from "../components/TaskDefinitionPanel.jsx"

function SupervisorDashboard() {
    const navigate = useNavigate()
    const user = getCurrentUser()

    function handleLogout() {
        logoutUser()
        navigate("/login")
    }

    return (
        <div className="auth-page">
            <div className="auth-card dashboard-card">
                <h1>
                    Hello {user?.firstName}
                </h1>

                <p className="auth-subtitle">
                    Welcome to your Supervisor Dashboard.
                </p>

                <TaskDefinitionPanel userRole="SUPERVISOR" />

                <button
                    className="auth-button"
                    onClick={handleLogout}
                >
                    Log Out
                </button>
            </div>
        </div>
    )
}

export default SupervisorDashboard
