export function toCorrectionInput(timestamp) {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function readCorrectionTime(value, original) {
    if (!value) return null
    if (original && value === toCorrectionInput(original)) return original
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}
