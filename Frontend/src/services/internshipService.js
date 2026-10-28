import { getToken } from "./authService.js"
import { API_URL } from "./apiConfig.js"

export async function setProjectAssignment(internId, projectId) {
    const ending = projectId === null
    const response = await fetch(`${API_URL}/internships/${encodeURIComponent(internId)}/project-assignment${ending ? "/end" : ""}`, {
        method: ending ? "POST" : "PUT",
        headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json"
        },
        body: ending ? undefined : JSON.stringify({ projectId })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Failed to update project assignment.")
    return data
}

export async function updateInternStatisticsSettings(internId, settings) {
    const response = await fetch(`${API_URL}/internships/${encodeURIComponent(internId)}/statistics-settings`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Failed to save statistics settings.")
    return data
}

export async function getInterns() {
    const response = await fetch(`${API_URL}/internships`, {
        headers: {
            Authorization: `Bearer ${getToken()}`
        }
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || "Failed to load interns.")
    }

    return data.interns
}

export async function activateIntern(internId, startDate) {
    const response = await fetch(
        `${API_URL}/internships/${encodeURIComponent(internId)}/activate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ startDate })
        }
    )

    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Failed to activate intern.")
        error.fieldErrors = data.fieldErrors || {}
        throw error
    }

    return data
}

export async function deactivateIntern(internId, outcome) {
    const response = await fetch(
        `${API_URL}/internships/${internId}/deactivate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ outcome })
        }
    )

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || "Failed to deactivate intern.")
    }

    return data
}
