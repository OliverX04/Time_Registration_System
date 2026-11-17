import { API_URL } from "./apiConfig.js"
import { getToken } from "./authService.js"

async function request(path, options = {}) {
    const response = await fetch(`${API_URL}/database-backups${path}`, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${getToken()}` }
    })
    const data = await response.json()
    if (!response.ok) {
        throw new Error(data.error || "Database backup request failed.")
    }
    return data
}

export function loadDatabaseBackups(signal) {
    return request("", { signal })
}

export async function saveBackupSchedule(settings) {
    const { schedule } = await request("/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
    })
    return schedule
}

export async function restoreDatabaseBackup(id) {
    await request("/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
    })
}
