import { toCorrectionInput } from "../services/correctionTimes.js"

export default function CorrectionTimes({ start, end, startLabel, endLabel, disabled }) {
    return (
        <div className="attendance-form-times">
            <CorrectionDateTime name="start" label={startLabel} timestamp={start} disabled={disabled} />
            <CorrectionDateTime name="end" label={endLabel} timestamp={end} disabled={disabled} />
        </div>
    )
}

function CorrectionDateTime({ name, label, timestamp, disabled }) {
    const [date, time] = toCorrectionInput(timestamp).split("T")

    return (
        <fieldset className="correction-date-time" disabled={disabled}>
            <legend>{label}</legend>
            <label className="form-group">
                Date
                <input type="date" name={`${name}Date`} defaultValue={date} required />
            </label>
            <label className="form-group">
                Time (24h)
                <input type="text" name={`${name}Time`} defaultValue={time} placeholder="08:30"
                    pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]" maxLength={5} required />
            </label>
        </fieldset>
    )
}
