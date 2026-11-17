let pending = 0

export function trackDatabaseWork(handler) {
    // Keep async account work tied to the database it started against, even if the client disconnects.
    return async (req, res) => {
        pending += 1
        try {
            await handler(req, res)
        } finally {
            pending -= 1
        }
    }
}

export function hasPendingDatabaseWork() {
    return pending > 0
}
