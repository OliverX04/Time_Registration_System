const timeZone = "Europe/Copenhagen"
const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
})

export const defaultSchedule = { frequency: "daily", time: "02:00", weekday: 1 }

export function validateSchedule(value) {
    if (!value || !["daily", "weekly"].includes(value.frequency)) return null
    if (typeof value.time !== "string" || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value.time)) return null
    if (!Number.isInteger(value.weekday) || value.weekday < 0 || value.weekday > 6) return null
    return { frequency: value.frequency, time: value.time, weekday: value.weekday }
}

export function publicSchedule(schedule) {
    const { frequency, time, weekday } = schedule
    return { frequency, time, weekday, timeZone }
}

export function latestScheduledSlot(schedule, now) {
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]))
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)))
    const beforeTime = `${parts.hour}:${parts.minute}` < schedule.time
    if (schedule.frequency === "weekly") {
        const daysSince = (date.getUTCDay() - schedule.weekday + 7) % 7
        date.setUTCDate(date.getUTCDate() - (daysSince === 0 && beforeTime ? 7 : daysSince))
    } else if (beforeTime) {
        date.setUTCDate(date.getUTCDate() - 1)
    }
    return `${date.toISOString().slice(0, 10)}T${schedule.time.replace(":", "_")}`
}
