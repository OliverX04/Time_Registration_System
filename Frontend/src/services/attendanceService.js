import { getToken } from "./authService.js"
import { API_URL } from "./apiConfig.js"

export async function getAttendanceStatus() {
    return attendanceRequest("/attendance/status")
}

export async function getAttendanceHistory() {
    return attendanceRequest("/attendance/history")
}

export async function checkIn() {
    return attendanceRequest("/attendance/check-in", { method: "POST" })
}

export async function checkOut() {
    return attendanceRequest("/attendance/check-out", { method: "POST" })
}

export async function getManagedAttendance(internId) {
    return attendanceRequest(`/attendance/management/interns/${encodeURIComponent(internId)}`)
}

export async function addAttendance(internId, values) {
    return attendanceRequest(`/attendance/management/interns/${encodeURIComponent(internId)}`, {
        method: "POST",
        body: JSON.stringify(values)
    })
}

export async function updateAttendance(sessionId, values) {
    return attendanceRequest(`/attendance/management/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PUT",
        body: JSON.stringify(values)
    })
}

export async function deleteAttendance(session) {
    return attendanceRequest(`/attendance/management/sessions/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
        body: JSON.stringify({
            expectedCheckedInAt: session.checkedInAt,
            expectedCheckedOutAt: session.checkedOutAt
        })
    })
}

async function attendanceRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${getToken()}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    })
    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Attendance request failed")
        error.fieldErrors = data.fieldErrors || {}
        error.status = response.status
        throw error
    }

    return data
}
