import AppLayout from "../components/AppLayout.jsx"
import ProjectManagementPanel from "../components/ProjectManagementPanel.jsx"

function Projects() {
    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <ProjectManagementPanel />
            </div>
        </AppLayout>
    )
}

export default Projects
