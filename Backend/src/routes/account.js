import express from "express"
import db from "../database/db.js"
import { comparePassword, hashPassword } from "../security/password.js"
import { requireAuth } from "../security/requireAuth.js"

export const accountRouter = express.Router()

accountRouter.post("/password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {}
    if (typeof currentPassword !== "string" || !currentPassword) {
        return res.status(400).send({ error: "Enter your current password." })
    }
    if (typeof newPassword !== "string" || !newPassword.trim() || Buffer.byteLength(newPassword, "utf8") > 72) {
        return res.status(400).send({ error: "Enter a new password with at least one non-space character and at most 72 UTF-8 bytes." })
    }

    const account = db.prepare(
        "SELECT password_hash FROM user_account WHERE id = ? AND is_enabled = 1"
    ).get(req.user.id)
    if (!account) {
        return res.status(403).send({ error: "Your account is unavailable." })
    }
    if (!(await comparePassword(currentPassword, account.password_hash))) {
        return res.status(400).send({ error: "The current password is incorrect." })
    }
    if (await comparePassword(newPassword, account.password_hash)) {
        return res.status(400).send({ error: "Choose a password different from your current password." })
    }

    const newHash = await hashPassword(newPassword)
    const { changes } = db.prepare(`
        UPDATE user_account SET password_hash = ?
        WHERE id = ? AND is_enabled = 1 AND password_hash = ?
    `).run(newHash, req.user.id, account.password_hash)
    if (!changes) {
        return res.status(409).send({ error: "Your account changed. Try again." })
    }

    res.send({ message: "Password changed." })
})
