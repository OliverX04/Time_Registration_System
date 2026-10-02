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
            const task = await createProjectTask(
                selectedProjectId,
                title,
                description
            )

            setTasks((currentTasks) => [...currentTasks, task])
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
            ) : (
                <>
                    <form onSubmit={handleCreateTask}>
                        <div className="form-group">
                            <label htmlFor="project">
                                Project
                            </label>

                            <select
                                id="project"
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

                        <div className="form-group">
                            <label htmlFor="taskTitle">
                                Task Title
                            </label>

                            <input
                                id="taskTitle"
                                type="text"
                                value={title}
                                onChange={(event) =>
                                    setTitle(event.target.value)
                                }
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="taskDescription">
                                Description
                            </label>

                            <textarea
                                id="taskDescription"
                                value={description}
                                onChange={(event) =>
                                    setDescription(event.target.value)
                                }
                                rows="3"
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
                                        <strong>{task.title}</strong>
                                        {task.description && (
                                            <span>
                                                {task.description}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </section>
    )
}

export default TaskDefinitionPanel
