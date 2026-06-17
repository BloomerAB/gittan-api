import type { Request, Response } from "express"

import { param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { config } = deps()
  const owner = param(req, "owner")
  const repo = param(req, "repo")

  const forgejoRes = await fetch(
    `${config.forgejoUrl}/api/v1/repos/${owner}/${repo}/branches`,
    {
      headers: config.forgejoAdminToken
        ? { Authorization: `token ${config.forgejoAdminToken}` }
        : {},
    },
  )

  if (!forgejoRes.ok) {
    res.status(forgejoRes.status).json({ error: "Failed to fetch branches" })
    return
  }

  const branches = (await forgejoRes.json()) as Array<{ name: string }>
  res.json(branches.map((b) => ({ name: b.name })))
}
