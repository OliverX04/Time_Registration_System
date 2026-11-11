export const attendanceDecisionsSeen = "attendance-decisions-seen"

export function unseenAttendanceDecisions(requests, userId, markSeen = false) {
    if (!userId) return []
    const key = `attendance-seen-approvals:${userId}`
    try {
        const seen = new Set(JSON.parse(localStorage.getItem(key) ?? "[]"))
        const unseen = requests.filter((request) => (request.status === "APPROVED" || request.status === "REJECTED") && !seen.has(request.id))
        if (markSeen && unseen.length) {
            unseen.forEach((request) => seen.add(request.id))
            localStorage.setItem(key, JSON.stringify([...seen]))
            window.dispatchEvent(new Event(attendanceDecisionsSeen))
        }
        return unseen
    } catch {
        return []
    }
}
