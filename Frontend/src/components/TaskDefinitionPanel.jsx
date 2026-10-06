import { useEffect, useState } from "react"
import {
    createProjectTask,
    getProjects,
    getProjectTasks
} from "../services/projectService.js"

function TaskDefinitionPanel({ userRole, projectsVersion = 0 }) {
    const [projects, setProjects] = useState([])
    const [selectedProjectId, setSelectedProjectId] = useState("")
    const [tasks, setTasks] = useState([])
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [tasksVersion, setTasksVersion] = useState(0)
    const selectedProject = projects.find((project) => project.id === selectedProjectId)

    useEffect(() => {
        let cancelled = false
        async function loadProjects() {
            setIsLoading(true)
            try {
                const loadedProjects = await getProjects()

                if (cancelled) return
                setProjects(loadedProjects)
                setSelectedProjectId((currentId) => currentId || loadedProjects[0]?.id || "")
            } catch (err) {
                if (!cancelled) setError(`Could not load projects. ${err.message}`)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadProjects()
        return () => { cancelled = true }
    }, [projectsVersion])

    useEffect(() => {
        let cancelled = false
        async function loadTasks() {
            setTasks([])
            if (!selectedProject) return

            try {
                const loadedTasks = await getProjectTasks(selectedProject.id)

                if (!cancelled) setTasks(loadedTasks)
            } catch (err) {
                if (!cancelled) setError(`Could not load tasks. ${err.message}`)
            }
        }

        loadTasks()
        return () => { cancelled = true }
    }, [selectedProject, tasksVersion])

    async function handleCreateTask(event) {
        event.preventDefault()
        if (isSubmitting || isLoading || !selectedProject) return

        setIsSubmitting(true)
        setError("")
        setSuccess("")

        try {
            await createProjectTask(
                selectedProjectId,
                title,
                description
            )

            setTitle("")
            setDescription("")
            setSuccess("Task created.")
            setTasksVersion((version) => version + 1)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) {
        return (
            <p className="auth-subtitle">
                Loading projects...
            </p>
        )
    }

    function renderProjectSelect() {
        return (
            <div className="form-group">
                <label htmlFor={`${userRole}-project`}>
                    Project
                </label>

                <select
                    id={`${userRole}-project`}
                    value={selectedProjectId}
                    disabled={isSubmitting}
                    onChange={(event) => {
                        setSelectedProjectId(event.target.value)
                        setError("")
                        setSuccess("")
                    }}
                >
                    {!selectedProject && <option value={selectedProjectId} disabled>Choose an active project</option>}
                    {projects.map((project) => (
                        <option
                            key={project.id}
                            value={project.id}
                        >
                            {project.name}
                        </option>
                    ))}
                </select>
            </div>
        )
    }

    function renderTaskForm() {
        return (
            <form onSubmit={handleCreateTask}>
                <div className="form-group">
                    <label htmlFor={`${userRole}-taskTitle`}>
                        Task Title
                    </label>

                    <input
                        id={`${userRole}-taskTitle`}
                        type="text"
                        value={title}
                        disabled={isSubmitting}
                        onChange={(event) =>
                            setTitle(event.target.value)
                        }
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor={`${userRole}-taskDescription`}>
                        Description
                    </label>

                    <textarea
                        id={`${userRole}-taskDescription`}
                        value={description}
                        disabled={isSubmitting}
                        onChange={(event) =>
                            setDescription(event.target.value)
                        }
                        rows="4"
                    />
                </div>

                {error && (
                    <p className="error-message" role="alert">
                        {error}
                    </p>
                )}

                {success && (
                    <p className="success-message" role="status">
                        {success}
                    </p>
                )}

                <button
                    type="submit"
                    className="auth-button"
                    disabled={isSubmitting || !selectedProject}
                >
                    {isSubmitting ? "Creating task..." : "Create Task"}
                </button>
            </form>
        )
    }

    function renderTaskList() {
        return (
            <div className="task-list">
                <h3>Project Tasks</h3>

                {tasks.length === 0 ? (
                    <p className="task-empty">
                        No tasks for this project yet.
                    </p>
                ) : (
                    <ul>
                        {tasks.map((task) => (
                            <li key={task.id}>
                                <div className="task-list-header">
                                    <strong>{task.title}</strong>

                                    {task.createdByRole && (
                                        <span className="task-role-badge">
                                            {formatRole(task.createdByRole)}
                                        </span>
                                    )}
                                </div>

                                {task.description && (
                                    <span className="task-description">
                                        {task.description}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        )
    }

    return (
        <section className="task-section">
            <h2>Define Task</h2>

            <p className="task-helper">
                {userRole === "SUPERVISOR"
                    ? "Create a task for the selected project."
                    : "Create your own task for the selected project."}
            </p>

            {selectedProjectId && !selectedProject && (
                <p className="error-message" role="alert">
                    The selected project is no longer active. Your task draft is kept. Choose an active project to continue.
                </p>
            )}

            {projects.length === 0 ? (
                <p className={error ? "error-message" : "task-empty"} role={error ? "alert" : undefined}>
                    {error || "No active projects available."}
                </p>
            ) : userRole === "SUPERVISOR" ? (
                <>
                    <div className="project-context">
                        <div>
                            <h3>Project Context</h3>
                            <p>
                                Selected project: {selectedProject?.name || "Choose an active project"}
                            </p>
                        </div>

                        {renderProjectSelect()}

                    </div>

                    <div className="task-layout task-layout-supervisor">
                        <div className="task-panel">
                            <h3>Create Task</h3>
                            {renderTaskForm()}
                        </div>

                        <div className="task-panel">
                            {renderTaskList()}
                        </div>
                    </div>
                </>
            ) : (
                <div className="task-layout task-layout-intern">
                    <div className="task-panel">
                        <h3>Project</h3>
                        {renderProjectSelect()}
                        {renderTaskList()}
                    </div>

                    <div className="task-panel">
                        <h3>Create Own Task</h3>
                        {renderTaskForm()}
                    </div>
                </div>
            )}
        </section>
    )
}

function formatRole(role) {
    return role.charAt(0) + role.slice(1).toLowerCase()
}

export default TaskDefinitionPanel
