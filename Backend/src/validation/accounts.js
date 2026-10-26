export function normalizeEmail(email) {
    return email.trim().toLowerCase()
}

function validateEmail(email, fieldErrors) {
    if (typeof email !== "string") {
        fieldErrors.email = "Enter an email address."
        return ""
    }

    const normalizedEmail = normalizeEmail(email)

    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        fieldErrors.email = "Enter a valid email address of at most 254 characters."
    }

    return normalizedEmail
}

function validateName(name, field, label, fieldErrors) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        fieldErrors[field] = `${label} must contain between 1 and 100 characters.`
        return ""
    }

    return name.trim()
}

function validatePassword(password, fieldErrors) {
    if (typeof password !== "string" || !password.length) {
        fieldErrors.password = "Enter a password."
    }

    return password
}

export function validateRegistration(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {}
    const fieldErrors = {}
    const values = {
        firstName: validateName(body.firstName, "firstName", "First name", fieldErrors),
        lastName: validateName(body.lastName, "lastName", "Last name", fieldErrors),
        email: validateEmail(body.email, fieldErrors),
        password: validatePassword(body.password, fieldErrors)
    }

    return { values, fieldErrors }
}

export function validateLogin(input) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {}
    const fieldErrors = {}
    const values = {
        email: validateEmail(body.email, fieldErrors),
        password: validatePassword(body.password, fieldErrors)
    }

    return { values, fieldErrors }
}
