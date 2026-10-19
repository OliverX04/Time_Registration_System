import { getToken } from "./authService.js"
import { API_URL } from "./apiConfig.js"

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

export async function activateIntern(internId) {
    const response = await fetch(
        `${API_URL}/internships/${internId}/activate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        }
    )

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || "Failed to activate intern.")
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
