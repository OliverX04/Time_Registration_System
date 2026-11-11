export function toCorrectionInput(timestamp) {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function readCorrectionTime(data, name, original) {
    const date = data.get(`${name}Date`)
    const time = data.get(`${name}Time`)
    if (!date || typeof time !== "string" || !/^(?:[01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return null
    const value = `${date}T${time.padStart(5, "0")}`
    if (original && value === toCorrectionInput(original)) return original
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return null
    const iso = new Date(timestamp).toISOString()
    return toCorrectionInput(iso) === value ? iso : null
}
