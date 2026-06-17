import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!assertOrgAccess(req, res)) return

  const { repoMetadata } = deps()
  const repo = await repoMetadata.getById(param(req, "orgId"), param(req, "repoId"))

  if (!repo) {
    res.status(404).json({ error: "Repository not found" })
    return
  }

  res.json(repo)
}
