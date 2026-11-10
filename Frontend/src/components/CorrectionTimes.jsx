import { toCorrectionInput } from "../services/correctionTimes.js"

export default function CorrectionTimes({ start, end, startLabel, endLabel, disabled }) {
    return (
        <div className="attendance-form-times">
            <label className="form-group">
                {startLabel}
                <input type="datetime-local" name="start" defaultValue={toCorrectionInput(start)} required autoFocus disabled={disabled} />
            </label>
            <label className="form-group">
                {endLabel}
                <input type="datetime-local" name="end" defaultValue={toCorrectionInput(end)} required disabled={disabled} />
            </label>
        </div>
    )
}
