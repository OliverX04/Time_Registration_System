import { getToken } from "./authService.js"
import { API_URL } from "./apiConfig.js"

export async function getTaskTimeAssignments() {
    const data = await taskTimeRequest("/task-time/assignments")
    return data.assignments
}

export async function createTaskTimeEntry(taskAssignmentId, startedAt, endedAt) {
    const data = await taskTimeRequest("/task-time/entries", {
        method: "POST",
        body: JSON.stringify({ taskAssignmentId, startedAt, endedAt })
    })
    return data.entry
}

export async function joinTask(taskId) {
    const data = await taskTimeRequest("/task-time/assignments", {
        method: "POST",
        body: JSON.stringify({ taskId })
    })
    return data.assignment
}

export async function leaveTask(assignmentId) {
    const data = await taskTimeRequest(`/task-time/assignments/${assignmentId}/end`, {
        method: "POST"
    })
    return data.assignment
}

export async function updateTaskNote(assignmentId, note) {
    const data = await taskTimeRequest(`/task-time/assignments/${assignmentId}/note`, {
        method: "PATCH",
        body: JSON.stringify({ note })
    })
    return data.assignment
}

export async function getManagedTaskAssignments() {
    const data = await taskTimeRequest("/task-time/management/assignments")
    return data.assignments
}

export async function assignTaskToIntern(internId, taskId) {
    const data = await taskTimeRequest("/task-time/management/assignments", {
        method: "POST",
        body: JSON.stringify({ internId, taskId })
    })
    return data.assignment
}

export async function endTaskAssignment(assignmentId) {
    const data = await taskTimeRequest(`/task-time/management/assignments/${assignmentId}/end`, {
        method: "POST"
    })
    return data.assignment
}

async function taskTimeRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
            ...options.headers
        }
    })
    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Task time request failed")
        error.fieldErrors = data.fieldErrors || {}
        throw error
    }

    return data
}
