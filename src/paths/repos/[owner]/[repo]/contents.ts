import type { Request, Response } from "express"

import { param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { config } = deps()
  const owner = param(req, "owner")
  const repo = param(req, "repo")
  const filePath = (req.query.path as string) ?? ""
  const ref = (req.query.ref as string) ?? "main"

  const forgejoRes = await fetch(
    `${config.forgejoUrl}/api/v1/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
    {
      headers: config.forgejoAdminToken
        ? { Authorization: `token ${config.forgejoAdminToken}` }
        : {},
    },
  )

  if (!forgejoRes.ok) {
    res.status(forgejoRes.status).json({ error: "Not found" })
    return
  }

  const data = await forgejoRes.json()
  res.json(data)
}
