import { useCallback, useEffect, useState } from "react"
import AppLayout from "../components/AppLayout.jsx"
import { getCurrentUser } from "../services/authService.js"
import { getInterns } from "../services/internshipService.js"
import { getProjects } from "../services/projectService.js"
import { getStatistics } from "../services/statisticsService.js"
import "../styles/statistics.css"

const emptyFilters = { startDate: "", endDate: "", internId: "", projectId: "", taskId: "" }

function Statistics() {
    const user = getCurrentUser()
    const isSupervisor = user?.role === "SUPERVISOR"
    const [view, setView] = useState("intern")
    const [period, setPeriod] = useState("day")
    const [filters, setFilters] = useState(emptyFilters)
    const [interns, setInterns] = useState([])
    const [projects, setProjects] = useState([])
    const [statistics, setStatistics] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
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
        if (name === "projectId") setFilters((current) => ({ ...current, taskId: "" }))
    }

    function applyFilters(event) {
        event.preventDefault()
        loadStatistics(filters)
    }

    function drillDown(changes) {
        const selectedFilters = { ...emptyFilters, ...statistics.filters, ...changes }
        setFilters(selectedFilters)
        loadStatistics(selectedFilters)
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    function clearFilters() {
        setFilters(emptyFilters)
        loadStatistics(emptyFilters)
    }

    return (
        <AppLayout>
            <div className="statistics-page">
                <header className="statistics-heading">
                    <h1>{view === "project" ? "Project Statistics" : isSupervisor ? "Intern Statistics" : "My Statistics"}</h1>
                    <p>Presence and task time are shown separately.</p>
                </header>

                <div className="statistics-switches" role="group" aria-label="Statistics view">
                    {["intern", "project"].map((value) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{value === "intern" ? "Intern Statistics" : "Project Statistics"}</button>)}
                </div>
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

                {statistics?.filters.taskId && <p className="statistics-note">Task filter active. Use Clear to show all tasks.</p>}

                {filtersPending && (
                    <p className="statistics-filter-pending" role="status">
                        Filters changed. Click Apply to refresh the period statistics.
                    </p>
                )}

                {error && <p className="statistics-error" role="alert">{error}</p>}
                {isLoading && <p className="statistics-empty">Loading statistics...</p>}

                {!isLoading && statistics && (
                    <>
                        {view === "intern" && <section className="statistics-progress">
                            <h2>{hasAppliedDateRange ? "Period statistics" : "Internship progress"}</h2>
                            <p>{hasAppliedDateRange
                                ? "For the selected date range."
                                : `${statistics.progress.endedDate
                                    ? "From the start of the internship through its end date."
                                    : "From the start of the internship through today."} Project filters do not change this progress.`}</p>
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
                        </section>}
                        {view === "project" && <div className="statistics-summary"><SummaryCard title="Task time in period" durationMs={statistics.totals.taskDurationMs} /></div>}
                        <div className="statistics-switches" role="group" aria-label="Period breakdown">
                            {["day", "week", "month"].map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
                        </div>

                        {statistics.totals.attendanceDurationMs === 0 && statistics.totals.taskDurationMs === 0 ? (
                            <p className="statistics-empty">No completed attendance or task time entries for these filters.</p>
                        ) : (
                            <>
                                <section className="statistics-section">
                                    <h2>Hours by {period}</h2>
                                    <PeriodTable key={`${view}-${period}`} rows={statistics[{ day: "byDay", week: "byWeek", month: "byMonth" }[period]]} labelKey={{ day: "date", week: "weekStarting", month: "month" }[period]} periodType={period} view={view} onSelectPeriod={drillDown} />
                                </section>

                                <section className="statistics-breakdowns">
                                    {view === "project" && <>
                                    <Breakdown title="Hours by project (task time)" rows={statistics.byProject} labelKey="name" onSelect={(row) => drillDown({ projectId: row.id, taskId: "" })} />
                                    <Breakdown title="Hours by task" rows={statistics.byTask} labelKey="title" onSelect={(row) => drillDown({ taskId: row.id })} />
                                    </>}
                                    {isSupervisor && (
                                        <details className="statistics-section statistics-intern-breakdown statistics-collapsible">
                                            <summary>Hours by intern</summary>
                                            <table className={view === "project" ? "statistics-task-time-table" : undefined}>
                                                <thead><tr><th>Intern</th>{view === "intern" ? <><th>Presence</th><th>Expected</th><th>Difference</th></> : <th>Task time</th>}</tr></thead>
                                                <tbody>
                                                    {statistics.byIntern.map((intern) => (
                                                        <tr key={intern.internId}>
                                                            <th scope="row">
                                                                <button type="button" className="statistics-drilldown" onClick={() => drillDown({ internId: intern.internId })}>
                                                                    {intern.firstName} {intern.lastName}
                                                                </button>
                                                            </th>
                                                            {view === "intern" ? <>
                                                                <td>{formatHours(intern.attendanceDurationMs)}</td>
                                                                <td>{formatMaybeHours(intern.expectedPresenceDurationMs)}</td>
                                                                <td>{formatMaybeHours(intern.attendanceDifferenceMs, true)}</td>
                                                            </> : <td>{formatHours(intern.taskDurationMs)}</td>}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </details>
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

function PeriodTable({ rows, labelKey, periodType = "day", view, onSelectPeriod }) {
    const [visibleCount, setVisibleCount] = useState(10)
    const orderedRows = [...rows].sort((a, b) => b[labelKey].localeCompare(a[labelKey]))
    const nextCount = [25, 50, 100].find((count) => count > visibleCount) ?? rows.length
    const nextVisibleCount = Math.min(nextCount, rows.length)
    if (!rows.length) return <p className="statistics-empty">No entries.</p>

    return (
        <div className="statistics-table-wrap">
            <table className={view === "project" ? "statistics-task-time-table" : undefined}>
                <thead><tr><th>#</th><th>Period</th>{view === "intern" ? <><th>Presence</th><th>Expected</th><th>Difference</th></> : <th>Task time</th>}</tr></thead>
                <tbody>
                    {orderedRows.slice(0, visibleCount).map((row, index) => (
                        <tr key={row[labelKey]}>
                            <td className="statistics-row-number">#{index + 1}</td>
                            <th scope="row">
                                <button type="button" className="statistics-drilldown" onClick={() => onSelectPeriod(getPeriodRange(row[labelKey], periodType))}>
                                    {periodType === "week" ? formatWeekLabel(row[labelKey]) : row[labelKey]}
                                </button>
                            </th>
                            {view === "intern" ? <>
                                <td>{formatHours(row.attendanceDurationMs)}</td>
                                <td>{formatMaybeHours(row.expectedPresenceDurationMs)}</td>
                                <td>{formatMaybeHours(row.attendanceDifferenceMs, true)}</td>
                            </> : <td>{formatHours(row.taskDurationMs)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="statistics-row-controls">
                <span role="status">Showing {Math.min(visibleCount, rows.length)} of {rows.length} periods · newest first</span>
                {visibleCount < rows.length && (
                    <button type="button" onClick={() => setVisibleCount(nextVisibleCount)}>
                        Show more
                    </button>
                )}
                {visibleCount > 10 && rows.length > 10 && (
                    <button type="button" onClick={() => setVisibleCount(10)}>Show less</button>
                )}
            </div>
        </div>
    )
}

function getPeriodRange(value, periodType) {
    const startDate = periodType === "month" ? `${value}-01` : value
    const end = new Date(`${startDate}T00:00:00.000Z`)
    if (periodType === "week") end.setUTCDate(end.getUTCDate() + 6)
    if (periodType === "month") end.setUTCMonth(end.getUTCMonth() + 1, 0)
    return { startDate, endDate: end.toISOString().slice(0, 10) }
}

function formatWeekLabel(weekStarting) {
    const thursday = new Date(`${weekStarting}T00:00:00.000Z`)
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
    const weekNumber = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7)
    return `Week ${weekNumber}`
}

function Breakdown({ title, rows, labelKey, onSelect }) {
    const Container = labelKey === "title" ? "details" : "section"
    return (
        <Container className="statistics-section statistics-collapsible">
            {labelKey === "title" ? <summary>{title}</summary> : <h2>{title}</h2>}
            {!rows.length ? <p className="statistics-empty">No entries.</p> : (
                <div className="statistics-table-wrap">
                    <table className="statistics-task-time-table">
                        <thead><tr><th>{labelKey === "name" ? "Project" : "Task"}</th><th>Hours</th></tr></thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <th scope="row">
                                        <button type="button" className="statistics-drilldown" onClick={() => onSelect(row)}>
                                            {row[labelKey]}{row.projectName ? ` · ${row.projectName}` : ""}
                                        </button>
                                    </th>
                                    <td>{formatHours(row.durationMs)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Container>
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
