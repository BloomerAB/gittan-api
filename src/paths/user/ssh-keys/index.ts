import type { Request, Response } from "express"
import { z } from "zod"

import { getAuthUser } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { KEYSPACE } from "../../../db/schema.js"

const ensureForgejoUser = async (userId: string): Promise<string> => {
  const { db, forgejo, memberRepo } = deps()

  const result = await db.execute(
    `SELECT forgejo_username, email, name FROM ${KEYSPACE}.users WHERE id = ?`,
    [userId],
    { prepare: true },
  )

  const row = result.first()
  if (!row) throw new Error("User not found")

  const existingUsername = row.forgejo_username as string | null
  if (existingUsername) {
    const existing = await forgejo.getUser(existingUsername)
    if (existing) return existingUsername
  }

  const forgejoUsername = `gt-${userId.replace(/-/g, "").slice(0, 16)}`
  const email = row.email as string
  const name = row.name as string

  try {
    await forgejo.createUser({ username: forgejoUsername, email, fullName: name })
  } catch (err) {
    const existing = await forgejo.getUser(forgejoUsername)
    if (!existing) throw err
  }

  if (!existingUsername) {
    await db.execute(
      `UPDATE ${KEYSPACE}.users SET forgejo_username = ? WHERE id = ?`,
      [forgejoUsername, userId],
      { prepare: true },
    )
  }

  const memberships = await memberRepo.getUserOrgIds(userId)
  for (const m of memberships) {
    try {
      await forgejo.addOrgMember(m.orgId, forgejoUsername)
    } catch { /* org may not exist in Forgejo yet */ }
  }

  return forgejoUsername
}

export const GET = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { forgejo } = deps()

  try {
    const forgejoUsername = await ensureForgejoUser(user.id)
    const keys = await forgejo.listUserSSHKeys(forgejoUsername)

    res.json(
      keys.map((k) => ({
        id: k.id,
        title: k.title,
        fingerprint: k.fingerprint,
        createdAt: k.created_at,
      })),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list SSH keys"
    res.status(500).json({ error: message })
  }
}

const AddKeyBody = z.object({
  title: z.string().min(1).max(128),
  key: z.string().min(1).max(8192),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { forgejo } = deps()

  const parsed = AddKeyBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  try {
    const forgejoUsername = await ensureForgejoUser(user.id)
    const key = await forgejo.addUserSSHKey(forgejoUsername, parsed.data.title, parsed.data.key)

    res.status(201).json({
      id: key.id,
      title: key.title,
      fingerprint: key.fingerprint,
      createdAt: key.created_at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add SSH key"
    if (message.includes("422")) {
      res.status(422).json({ error: "Invalid SSH key or key already exists" })
      return
    }
    res.status(500).json({ error: message })
  }
}
