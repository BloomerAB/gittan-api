import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { getAuthUser } from "../../auth/helpers.js"
import { deps } from "../../deps.js"
import { KEYSPACE } from "../../db/schema.js"

const CreateOrgBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(128),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  const user = getAuthUser(req)
  const { orgRepo, db } = deps()

  const parsed = CreateOrgBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  try {
    const org = await orgRepo.create({
      id: randomUUID(),
      name: parsed.data.name,
      displayName: parsed.data.displayName,
    })

    await db.execute(
      `UPDATE ${KEYSPACE}.users SET org_id = ?, role = ? WHERE id = ?`,
      [org.id, "org-admin", user.id],
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
