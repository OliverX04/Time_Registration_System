const API_URL = "http://localhost:3000"

export async function registerUser(firstName, lastName, email, password) {
    const response = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            firstName,
            lastName,
            email,
            password
        })
    })

    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Registration failed")
        error.fieldErrors = data.fieldErrors || {}
        throw error
    }

    return data
}

export async function loginUser(email, password) {
    const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            password
        })
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || "Login failed")
    }

    const authHeader = response.headers.get("Authorization")

    if (!authHeader) {
        throw new Error("Authentication token missing")
    }

    const token = authHeader.split(" ")[1]

    localStorage.setItem("jwt", token)
    localStorage.setItem("user", JSON.stringify(data.user))

    return data.user
}

export function getToken() {
    return localStorage.getItem("jwt")
}

export function getCurrentUser() {
    const user = localStorage.getItem("user")

    if (!user) {
        return null
    }

    return JSON.parse(user)
}

export function logoutUser() {
    localStorage.removeItem("jwt")
    localStorage.removeItem("user")
}
