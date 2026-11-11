import { useEffect, useState } from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { getAttendanceHistory } from "../services/attendanceService.js"
import { attendanceDecisionsSeen, unseenAttendanceDecisions } from "../services/attendanceDecisions.js"
import {
    getCurrentUser,
    logoutUser
} from "../services/authService.js"
import "../styles/sidebar.css"

function AppLayout({ children }) {
    const navigate = useNavigate()
    const user = getCurrentUser()
    const internId = user?.role === "INTERN" ? user.id : null
    const { pathname } = useLocation()
    const [decisionCount, setDecisionCount] = useState(0)
    const isSupervisor = user?.role === "SUPERVISOR"
    const homePath = isSupervisor
        ? "/supervisor-dashboard"
        : "/intern-dashboard"

    useEffect(() => {
        if (!internId) return
        let active = true
        let requests = []
        let latestLoad = 0

        function updateCount() {
            setDecisionCount(unseenAttendanceDecisions(requests, internId).length)
        }

        async function loadDecisions() {
            const load = ++latestLoad
            try {
                const result = await getAttendanceHistory()
                if (!active || load !== latestLoad) return
                requests = result.requests
                updateCount()
            } catch {
                // Attendance History handles errors when the user opens it.
            }
        }

        loadDecisions()
        window.addEventListener("focus", loadDecisions)
        window.addEventListener(attendanceDecisionsSeen, updateCount)
        window.addEventListener("storage", updateCount)
        return () => {
            active = false
            window.removeEventListener("focus", loadDecisions)
            window.removeEventListener(attendanceDecisionsSeen, updateCount)
            window.removeEventListener("storage", updateCount)
        }
    }, [internId, pathname])

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
                        <>
                            <NavLink className="sidebar-link sidebar-link-with-badge" to={`${homePath}/attendance-history`}>
                                Attendance History
                                {decisionCount > 0 && (
                                    <span className="sidebar-notification-badge"
                                        aria-label={`${decisionCount} unread correction notifications`}>
                                        {decisionCount > 99 ? "99+" : decisionCount}
                                    </span>
                                )}
                            </NavLink>

                        </>
                    )}

                    {isSupervisor && (
                        <NavLink className="sidebar-link" to={`${homePath}/projects`}>
                            Projects
                        </NavLink>
                    )}

                    {isSupervisor && (
                        <NavLink className="sidebar-link" to={`${homePath}/interns`}>
                            Interns
                        </NavLink>
                    )}

                    {isSupervisor && (
                        <NavLink className="sidebar-link" to={`${homePath}/attendance`}>
                            Attendance
                        </NavLink>
                    )}

                    <NavLink className="sidebar-link" to={`${homePath}/statistics`}>
                        Statistics
                    </NavLink>

                    <NavLink className="sidebar-link" to={`${homePath}/tasks`}>
                        Tasks
                    </NavLink>

                    <NavLink className="sidebar-link" to="/change-password">
                        Change password
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
