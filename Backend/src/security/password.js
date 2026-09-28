import bcrypt from "bcrypt"

export async function hashPassword(password) {
    const hashedPassword = await bcrypt.hash(password, 10)
    return hashedPassword
}

export async function comparePassword(password, hashedPassword) {
    const passwordMatch = await bcrypt.compare(password, hashedPassword)
    return passwordMatch
}