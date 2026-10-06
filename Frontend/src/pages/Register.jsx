import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { registerUser } from "../services/authService.js"

function validateRegistration(values) {
    const errors = {}
    for (const field of ["firstName", "lastName"]) {
        if (!values[field]) {
            errors[field] = "Enter your name."
        } else if (values[field].length > 100) {
            errors[field] = "Use at most 100 characters."
        }
    }
    if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        errors.email = "Enter a valid email address."
    }
    if (!values.password) {
        errors.password = "Enter a password."
    }
    return errors
}

function Register() {
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [fieldErrors, setFieldErrors] = useState({})
    const [error, setError] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const navigate = useNavigate()

    async function handleRegister(event) {
        event.preventDefault()
        if (isSubmitting) return
        const values = {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            password
        }
        const errors = validateRegistration(values)
        setFieldErrors(errors)
        setError("")
        if (Object.keys(errors).length > 0) return

        setIsSubmitting(true)
        try {
            await registerUser(values.firstName, values.lastName, values.email, password)
            navigate("/login")
        } catch (err) {
            setError(err.message)
            setFieldErrors(err.fieldErrors || {})
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1>Create Account</h1>
                <p className="auth-subtitle">Register as an intern to access the system.</p>
                <form onSubmit={handleRegister} noValidate>
                    <div className="name-row">
                        <div className="form-group">
                            <label htmlFor="firstName">First Name</label>
                            <input id="firstName" type="text" autoComplete="given-name" required
                                value={firstName} onChange={(event) => setFirstName(event.target.value)}
                                aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined} />
                            {fieldErrors.firstName && <p id="firstName-error" className="field-error">{fieldErrors.firstName}</p>}
                        </div>
                        <div className="form-group">
                            <label htmlFor="lastName">Last Name</label>
                            <input id="lastName" type="text" autoComplete="family-name" required
                                value={lastName} onChange={(event) => setLastName(event.target.value)}
                                aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined} />
                            {fieldErrors.lastName && <p id="lastName-error" className="field-error">{fieldErrors.lastName}</p>}
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input id="email" type="email" autoComplete="email" required
                            value={email} onChange={(event) => setEmail(event.target.value)}
                            aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
                        {fieldErrors.email && <p id="email-error" className="field-error">{fieldErrors.email}</p>}
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input id="password" type="password" autoComplete="new-password" required
                            value={password} onChange={(event) => setPassword(event.target.value)}
                            aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
                        {fieldErrors.password && <p id="password-error" className="field-error">{fieldErrors.password}</p>}
                    </div>
                    {error && <p className="error-message" role="alert">{error}</p>}
                    {Object.keys(fieldErrors).length > 0 && !error &&
                        <p className="error-message" role="alert">Check the highlighted fields.</p>}
                    <button type="submit" className="auth-button" disabled={isSubmitting}>
                        {isSubmitting ? "Creating account..." : "Create Account"}
                    </button>
                </form>
                <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
            </div>
        </div>
    )
}

export default Register
