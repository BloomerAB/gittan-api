import type { Router } from "express"

import type { TConfig } from "../config/index.js"
import type { TRepoMetadataRepo } from "../db/repo-metadata.js"

export type TRepoActivity = {
  readonly repoId: string
  readonly repoName: string
  readonly lastCommit?: {
    readonly sha: string
    readonly message: string
    readonly author: string
    readonly timestamp: string
  }
}

export type TTeamMetrics = {
  readonly teamId: string
  readonly period: string
  readonly pushFrequency: number
  readonly avgPipelineLeadTimeMs: number
  readonly pushRejectionRate: number
  readonly avgRecoveryTimeMs: number
  readonly totalPushes: number
  readonly successfulPushes: number
  readonly failedPushes: number
  readonly repos: ReadonlyArray<{
    readonly repoId: string
    readonly repoName: string
    readonly pushCount: number
    readonly failureRate: number
    readonly avgLeadTimeMs: number
  }>
}

export const registerRepoActivityRoutes = (
  router: Router,
  repoMetadata: TRepoMetadataRepo,
  config: TConfig,
): void => {
  router.get("/teams/:teamId/activity", async (req, res) => {
    const repos = await repoMetadata.listByTeam(req.params.teamId)

    const activities: TRepoActivity[] = await Promise.all(
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
  })

  router.get("/teams/:teamId/metrics", async (_req, res) => {
    res.json({
      teamId: _req.params.teamId,
      period: "7d",
      pushFrequency: 0,
      avgPipelineLeadTimeMs: 0,
      pushRejectionRate: 0,
      avgRecoveryTimeMs: 0,
      totalPushes: 0,
      successfulPushes: 0,
      failedPushes: 0,
      repos: [],
    } satisfies TTeamMetrics)
  })
}

const fetchLastCommit = async (
  forgejoUrl: string,
  token: string | undefined,
  fullName: string,
): Promise<TRepoActivity["lastCommit"]> => {
  try {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `token ${token}`

    const res = await fetch(
      `${forgejoUrl}/api/v1/repos/${fullName}/commits?limit=1&sha=main`,
      { headers },
    )

    if (!res.ok) return undefined

    const commits = (await res.json()) as Array<{
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
