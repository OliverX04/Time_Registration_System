import { getToken } from "./authService.js"
import { API_URL } from "./apiConfig.js"

export async function getStatistics(filters = {}, isSupervisor = false) {
    const params = new URLSearchParams()
    for (const key of ["startDate", "endDate", "internId", "projectId"]) {
        if (filters[key]) params.set(key, filters[key])
    }
    params.set("timeZone", "Europe/Copenhagen")

    const route = isSupervisor ? "/statistics" : "/statistics/me"
    const query = params.size ? `?${params}` : ""
    const response = await fetch(`${API_URL}${route}${query}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    })
    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || "Failed to load statistics.")
    }

    return data
}
