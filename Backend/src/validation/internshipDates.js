const timeZone = "Europe/Copenhagen"
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
})
const offsetFormatter = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" })

export function copenhagenDate(value) {
    const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(value)).map(({ type, value }) => [type, value]))
    return `${parts.year}-${parts.month}-${parts.day}`
}

export function parseStartDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

    const midnight = Date.parse(`${value}T00:00:00.000Z`)
    if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== value) return null
    if (value > copenhagenDate(new Date())) return null

    let timestamp = midnight
    for (let attempt = 0; attempt < 2; attempt++) {
        const offset = offsetFormatter.formatToParts(new Date(timestamp)).find((part) => part.type === "timeZoneName").value
        const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset)
        const offsetMinutes = match ? (Number(match[2]) * 60 + Number(match[3] || 0)) * (match[1] === "+" ? 1 : -1) : 0
        timestamp = midnight - offsetMinutes * 60 * 1000
    }

    return new Date(timestamp).toISOString()
}
