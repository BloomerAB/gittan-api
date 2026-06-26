import type { Request, Response } from "express"

import { getAuthUser, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { KEYSPACE } from "../../../db/schema.js"

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const keyId = parseInt(param(req, "keyId"), 10)

  if (isNaN(keyId)) {
    res.status(400).json({ error: "Invalid key ID" })
    return
  }

  const { db, forgejo } = deps()

  const result = await db.execute(
    `SELECT forgejo_username FROM ${KEYSPACE}.users WHERE id = ?`,
    [user.id],
    { prepare: true },
  )

  const row = result.first()
  const forgejoUsername = row?.forgejo_username as string | null

  if (!forgejoUsername) {
    res.status(404).json({ error: "No SSH keys configured" })
    return
  }

  try {
    await forgejo.deleteUserSSHKey(forgejoUsername, keyId)
    res.status(204).send()
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete SSH key"
    if (message.includes("404")) {
      res.status(404).json({ error: "SSH key not found" })
      return
    }
    res.status(500).json({ error: message })
  }
}
