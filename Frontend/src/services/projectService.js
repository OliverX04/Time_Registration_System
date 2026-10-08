import { getToken } from "./authService.js"

const API_URL = "http://localhost:3000"

export async function getProjects(includeArchived = false) {
    const data = await apiRequest(includeArchived ? "/projects?includeArchived=true" : "/projects")

    return data.projects
}

export async function createProject(name, description) {
    const data = await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({ name, description })
    })
    return data.project
}

export async function updateProject(projectId, name, description) {
    const data = await apiRequest(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description })
    })
    return data.project
}

export async function archiveProject(projectId) {
    const data = await apiRequest(`/projects/${projectId}/archive`, { method: "POST" })
    return data.project
}

export async function getProjectTasks(projectId) {
    const data = await apiRequest(`/projects/${projectId}/tasks`)

    return data.tasks
}

export async function createProjectTask(projectId, title, description) {
    const data = await apiRequest(`/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
            title,
            description
        })
    })

    return data.task
}

async function apiRequest(path, options = {}) {
    const token = getToken()

    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers
        }
    })

    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Request failed")
        error.fieldErrors = data.fieldErrors || {}
        throw error
    }

    return data
}
