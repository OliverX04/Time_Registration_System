import { getToken } from "./authService.js"

const API_URL = "http://localhost:3000"

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

async function attendanceRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${getToken()}`,
            ...options.headers
        }
    })
    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || "Attendance request failed")
    }

    return data
}
