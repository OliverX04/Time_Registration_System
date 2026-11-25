import { getCurrentUser } from "../services/authService.js"
import AppLayout from "../components/AppLayout.jsx"
import { Link } from "react-router-dom"

function SupervisorDashboard() {
    const user = getCurrentUser()

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <div className="dashboard-welcome">
                    <span className="dashboard-label">
                        SUPERVISOR DASHBOARD
                    </span>

                    <h1>Hello {user?.firstName}</h1>

                    <p>
                        Welcome back! Choose a section to get started.
                    </p>
                </div>
                <div className="dashboard-shortcuts">
                    <h2>Quick access</h2>

                    <div className="dashboard-shortcut-grid">
                        <Link to="/supervisor-dashboard/interns" className="dashboard-shortcut">
                            <span className="dashboard-shortcut-icon" aria-hidden="true">👥</span>
                            <strong>Manage Interns</strong>
                            <span className="dashboard-shortcut-description">
                                View and manage interns
                            </span>
                        </Link>

                        <Link to="/supervisor-dashboard/projects" className="dashboard-shortcut">
                            <span className="dashboard-shortcut-icon" aria-hidden="true">📁</span>
                            <strong>Projects</strong>
                            <span className="dashboard-shortcut-description">
                                Organize projects
                            </span>
                        </Link>

                        <Link to="/supervisor-dashboard/attendance" className="dashboard-shortcut">
                            <span className="dashboard-shortcut-icon" aria-hidden="true">📅</span>
                            <strong>Attendance</strong>
                            <span className="dashboard-shortcut-description">
                                Review attendance records
                            </span>
                        </Link>

                        <Link to="/supervisor-dashboard/statistics" className="dashboard-shortcut">
                            <span className="dashboard-shortcut-icon" aria-hidden="true">📊</span>
                            <strong>Statistics</strong>
                            <span className="dashboard-shortcut-description">
                                Explore time reports
                            </span>
                        </Link>
                    </div>
                </div>

            </div>
        </AppLayout>
    )
}

export default SupervisorDashboard
