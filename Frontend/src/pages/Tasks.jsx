import AppLayout from "../components/AppLayout.jsx"
import TaskDefinitionPanel from "../components/TaskDefinitionPanel.jsx"
import { getCurrentUser } from "../services/authService.js"

function Tasks() {
    const user = getCurrentUser()

    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <TaskDefinitionPanel userRole={user?.role} />
            </div>
        </AppLayout>
    )
}

export default Tasks
