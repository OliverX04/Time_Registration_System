import AppLayout from "../components/AppLayout.jsx"
import InternManagementPanel from "../components/InternManagementPanel.jsx"

function Interns() {
    return (
        <AppLayout>
            <div className="auth-card dashboard-card">
                <InternManagementPanel />
            </div>
        </AppLayout>
    )
}

export default Interns
