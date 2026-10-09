import { getCurrentUser } from "../services/authService.js"
import AppLayout from "../components/AppLayout.jsx"
import AttendancePanel from "../components/AttendancePanel.jsx"

function InternDashboard() {
    const user = getCurrentUser()

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <h1>
                    Hello {user?.firstName}
                </h1>

                <p className="auth-subtitle">
                    Welcome to your Intern Dashboard.
                </p>

                <AttendancePanel />
            </div>
        </AppLayout>
    )
}

export default InternDashboard
