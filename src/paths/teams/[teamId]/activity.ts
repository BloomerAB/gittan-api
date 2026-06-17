import type { Request, Response } from "express"

import { param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  const { repoMetadata, config } = deps()
  const repos = await repoMetadata.listByTeam(param(req, "teamId"))

  const activities = await Promise.all(
    repos.map(async (repo) => {
      const lastCommit = await fetchLastCommit(
        config.forgejoUrl,
        config.forgejoAdminToken,
        repo.forgejoFullName,
      )
      return {
        repoId: repo.id,
        repoName: repo.name,
        lastCommit,
      }
    }),
  )

  res.json(activities)
}

const fetchLastCommit = async (
  forgejoUrl: string,
  token: string | undefined,
  fullName: string,
): Promise<
  | { sha: string; message: string; author: string; timestamp: string }
  | undefined
> => {
  try {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `token ${token}`

    const forgejoRes = await fetch(
      `${forgejoUrl}/api/v1/repos/${fullName}/commits?limit=1&sha=main`,
      { headers },
    )

    if (!forgejoRes.ok) return undefined

    const commits = (await forgejoRes.json()) as Array<{
      sha: string
      commit: {
        message: string
        author: { name: string; date: string }
      }
    }>

    if (commits.length === 0) return undefined

    const c = commits[0]
    return {
      sha: c.sha,
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
      timestamp: c.commit.author.date,
    }
  } catch {
    return undefined
  }
}
