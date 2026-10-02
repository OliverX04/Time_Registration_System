import { getToken } from "./authService.js"

const API_URL = "http://localhost:3000"

export async function getProjects() {
    const data = await apiRequest("/projects")

    return data.projects
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
        throw new Error(data.error || "Request failed")
    }

    return data
}
