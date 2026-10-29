import { useState } from "react"
import { updateInternStatisticsSettings } from "../services/internshipService.js"
import "../styles/statistics.css"

const weekDays = [
    { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
    { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" }
]

export default function PresenceSchedule({ intern, onSaved, onCancel }) {
    const [expectedWeeklyHours, setExpectedWeeklyHours] = useState(intern.expectedWeeklyHours ?? 37)
    const [workingDays, setWorkingDays] = useState(intern.workingDays ?? [1, 2, 3, 4, 5])
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [error, setError] = useState("")
    function toggleWorkingDay(day) {
        setWorkingDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b))
    }
    async function saveExpectedHours(event) {
        event.preventDefault()
        setIsSavingSettings(true)
        setError("")
        try {
            await updateInternStatisticsSettings(intern.id, { expectedWeeklyHours: Number(expectedWeeklyHours), workingDays })
            await onSaved()
        } catch (err) {
            setError(err.message)
        } finally {
            setIsSavingSettings(false)
        }
    }
    return (<div className="presence-schedule">
                    <form className="statistics-settings presence-schedule-form" onSubmit={saveExpectedHours}>
                        <div>
                            <h2>Expected presence schedule - {intern.firstName} {intern.lastName}</h2>
                            <p>Expected hours are divided across the selected workdays, up to 100 internship workdays (740 hours by default).</p>
                        </div>
                        <label className="statistics-filter-field" htmlFor="expected-weekly-hours">
                            Weekly hours
                            <input
                                id="expected-weekly-hours"
                                type="number"
                                min="0.01"
                                max="168"
                                step="any"
                                value={expectedWeeklyHours}
                                onChange={(event) => setExpectedWeeklyHours(event.target.value)}
                                required
                                placeholder="37"
                            />
                        </label>
                        <fieldset className="statistics-working-days">
                            <legend>Working days</legend>
                            {weekDays.map((day) => (
                                <label key={day.value}>
                                    <input
                                        type="checkbox"
                                        checked={workingDays.includes(day.value)}
                                        onChange={() => toggleWorkingDay(day.value)}
                                    />
                                    {day.label}
                                </label>
                            ))}
                        </fieldset>
                        <div className="presence-schedule-actions">
                        <button type="submit" disabled={isSavingSettings || !workingDays.length}>
                            {isSavingSettings ? "Saving..." : "Save schedule"}
                        </button>
                        <button type="button" disabled={isSavingSettings} onClick={onCancel}>Close</button>
                        </div>
                    </form>
        {error && <p role="alert" className="statistics-error">{error}</p>}
    </div>)
}
