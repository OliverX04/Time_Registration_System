import { API_URL } from "./apiConfig.js"
import { getToken } from "./authService.js"

export async function registerSupervisor(firstName, lastName, email, password) {
    const response = await fetch(`${API_URL}/supervisors`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
            firstName,
            lastName,
            email,
            password
        })
    })

    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Failed to register Supervisor.")
        error.fieldErrors = data.fieldErrors || {}
        throw error
    }

    return data
} 
