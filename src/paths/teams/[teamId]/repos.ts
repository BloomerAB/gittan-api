import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { repoMetadata } = deps()
  const repos = await repoMetadata.listByTeam(param(req, "teamId"))
  res.json(repos)
}
