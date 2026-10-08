import { useEffect, useState } from "react"
import { archiveProject, createProject, getProjects, getProjectTasks, updateProject } from "../services/projectService.js"
import "../styles/projects.css"

function ProjectManagementPanel({ onProjectsChanged }) {
    const [projects, setProjects] = useState([])
    const [includeArchived, setIncludeArchived] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [fieldErrors, setFieldErrors] = useState({})
    const [archiveCandidate, setArchiveCandidate] = useState(null)
    const [viewedProject, setViewedProject] = useState(null)
    const [tasks, setTasks] = useState([])

    useEffect(() => {
        let cancelled = false
        async function loadProjects() {
            setIsLoading(true)
            setError("")
            try {
                const loadedProjects = await getProjects(includeArchived)
                if (!cancelled) setProjects(loadedProjects)
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        loadProjects()
        return () => { cancelled = true }
    }, [includeArchived])

    function closeForm() {
        setIsFormOpen(false)
        setEditingId(null)
        setName("")
        setDescription("")
        setFieldErrors({})
    }

    function openForm(project = null) {
        setEditingId(project?.id || null)
        setName(project?.name || "")
        setDescription(project?.description || "")
        setFieldErrors({})
        setError("")
        setSuccess("")
        setArchiveCandidate(null)
        setIsFormOpen(true)
    }

    function replaceProject(project) {
        setProjects((currentProjects) => {
            const updatedProjects = currentProjects.filter((item) => item.id !== project.id)
            if (includeArchived || !project.archivedAt) updatedProjects.push(project)
            return updatedProjects.sort((left, right) => left.name.localeCompare(right.name))
        })
    }

    async function handleSave(event) {
        event.preventDefault()
        if (isBusy || isLoading) return
        const errors = {}
        if (!name.trim() || name.trim().length > 100) errors.name = "Enter a project name of up to 100 characters."
        if (description.trim().length > 2000) errors.description = "Use at most 2,000 characters."
        setFieldErrors(errors)
        setError("")
        setSuccess("")
        if (Object.keys(errors).length) return

        setIsBusy(true)
        try {
            const project = editingId
                ? await updateProject(editingId, name.trim(), description.trim())
                : await createProject(name.trim(), description.trim())
            replaceProject(project)
            setSuccess(editingId ? "Project updated." : "Project created.")
            closeForm()
            setViewedProject(null)
            onProjectsChanged()
        } catch (err) {
            setError(err.message)
            setFieldErrors(err.fieldErrors || {})
        } finally {
            setIsBusy(false)
        }
    }

    async function handleArchive() {
        if (!archiveCandidate || isBusy || isLoading) return
        setIsBusy(true)
        setError("")
        setSuccess("")
        try {
            const project = await archiveProject(archiveCandidate.id)
            replaceProject(project)
            setArchiveCandidate(null)
            closeForm()
            setViewedProject(null)
            setSuccess("Project archived. Its history is kept.")
            onProjectsChanged()
        } catch (err) {
            setError(err.message)
        } finally {
            setIsBusy(false)
        }
    }

    async function handleViewTasks(project) {
        if (isBusy || isLoading) return
        setIsBusy(true)
        setError("")
        try {
            const loadedTasks = await getProjectTasks(project.id)
            setTasks(loadedTasks)
            setViewedProject(project)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <section className="task-section" aria-labelledby="projects-heading">
            <h2 id="projects-heading">Manage Projects</h2>
            <p className="task-helper">Create, edit or archive projects. Archiving keeps tasks and recorded time.</p>
            <div className="project-toolbar">
                <label className="project-filter">
                    <input type="checkbox" checked={includeArchived} disabled={isBusy}
                        onChange={(event) => setIncludeArchived(event.target.checked)} />
                    Show archived projects
                </label>
                <button className="project-action project-action-primary" disabled={isBusy || isLoading} onClick={() => openForm()}>New Project</button>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            {success && <p className="success-message" role="status">{success}</p>}
            {isLoading ? <p className="task-helper">Loading projects...</p> : (
                <ul className="project-list">
                    {projects.length === 0 && <li className="task-empty">{includeArchived ? "No projects available." : "No active projects available."}</li>}
                    {projects.map((project) => (
                        <li key={project.id} className="project-row">
                            <div className="project-summary">
                                <h3>{project.name}</h3>
                                <span className="task-role-badge">{project.archivedAt ? "Archived" : "Active"}</span>
                                {project.description && <p>{project.description}</p>}
                            </div>
                            <div className="project-actions">
                                <button className="project-action" disabled={isBusy} onClick={() => handleViewTasks(project)}>View Tasks</button>
                                {!project.archivedAt && <>
                                    <button className="project-action" disabled={isBusy} onClick={() => openForm(project)}>Edit</button>
                                    <button className="project-action" disabled={isBusy} onClick={() => {
                                        closeForm()
                                        setError("")
                                        setSuccess("")
                                        setArchiveCandidate(project)
                                    }}>Archive</button>
                                </>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {isFormOpen && (
                <form className="task-panel project-form" onSubmit={handleSave} noValidate>
                    <h3>{editingId ? "Edit Project" : "Create Project"}</h3>
                    <div className="form-group">
                        <label htmlFor="projectName">Project Name</label>
                        <input id="projectName" value={name} required
                            onChange={(event) => setName(event.target.value)}
                            aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "projectName-error" : undefined} />
                        {fieldErrors.name && <p className="field-error" id="projectName-error">{fieldErrors.name}</p>}
                    </div>
                    <div className="form-group">
                        <label htmlFor="projectDescription">Project Description (optional)</label>
                        <textarea id="projectDescription" rows="3" value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            aria-invalid={Boolean(fieldErrors.description)} aria-describedby={fieldErrors.description ? "projectDescription-error" : undefined} />
                        {fieldErrors.description && <p className="field-error" id="projectDescription-error">{fieldErrors.description}</p>}
                    </div>
                    {Object.keys(fieldErrors).length > 0 && !error &&
                        <p className="error-message" role="alert">Check the highlighted fields.</p>}
                    <div className="project-actions">
                        <button type="button" className="project-action" disabled={isBusy} onClick={closeForm}>Cancel</button>
                        <button type="submit" className="project-action project-action-primary" disabled={isBusy || isLoading}>
                            {isBusy ? "Saving..." : editingId ? "Save Changes" : "Create Project"}
                        </button>
                    </div>
                </form>
            )}
            {archiveCandidate && (
                <section className="task-panel project-confirmation" aria-labelledby="archive-heading">
                    <h3 id="archive-heading">Archive "{archiveCandidate.name}"?</h3>
                    <p>The project will leave the active list. Its tasks and recorded time will be kept.</p>
                    {archiveCandidate.activeAssignmentCount > 0 ? (
                        <p className="error-message" role="alert">This project has active Intern assignments. End those assignments before archiving.</p>
                    ) : <p>New tasks cannot be created in an archived project.</p>}
                    <div className="project-actions">
                        <button className="project-action" disabled={isBusy} onClick={() => setArchiveCandidate(null)}>Cancel Archive</button>
                        <button className="project-action project-action-primary" disabled={isBusy || isLoading || archiveCandidate.activeAssignmentCount > 0} onClick={handleArchive}>
                            {isBusy ? "Archiving..." : "Confirm Archive"}
                        </button>
                    </div>
                </section>
            )}
            {viewedProject && (
                <section className="task-panel project-history" aria-labelledby="projectTasks-heading">
                    <h3 id="projectTasks-heading">Tasks: {viewedProject.name}</h3>
                    {tasks.length === 0 ? <p className="task-empty">No tasks for this project yet.</p> : (
                        <ul>{tasks.map((task) => <li key={task.id}><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}</li>)}</ul>
                    )}
                    <button className="project-action" disabled={isBusy} onClick={() => setViewedProject(null)}>Close Tasks</button>
                </section>
            )}
        </section>
    )
}

export default ProjectManagementPanel
