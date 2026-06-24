import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { getAuthUser } from "../../auth/helpers.js"
import { deps } from "../../deps.js"
import { KEYSPACE } from "../../db/schema.js"

const CreateOrgBody = z.object({
  displayName: z.string().min(1).max(128),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { orgRepo, memberRepo, db } = deps()

  const parsed = CreateOrgBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  try {
    const orgId = randomUUID()
    const org = await orgRepo.create({
      id: orgId,
      name: orgId,
      displayName: parsed.data.displayName,
    })

    await memberRepo.addMember(org.id, user.id, "owner")

    await db.batch(
      [
        {
          query: `UPDATE ${KEYSPACE}.users SET org_id = ?, role = ? WHERE id = ?`,
          params: [org.id, "org-admin", user.id],
        },
        {
          query: `INSERT INTO ${KEYSPACE}.users_by_org (org_id, user_id, email, name) VALUES (?, ?, ?, ?)`,
          params: [org.id, user.id, user.email, user.email],
        },
      ],
      { prepare: true },
    )

    res.status(201).json({
      id: org.id,
      name: org.name,
      displayName: org.displayName,
      role: "owner",
      plan: "starter",
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      res.status(409).json({ error: err.message })
      return
    }
    throw err
  }
}
