import { NavLink, useNavigate } from "react-router-dom"
import {
    getCurrentUser,
    logoutUser
} from "../services/authService.js"
import "../styles/sidebar.css"

function AppLayout({ children }) {
    const navigate = useNavigate()
    const user = getCurrentUser()
    const isSupervisor = user?.role === "SUPERVISOR"
    const homePath = isSupervisor
        ? "/supervisor-dashboard"
        : "/intern-dashboard"

    function handleLogout() {
        logoutUser()
        navigate("/login")
    }

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <nav className="sidebar-navigation" aria-label="Main navigation">
                    <NavLink className="sidebar-link" to={homePath} end>
                        Home
                    </NavLink>

                    {!isSupervisor && (
                        <NavLink className="sidebar-link" to={`${homePath}/attendance-history`}>
                            Attendance History
                        </NavLink>
                    )}

                    {isSupervisor && (
                        <NavLink className="sidebar-link" to={`${homePath}/projects`}>
                            Projects
                        </NavLink>
                    )}

                    <NavLink className="sidebar-link" to={`${homePath}/tasks`}>
                        Tasks
                    </NavLink>

                    <button
                        className="sidebar-link sidebar-logout"
                        type="button"
                        onClick={handleLogout}
                    >
                        Logout
                    </button>
                </nav>
            </aside>

            <main className="app-content">
                {children}
            </main>
        </div>
    )
}

export default AppLayout
