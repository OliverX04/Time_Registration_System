import { Routes, Route, Navigate } from "react-router-dom"
import Register from "./pages/Register.jsx"
import Login from "./pages/Login.jsx"
import InternDashboard from "./pages/InternDashboard.jsx"
import SupervisorDashboard from "./pages/SupervisorDashboard.jsx"
import Projects from "./pages/Projects.jsx"
import Tasks from "./pages/Tasks.jsx"
import AttendanceHistory from "./pages/AttendanceHistory.jsx"
import ProtectedRoute from "./components/ProtectedRoute.jsx"
import "./styles/auth.css"

function App() {
    return (
        <Routes>
            <Route
                path="/register"
                element={<Register />}
            />

            <Route
                path="/login"
                element={<Login />}
            />

            <Route
                path="/intern-dashboard"
                element={
                    <ProtectedRoute requiredRole="INTERN">
                        <InternDashboard />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/supervisor-dashboard"
                element={
                    <ProtectedRoute requiredRole="SUPERVISOR">
                        <SupervisorDashboard />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/intern-dashboard/tasks"
                element={
                    <ProtectedRoute requiredRole="INTERN">
                        <Tasks />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/intern-dashboard/attendance-history"
                element={
                    <ProtectedRoute requiredRole="INTERN">
                        <AttendanceHistory />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/supervisor-dashboard/projects"
                element={
                    <ProtectedRoute requiredRole="SUPERVISOR">
                        <Projects />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/supervisor-dashboard/tasks"
                element={
                    <ProtectedRoute requiredRole="SUPERVISOR">
                        <Tasks />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/"
                element={<Navigate to="/login" />}
            />
        </Routes>
    )
}

export default App
