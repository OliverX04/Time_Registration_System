import { useEffect, useState } from "react"
import {
    createProjectTask,
    getProjects,
    getProjectTasks
} from "../services/projectService.js"

function TaskDefinitionPanel({ userRole }) {
    const [projects, setProjects] = useState([])
    const [selectedProjectId, setSelectedProjectId] = useState("")
    const [tasks, setTasks] = useState([])
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function loadProjects() {
            try {
                const loadedProjects = await getProjects()

                setProjects(loadedProjects)
                setSelectedProjectId(loadedProjects[0]?.id || "")
            } catch (err) {
                setError(err.message)
            } finally {
                setIsLoading(false)
            }
        }

        loadProjects()
    }, [])

    useEffect(() => {
        async function loadTasks() {
            if (!selectedProjectId) {
                setTasks([])
                return
            }

            try {
                const loadedTasks = await getProjectTasks(selectedProjectId)

                setTasks(loadedTasks)
            } catch (err) {
                setError(err.message)
            }
        }

        loadTasks()
    }, [selectedProjectId])

    async function handleCreateTask(event) {
        event.preventDefault()

        setError("")
        setSuccess("")

        try {
            await createProjectTask(
                selectedProjectId,
                title,
                description
            )

            const loadedTasks = await getProjectTasks(selectedProjectId)

            setTasks(loadedTasks)
            setTitle("")
            setDescription("")
            setSuccess("Task created.")
        } catch (err) {
            setError(err.message)
        }
    }

    if (isLoading) {
        return (
            <p className="auth-subtitle">
                Loading projects...
            </p>
        )
    }

    const selectedProject = projects.find(
        (project) => project.id === selectedProjectId
    )

    function renderProjectSelect() {
        return (
            <div className="form-group">
                <label htmlFor={`${userRole}-project`}>
                    Project
                </label>

                <select
                    id={`${userRole}-project`}
                    value={selectedProjectId}
                    onChange={(event) =>
                        setSelectedProjectId(event.target.value)
                    }
                >
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
                        onChange={(event) =>
                            setDescription(event.target.value)
                        }
                        rows="4"
                    />
                </div>

                {error && (
                    <p className="error-message">
                        {error}
                    </p>
                )}

                {success && (
                    <p className="success-message">
                        {success}
                    </p>
                )}

                <button
                    type="submit"
                    className="auth-button"
                >
                    Create Task
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

            {projects.length === 0 ? (
                <p className="error-message">
                    No projects found. Seed development data first.
                </p>
            ) : userRole === "SUPERVISOR" ? (
                <>
                    <div className="project-context">
                        <div>
                            <h3>Project Context</h3>
                            <p>
                                Selected project: {selectedProject?.name}
                            </p>
                        </div>

                        {renderProjectSelect()}

                        <div className="project-placeholder">
                            Project management placeholder
                        </div>
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
