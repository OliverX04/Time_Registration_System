import { getCurrentUser } from "../services/authService.js"
import AppLayout from "../components/AppLayout.jsx"
import InternManagementPanel from "../components/InternManagementPanel.jsx"

function SupervisorDashboard() {
    const user = getCurrentUser()

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <h1>
                    Hello {user?.firstName}
                </h1>

                <p className="auth-subtitle">
                    Welcome to your Supervisor Dashboard.
                </p>

                <InternManagementPanel />

            </div>
        </AppLayout>
    )
}

export default SupervisorDashboard
