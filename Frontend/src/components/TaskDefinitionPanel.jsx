import { useEffect, useMemo, useState } from "react"
import { getInterns } from "../services/internshipService.js"
import {
    createProjectTask,
    getProjects,
    getProjectTasks,
    updateProjectTask
} from "../services/projectService.js"
import {
    assignTaskToIntern,
    createTaskTimeEntry,
    endTaskAssignment,
    getManagedTaskAssignments,
    getTaskTimeAssignments,
    joinTask,
    leaveTask,
    updateTaskNote
} from "../services/taskTimeService.js"
import "../styles/taskTime.css"

function TaskDefinitionPanel({ userRole }) {
    const isSupervisor = userRole === "SUPERVISOR"
    const [projects, setProjects] = useState([])
    const [selectedProjectId, setSelectedProjectId] = useState("")
    const [tasks, setTasks] = useState([])
    const [interns, setInterns] = useState([])
    const [assignments, setAssignments] = useState([])
    const [expandedTaskId, setExpandedTaskId] = useState("")
    const [editingTaskId, setEditingTaskId] = useState("")
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [createTitle, setCreateTitle] = useState("")
    const [createDescription, setCreateDescription] = useState("")
    const [editTitle, setEditTitle] = useState("")
    const [editDescription, setEditDescription] = useState("")
    const [noteDrafts, setNoteDrafts] = useState({})
    const [startedAt, setStartedAt] = useState(() => toLocalInputValue(new Date(Date.now() - 60 * 60 * 1000)))
    const [endedAt, setEndedAt] = useState(() => toLocalInputValue(new Date()))
    const [isLoading, setIsLoading] = useState(true)
    const [busyAction, setBusyAction] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const selectedProject = projects.find((project) => project.id === selectedProjectId)
    const activeInterns = useMemo(
        () => interns.filter((intern) => intern.isEnabled && intern.internshipId),
        [interns]
    )

    useEffect(() => {
        let cancelled = false

        async function loadWorkspace() {
            setIsLoading(true)

            try {
                const [loadedProjects, loadedInterns, loadedAssignments] = await Promise.all([
                    getProjects(),
                    isSupervisor ? getInterns() : Promise.resolve([]),
                    isSupervisor ? getManagedTaskAssignments() : getTaskTimeAssignments()
                ])

                if (cancelled) return
                setProjects(loadedProjects)
                setInterns(loadedInterns)
                setAssignments(loadedAssignments)
                setSelectedProjectId(loadedProjects[0]?.id || "")
                setNoteDrafts(Object.fromEntries(
                    loadedAssignments.map((assignment) => [assignment.taskId, assignment.internNote || ""])
                ))
            } catch (err) {
                if (!cancelled) setError(err.message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadWorkspace()
        return () => { cancelled = true }
    }, [isSupervisor])

    useEffect(() => {
        let cancelled = false

        async function loadTasks() {
            setTasks([])
            setExpandedTaskId("")
            setEditingTaskId("")
            if (!selectedProjectId) return

            try {
                const loadedTasks = await getProjectTasks(selectedProjectId)
                if (!cancelled) setTasks(loadedTasks)
            } catch (err) {
                if (!cancelled) setError(err.message)
            }
        }

        loadTasks()
        return () => { cancelled = true }
    }, [selectedProjectId])

    async function refreshAssignments() {
        const loadedAssignments = isSupervisor
            ? await getManagedTaskAssignments()
            : await getTaskTimeAssignments()
        setAssignments(loadedAssignments)

        if (!isSupervisor) {
            setNoteDrafts(Object.fromEntries(
                loadedAssignments.map((assignment) => [assignment.taskId, assignment.internNote || ""])
            ))
        }
    }

    function clearMessages() {
        setError("")
        setSuccess("")
    }

    async function handleCreateTask(event) {
        event.preventDefault()
        if (!selectedProjectId || busyAction) return
        clearMessages()
        setBusyAction("create")

        try {
            const task = await createProjectTask(selectedProjectId, createTitle, createDescription)
            setTasks((current) => [...current, { ...task, createdByRole: userRole }].sort(compareTasks))
            setCreateTitle("")
            setCreateDescription("")
            setShowCreateForm(false)
            setSuccess("Task created.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    function startEditing(task) {
        clearMessages()
        setEditingTaskId(task.id)
        setExpandedTaskId("")
        setEditTitle(task.title)
        setEditDescription(task.description)
    }

    async function handleEditTask(event, task) {
        event.preventDefault()
        if (busyAction) return
        clearMessages()
        setBusyAction(`edit-${task.id}`)

        try {
            const updatedTask = await updateProjectTask(task.projectId, task.id, editTitle, editDescription)
            setTasks((current) => current.map((item) => item.id === task.id ? updatedTask : item).sort(compareTasks))
            setEditingTaskId("")
            setSuccess("Task updated.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    async function handleSupervisorAssignment(task, intern, assignment) {
        if (busyAction) return
        clearMessages()

        if (assignment) {
            if (!window.confirm(`Remove ${intern.firstName} ${intern.lastName} from ${task.title}?`)) return
            setBusyAction(`remove-${assignment.id}`)

            try {
                await endTaskAssignment(assignment.id)
                await refreshAssignments()
                setSuccess("Assignment removed.")
            } catch (err) {
                setError(err.message)
            } finally {
                setBusyAction("")
            }
            return
        }

        setBusyAction(`assign-${task.id}-${intern.id}`)

        try {
            await assignTaskToIntern(intern.id, task.id)
            await refreshAssignments()
            setSuccess("Assignment added.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    async function handleJoinTask(task) {
        if (busyAction) return
        clearMessages()
        setBusyAction(`join-${task.id}`)

        try {
            await joinTask(task.id)
            await refreshAssignments()
            setSuccess("You joined the task.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    async function handleLeaveTask(task, assignment) {
        if (busyAction || !window.confirm(`Remove yourself from ${task.title}?`)) return
        clearMessages()
        setBusyAction(`leave-${assignment.id}`)

        try {
            await leaveTask(assignment.id)
            await refreshAssignments()
            setSuccess("You left the task.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    async function handleSaveNote(task, assignment) {
        if (busyAction) return
        clearMessages()
        setBusyAction(`note-${assignment.id}`)

        try {
            await updateTaskNote(assignment.id, noteDrafts[task.id] || "")
            await refreshAssignments()
            setSuccess("Your task note was saved.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    async function handleRegisterTime(event, assignment) {
        event.preventDefault()
        if (busyAction) return
        clearMessages()

        const start = Date.parse(startedAt)
        const end = Date.parse(endedAt)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            setError("Choose a valid time range. End must be after start.")
            return
        }

        setBusyAction(`time-${assignment.id}`)

        try {
            await createTaskTimeEntry(assignment.id, new Date(start).toISOString(), new Date(end).toISOString())
            setSuccess("Task time saved.")
        } catch (err) {
            setError(err.message)
        } finally {
            setBusyAction("")
        }
    }

    if (isLoading) return <p className="task-helper">Loading tasks...</p>

    return (
        <section className="task-workspace">
            <div className="task-toolbar">
                <div>
                    <h2>{selectedProject?.name || "Tasks"}</h2>
                    <p className="task-helper">
                        {isSupervisor ? "Choose a project, then manage its tasks and assignments." : "Tasks in your active project."}
                    </p>
                </div>

                {isSupervisor && projects.length > 0 && (
                    <div className="form-group task-project-select">
                        <label htmlFor="task-project">Project</label>
                        <select
                            id="task-project"
                            value={selectedProjectId}
                            disabled={Boolean(busyAction)}
                            onChange={(event) => {
                                setSelectedProjectId(event.target.value)
                                clearMessages()
                            }}
                        >
                            {projects.map((project) => (
                                <option key={project.id} value={project.id}>{project.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {error && <p className="error-message" role="alert">{error}</p>}
            {success && <p className="success-message" role="status">{success}</p>}

            {!selectedProject ? (
                <p className="task-empty">
                    {isSupervisor ? "Create an active project first." : "You do not have an active project yet. Ask a Supervisor to assign one."}
                </p>
            ) : (
                <>
                    <button
                        className="project-action project-action-primary"
                        type="button"
                        onClick={() => setShowCreateForm((current) => !current)}
                    >
                        {showCreateForm ? "Cancel" : "Create task"}
                    </button>

                    {showCreateForm && (
                        <form className="task-inline-form" onSubmit={handleCreateTask}>
                            <TaskFields
                                title={createTitle}
                                description={createDescription}
                                setTitle={setCreateTitle}
                                setDescription={setCreateDescription}
                                disabled={Boolean(busyAction)}
                                prefix="create"
                            />
                            <button className="auth-button" type="submit" disabled={Boolean(busyAction)}>
                                {busyAction === "create" ? "Creating..." : "Create task"}
                            </button>
                        </form>
                    )}

                    {tasks.length === 0 ? (
                        <p className="task-empty task-list-empty">No tasks in this project yet.</p>
                    ) : (
                        <ul className="task-workspace-list">
                            {tasks.map((task) => {
                                const taskAssignments = assignments.filter((assignment) => assignment.taskId === task.id)
                                const ownAssignment = isSupervisor ? null : taskAssignments[0]
                                const canEdit = isSupervisor || task.createdByRole === "INTERN"

                                return (
                                    <li className="task-workspace-row" key={task.id}>
                                        {editingTaskId === task.id ? (
                                            <form className="task-inline-form" onSubmit={(event) => handleEditTask(event, task)}>
                                                <TaskFields
                                                    title={editTitle}
                                                    description={editDescription}
                                                    setTitle={setEditTitle}
                                                    setDescription={setEditDescription}
                                                    disabled={Boolean(busyAction)}
                                                    prefix={`edit-${task.id}`}
                                                />
                                                <div className="task-row-actions">
                                                    <button className="project-action project-action-primary" type="submit" disabled={Boolean(busyAction)}>Save</button>
                                                    <button className="project-action" type="button" disabled={Boolean(busyAction)} onClick={() => setEditingTaskId("")}>Cancel</button>
                                                </div>
                                            </form>
                                        ) : (
                                            <>
                                                <div className="task-row-summary">
                                                    <div className="task-row-heading">
                                                        <strong>{task.title}</strong>
                                                        {task.createdByRole && <span className="task-role-badge">{formatRole(task.createdByRole)}</span>}
                                                        {!isSupervisor && ownAssignment && <span className="task-assigned-badge">Assigned</span>}
                                                    </div>
                                                    {task.description && <p>{task.description}</p>}
                                                    {isSupervisor && <small>{taskAssignments.length} active assignment{taskAssignments.length === 1 ? "" : "s"}</small>}
                                                    {!isSupervisor && ownAssignment?.internNote && <small className="task-note-preview">Your note: {ownAssignment.internNote}</small>}
                                                </div>
                                                <div className="task-row-actions">
                                                    {canEdit && (
                                                        <button className="project-action" type="button" onClick={() => startEditing(task)}>Edit</button>
                                                    )}
                                                    <button
                                                        className="project-action project-action-primary"
                                                        type="button"
                                                        onClick={() => {
                                                            clearMessages()
                                                            setEditingTaskId("")
                                                            setExpandedTaskId((current) => current === task.id ? "" : task.id)
                                                        }}
                                                    >
                                                        {expandedTaskId === task.id ? "Close" : "Manage"}
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        {expandedTaskId === task.id && editingTaskId !== task.id && (
                                            <div className="task-manage-panel">
                                                {isSupervisor ? (
                                                    <SupervisorTaskManager
                                                        task={task}
                                                        interns={activeInterns}
                                                        assignments={assignments}
                                                        busyAction={busyAction}
                                                        onToggleAssignment={handleSupervisorAssignment}
                                                    />
                                                ) : (
                                                    <InternTaskManager
                                                        task={task}
                                                        assignment={ownAssignment}
                                                        busyAction={busyAction}
                                                        note={noteDrafts[task.id] || ""}
                                                        setNote={(note) => setNoteDrafts((current) => ({ ...current, [task.id]: note }))}
                                                        startedAt={startedAt}
                                                        endedAt={endedAt}
                                                        setStartedAt={setStartedAt}
                                                        setEndedAt={setEndedAt}
                                                        onJoin={handleJoinTask}
                                                        onLeave={handleLeaveTask}
                                                        onSaveNote={handleSaveNote}
                                                        onRegisterTime={handleRegisterTime}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </>
            )}
        </section>
    )
}

function TaskFields({ title, description, setTitle, setDescription, disabled, prefix }) {
    return (
        <>
            <div className="form-group">
                <label htmlFor={`${prefix}-title`}>Title</label>
                <input id={`${prefix}-title`} value={title} disabled={disabled} onChange={(event) => setTitle(event.target.value)} required />
            </div>
            <div className="form-group">
                <label htmlFor={`${prefix}-description`}>Description</label>
                <textarea id={`${prefix}-description`} value={description} disabled={disabled} onChange={(event) => setDescription(event.target.value)} rows="4" />
            </div>
        </>
    )
}

function SupervisorTaskManager({ task, interns, assignments, busyAction, onToggleAssignment }) {
    if (interns.length === 0) return <p className="task-empty">No active Interns.</p>

    return (
        <div>
            <h3>Assignments</h3>
            <ul className="task-intern-list">
                {interns.map((intern) => {
                    const assignment = assignments.find((item) => item.taskId === task.id && item.internId === intern.id)
                    const currentProject = assignments.find((item) => item.internId === intern.id)?.projectName

                    return (
                        <li key={intern.id}>
                            <div>
                                <strong>{intern.firstName} {intern.lastName}</strong>
                                {assignment?.internNote && <small>Note: {assignment.internNote}</small>}
                                {!assignment && currentProject && <small>Currently in {currentProject}</small>}
                            </div>
                            <button
                                className="project-action"
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={() => onToggleAssignment(task, intern, assignment)}
                            >
                                {assignment ? "Remove" : "Assign"}
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function InternTaskManager({
    task,
    assignment,
    busyAction,
    note,
    setNote,
    startedAt,
    endedAt,
    setStartedAt,
    setEndedAt,
    onJoin,
    onLeave,
    onSaveNote,
    onRegisterTime
}) {
    if (!assignment) {
        return (
            <div>
                <p className="task-helper">Join this task to add your note and register time.</p>
                <button className="project-action project-action-primary" type="button" disabled={Boolean(busyAction)} onClick={() => onJoin(task)}>
                    Add me to task
                </button>
            </div>
        )
    }

    return (
        <div className="task-intern-manager">
            <div className="task-note-editor">
                <div className="form-group">
                    <label htmlFor={`note-${task.id}`}>My note</label>
                    <textarea id={`note-${task.id}`} value={note} disabled={Boolean(busyAction)} onChange={(event) => setNote(event.target.value)} rows="4" maxLength="2000" />
                </div>
                <button className="project-action" type="button" disabled={Boolean(busyAction)} onClick={() => onSaveNote(task, assignment)}>Save note</button>
            </div>

            <form className="task-time-inline" onSubmit={(event) => onRegisterTime(event, assignment)}>
                <div className="form-group">
                    <label htmlFor={`start-${task.id}`}>Start</label>
                    <input id={`start-${task.id}`} type="datetime-local" value={startedAt} disabled={Boolean(busyAction)} onChange={(event) => setStartedAt(event.target.value)} />
                </div>
                <div className="form-group">
                    <label htmlFor={`end-${task.id}`}>End</label>
                    <input id={`end-${task.id}`} type="datetime-local" value={endedAt} disabled={Boolean(busyAction)} onChange={(event) => setEndedAt(event.target.value)} />
                </div>
                <button className="project-action project-action-primary" type="submit" disabled={Boolean(busyAction)}>Save time</button>
            </form>

            {assignment.canLeave ? (
                <button className="project-action task-leave-button" type="button" disabled={Boolean(busyAction)} onClick={() => onLeave(task, assignment)}>
                    Remove me from task
                </button>
            ) : (
                <p className="task-helper">Assigned by a Supervisor. Only a Supervisor can remove this assignment.</p>
            )}
        </div>
    )
}

function compareTasks(first, second) {
    return first.title.localeCompare(second.title)
}

function toLocalInputValue(date) {
    const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
    return localTime.toISOString().slice(0, 16)
}

function formatRole(role) {
    return role.charAt(0) + role.slice(1).toLowerCase()
}

export default TaskDefinitionPanel
