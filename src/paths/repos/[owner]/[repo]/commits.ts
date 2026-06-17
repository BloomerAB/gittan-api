import type { Request, Response } from "express"

import { param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { config } = deps()
  const owner = param(req, "owner")
  const repo = param(req, "repo")
  const ref = (req.query.ref as string) ?? "main"
  const limit = (req.query.limit as string) ?? "20"

  const forgejoRes = await fetch(
    `${config.forgejoUrl}/api/v1/repos/${owner}/${repo}/commits?sha=${ref}&limit=${limit}`,
    {
      headers: config.forgejoAdminToken
        ? { Authorization: `token ${config.forgejoAdminToken}` }
        : {},
    },
  )

  if (!forgejoRes.ok) {
    res.status(forgejoRes.status).json({ error: "Failed to fetch commits" })
    return
  }

  const commits = (await forgejoRes.json()) as Array<{
    sha: string
    commit: {
      message: string
      author: { name: string; date: string }
    }
  }>

  res.json(
    commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
      timestamp: c.commit.author.date,
    })),
  )
}
