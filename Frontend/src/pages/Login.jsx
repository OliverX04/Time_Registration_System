import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { loginUser } from "../services/authService.js"

function Login() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")

    const navigate = useNavigate()

    async function handleLogin(event) {
        event.preventDefault()

        setError("")

        try {
            const user = await loginUser(email, password)

            if (user.role === "INTERN") {
                navigate("/intern-dashboard")
            }

            if (user.role === "SUPERVISOR") {
                navigate("/supervisor-dashboard")
            }
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1>Log In</h1>

                <p className="auth-subtitle">
                    Log in to access your account.
                </p>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label htmlFor="email">
                            Email
                        </label>

                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">
                            Password
                        </label>

                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            required
                        />
                    </div>

                    {error && (
                        <p className="error-message">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="auth-button"
                    >
                        Log In
                    </button>
                </form>

                <p className="auth-switch">
                    Don't have an account?{" "}
                    <Link to="/register">
                        Create account
                    </Link>
                </p>
            </div>
        </div>
    )
}

export default Login