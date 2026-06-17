import type { Request, Response } from "express"
import { z } from "zod"

import { param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

const AddMemberBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["team-admin", "writer", "reader"]),
})

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { teamRepo } = deps()
  const members = await teamRepo.listMembers(param(req, "teamId"))
  res.json(members)
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  const { teamRepo } = deps()
  const parsed = AddMemberBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const member = await teamRepo.addMember({
    teamId: param(req, "teamId"),
    addedBy: "system",
    ...parsed.data,
  })
  res.status(201).json(member)
}
