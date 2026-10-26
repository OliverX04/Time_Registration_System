import { useCallback, useEffect, useState } from "react"
import AppLayout from "../components/AppLayout.jsx"
import { getCurrentUser } from "../services/authService.js"
import { getInterns, updateInternStatisticsSettings } from "../services/internshipService.js"
import { getProjects } from "../services/projectService.js"
import { getStatistics } from "../services/statisticsService.js"
import "../styles/statistics.css"

const emptyFilters = { startDate: "", endDate: "", internId: "", projectId: "" }
const weekDays = [
    { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
    { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" }
]

function Statistics() {
    const user = getCurrentUser()
    const isSupervisor = user?.role === "SUPERVISOR"
    const [filters, setFilters] = useState(emptyFilters)
    const [interns, setInterns] = useState([])
    const [projects, setProjects] = useState([])
    const [statistics, setStatistics] = useState(null)
    const [expectedWeeklyHours, setExpectedWeeklyHours] = useState("37")
    const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5])
    const [isLoading, setIsLoading] = useState(true)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [error, setError] = useState("")
    const filtersPending = Boolean(statistics) && Object.keys(emptyFilters).some((key) =>
        (filters[key] || "") !== (statistics.filters[key] || "")
    )
    const hasAppliedDateRange = Boolean(statistics?.filters.startDate || statistics?.filters.endDate)

    const loadStatistics = useCallback(async (selectedFilters) => {
        setIsLoading(true)
        setError("")
        try {
            const result = await getStatistics(selectedFilters, isSupervisor)
            setStatistics(result)
        } catch (loadError) {
            setError(loadError.message)
            setStatistics(null)
        } finally {
            setIsLoading(false)
        }
    }, [isSupervisor])

    useEffect(() => {
        let cancelled = false

        async function loadInitialData() {
            if (isSupervisor) {
                try {
                    const [internList, projectList] = await Promise.all([getInterns(), getProjects(true)])
                    if (!cancelled) {
                        setInterns(internList)
                        setProjects(projectList)
                    }
                } catch (loadError) {
                    if (!cancelled) setError(loadError.message)
                }
            }
            if (!cancelled) await loadStatistics(emptyFilters)
        }

        loadInitialData()
        return () => { cancelled = true }
    }, [isSupervisor, loadStatistics])

    function updateFilter(event) {
        const { name, value } = event.target
        setFilters((current) => ({ ...current, [name]: value }))
        if (name === "internId") {
            const intern = interns.find((item) => item.id === value)
            setExpectedWeeklyHours(intern?.expectedWeeklyHours ?? 37)
            setWorkingDays(intern?.workingDays ?? [1, 2, 3, 4, 5])
        }
    }

    function applyFilters(event) {
        event.preventDefault()
        loadStatistics(filters)
    }

    function clearFilters() {
        setFilters(emptyFilters)
        setExpectedWeeklyHours("37")
        setWorkingDays([1, 2, 3, 4, 5])
        loadStatistics(emptyFilters)
    }

    async function saveExpectedHours(event) {
        event.preventDefault()
        if (!filters.internId) return
        setIsSavingSettings(true)
        setError("")
        try {
            await updateInternStatisticsSettings(filters.internId, {
                expectedWeeklyHours: Number(expectedWeeklyHours),
                workingDays
            })
            const [internList, result] = await Promise.all([
                getInterns(),
                getStatistics(filters, true)
            ])
            setInterns(internList)
            setStatistics(result)
        } catch (saveError) {
            setError(saveError.message)
        } finally {
            setIsSavingSettings(false)
        }
    }

    function toggleWorkingDay(day) {
        setWorkingDays((current) => current.includes(day)
            ? current.filter((value) => value !== day)
            : [...current, day].sort((a, b) => a - b)
        )
    }

    return (
        <AppLayout>
            <div className="statistics-page">
                <header className="statistics-heading">
                    <h1>{isSupervisor ? "Intern Statistics" : "My Statistics"}</h1>
                    <p>Presence and task time are shown separately.</p>
                </header>

                <form className="statistics-filters" onSubmit={applyFilters}>
                    <div className="statistics-filter-field">
                        <label htmlFor="statistics-start-date">From</label>
                        <input id="statistics-start-date" name="startDate" type="date" value={filters.startDate} onChange={updateFilter} />
                    </div>
                    <div className="statistics-filter-field">
                        <label htmlFor="statistics-end-date">To</label>
                        <input id="statistics-end-date" name="endDate" type="date" value={filters.endDate} onChange={updateFilter} />
                    </div>
                    {isSupervisor && (
                        <>
                            <div className="statistics-filter-field">
                                <label htmlFor="statistics-intern">Intern</label>
                                <select id="statistics-intern" name="internId" value={filters.internId} onChange={updateFilter}>
                                    <option value="">All interns</option>
                                    {interns.map((intern) => (
                                        <option key={intern.id} value={intern.id}>{intern.firstName} {intern.lastName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="statistics-filter-field">
                                <label htmlFor="statistics-project">Project</label>
                                <select id="statistics-project" name="projectId" value={filters.projectId} onChange={updateFilter}>
                                    <option value="">All projects</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}{project.archivedAt ? " (archived)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                    <button type="submit" disabled={isLoading}>Apply</button>
                    <button type="button" className="statistics-clear-button" disabled={isLoading} onClick={clearFilters}>
                        Clear
                    </button>
                </form>

                {filtersPending && (
                    <p className="statistics-filter-pending" role="status">
                        Filters changed. Click Apply to refresh the period statistics.
                    </p>
                )}

                {isSupervisor && filters.internId && interns.find((intern) => intern.id === filters.internId)?.isEnabled && (
                    <form className="statistics-settings" onSubmit={saveExpectedHours}>
                        <div>
                            <h2>Expected presence schedule</h2>
                            <p>Expected hours are divided across the selected workdays, up to 100 internship workdays (740 hours by default).</p>
                        </div>
                        <label className="statistics-filter-field" htmlFor="expected-weekly-hours">
                            Weekly hours
                            <input
                                id="expected-weekly-hours"
                                type="number"
                                min="0.01"
                                max="168"
                                step="0.25"
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
                        <button type="submit" disabled={isSavingSettings || !workingDays.length}>
                            {isSavingSettings ? "Saving..." : "Save schedule"}
                        </button>
                    </form>
                )}

                {error && <p className="statistics-error" role="alert">{error}</p>}
                {isLoading && <p className="statistics-empty">Loading statistics...</p>}

                {!isLoading && statistics && (
                    <>
                        <section className="statistics-progress">
                            <h2>{hasAppliedDateRange ? "Period statistics" : "Internship progress"}</h2>
                            <p>{hasAppliedDateRange
                                ? "For the selected date range."
                                : `${statistics.progress.endedDate
                                    ? "From the start of the internship through its end date."
                                    : "From the start of the internship through today."} Date and project filters below do not change this progress.`}</p>
                            {!hasAppliedDateRange && (statistics.progress.endedDate
                                ? <p>Internship ended: {formatDate(statistics.progress.endedDate)}</p>
                                : statistics.progress.targetEndDate && <p>100th working day: {formatDate(statistics.progress.targetEndDate)}</p>)}
                            <div className="statistics-summary">
                                {hasAppliedDateRange ? (
                                    <>
                                        <SummaryCard title="Presence in period" durationMs={statistics.totals.attendanceDurationMs} />
                                        <SummaryCard title="Expected in period" durationMs={statistics.totals.expectedPresenceDurationMs} />
                                        <SummaryCard title="Difference" durationMs={statistics.totals.attendanceDifferenceMs} signed />
                                    </>
                                ) : (
                                    <>
                                        <SummaryCard title="Presence to date" durationMs={statistics.progress.attendanceDurationMs} />
                                        <SummaryCard title="Expected by today" durationMs={statistics.progress.expectedToDateDurationMs} />
                                        <SummaryCard title="Difference" durationMs={statistics.progress.differenceDurationMs} signed />
                                        <SummaryCard title="Full internship target" durationMs={statistics.progress.targetDurationMs} />
                                        <SummaryCard
                                            title={statistics.progress.endedDate ? "Short of 100-day target" : "Hours remaining"}
                                            durationMs={statistics.progress.remainingToTargetDurationMs}
                                            exceededText={statistics.progress.overTargetDurationMs > 0
                                                ? `Target exceeded by ${formatHours(statistics.progress.overTargetDurationMs)} h`
                                                : ""}
                                        />
                                    </>
                                )}
                            </div>
                        </section>

                        {statistics.totals.attendanceDurationMs === 0 && statistics.totals.taskDurationMs === 0 ? (
                            <p className="statistics-empty">No completed attendance or task time entries for these filters.</p>
                        ) : (
                            <>
                                <section className="statistics-section">
                                    <h2>Hours by day</h2>
                                    <PeriodTable rows={statistics.byDay} labelKey="date" />
                                </section>
                                <section className="statistics-section">
                                    <h2>Hours by week</h2>
                                    <PeriodTable rows={statistics.byWeek} labelKey="weekStarting" periodType="week" />
                                </section>
                                <section className="statistics-section">
                                    <h2>Hours by month</h2>
                                    <PeriodTable rows={statistics.byMonth} labelKey="month" />
                                </section>

                                <section className="statistics-breakdowns">
                                    <Breakdown title="Hours by project" rows={statistics.byProject} labelKey="name" />
                                    <Breakdown title="Hours by task" rows={statistics.byTask} labelKey="title" />
                                    {isSupervisor && (
                                        <div className="statistics-section statistics-intern-breakdown">
                                            <h2>Hours by intern</h2>
                                            <table>
                                                <thead><tr><th>Intern</th><th>Presence</th><th>Task time</th><th>Expected</th><th>Difference</th></tr></thead>
                                                <tbody>
                                                    {statistics.byIntern.map((intern) => (
                                                        <tr key={intern.internId}>
                                                            <th scope="row">{intern.firstName} {intern.lastName}</th>
                                                            <td>{formatHours(intern.attendanceDurationMs)}</td>
                                                            <td>{formatHours(intern.taskDurationMs)}</td>
                                                            <td>{formatMaybeHours(intern.expectedPresenceDurationMs)}</td>
                                                            <td>{formatMaybeHours(intern.attendanceDifferenceMs, true)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                        <p className="statistics-note">Only completed entries are included. Periods use your local time zone ({statistics.timeZone}).</p>
                    </>
                )}
            </div>
        </AppLayout>
    )
}

function SummaryCard({ title, durationMs, signed = false, exceeded = false, exceededText = "" }) {
    const statusText = exceededText || (exceeded ? "Target exceeded" : "")
    return (
        <article className="statistics-card">
            <h2>{title}</h2>
            <strong>{formatMaybeHours(durationMs, signed)}{durationMs === null ? "" : " h"}</strong>
            {statusText && <span className="statistics-exceeded">{statusText}</span>}
        </article>
    )
}

function PeriodTable({ rows, labelKey, periodType = "day" }) {
    if (!rows.length) return <p className="statistics-empty">No entries.</p>

    return (
        <div className="statistics-table-wrap">
            <table>
                <thead><tr><th>#</th><th>Period</th><th>Presence</th><th>Expected</th><th>Difference</th><th>Task time</th></tr></thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={row[labelKey]}>
                            <td className="statistics-row-number">#{index + 1}</td>
                            <th scope="row">{periodType === "week" ? formatWeekLabel(row[labelKey]) : row[labelKey]}</th>
                            <td>{formatHours(row.attendanceDurationMs)}</td>
                            <td>{formatMaybeHours(row.expectedPresenceDurationMs)}</td>
                            <td>{formatMaybeHours(row.attendanceDifferenceMs, true)}</td>
                            <td>{formatHours(row.taskDurationMs)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function formatWeekLabel(weekStarting) {
    const thursday = new Date(`${weekStarting}T00:00:00.000Z`)
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
    const weekNumber = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7)
    return `Week ${weekNumber}`
}

function Breakdown({ title, rows, labelKey }) {
    return (
        <section className="statistics-section">
            <h2>{title}</h2>
            {!rows.length ? <p className="statistics-empty">No entries.</p> : (
                <div className="statistics-table-wrap">
                    <table>
                        <thead><tr><th>{title.replace("Hours by ", "")}</th><th>Hours</th></tr></thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <th scope="row">{row[labelKey]}{row.projectName ? ` · ${row.projectName}` : ""}</th>
                                    <td>{formatHours(row.durationMs)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}

function formatHours(durationMs) {
    return (durationMs / (60 * 60 * 1000)).toFixed(2)
}

function formatDate(date) {
    return new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    }).format(new Date(`${date}T00:00:00.000Z`))
}

function formatMaybeHours(durationMs, signed = false) {
    if (durationMs === null || durationMs === undefined) return "—"
    const hours = formatHours(Math.abs(durationMs))
    if (!signed) return hours
    if (durationMs > 0) return `+${hours}`
    if (durationMs < 0) return `-${hours}`
    return hours
}

export default Statistics
