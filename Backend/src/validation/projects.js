export function validateProject(input, partial = false) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input : {}
    const values = {}
    const fieldErrors = {}

    if (!partial || Object.hasOwn(body, "name")) {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
            fieldErrors.name = "Project name must contain between 1 and 100 characters."
        } else {
            values.name = body.name.trim()
        }
    }

    if (!partial || Object.hasOwn(body, "description")) {
        const description = body.description === undefined ? "" : body.description

        if (typeof description !== "string" || description.trim().length > 2000) {
            fieldErrors.description = "Description must be text of at most 2000 characters."
        } else {
            values.description = description.trim()
        }
    }

    if (partial && !Object.hasOwn(body, "name") && !Object.hasOwn(body, "description")) {
        fieldErrors.form = "Provide a project name or description to update."
    }

    return { values, fieldErrors }
}
