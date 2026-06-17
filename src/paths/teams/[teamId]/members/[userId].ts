import type { Request, Response } from "express"

import { param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const DELETE = async (req: Request, res: Response): Promise<void> => {
  const { teamRepo } = deps()
  await teamRepo.removeMember(param(req, "teamId"), param(req, "userId"))
  res.status(204).end()
}
