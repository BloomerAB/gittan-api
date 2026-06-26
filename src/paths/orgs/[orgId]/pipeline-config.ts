import type { Request, Response } from "express"

import { assertOrgOwner, param } from "../../../auth/helpers.js"
import { deps } from "../../../deps.js"
import { initConfigRepo, configRepoName } from "../../../pipeline/config-repo.js"

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgOwner(req, res))) return

  const { forgejo, stepRegistry, policyRepo } = deps()
  const orgId = param(req, "orgId")

  const repoName = configRepoName("org", "")
  const existing = await forgejo.getRepo(orgId, repoName)

  if (existing) {
    res.status(409).json({ error: "Pipeline config repo already exists", repoName })
    return
  }

  try {
    await initConfigRepo(forgejo, orgId, stepRegistry, policyRepo)
    res.status(201).json({ repoName, message: "Pipeline config repo initialized" })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to initialize config repo"
    res.status(500).json({ error: message })
  }
}

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgOwner(req, res))) return

  const { forgejo } = deps()
  const orgId = param(req, "orgId")
  const repoName = configRepoName("org", "")

  const repo = await forgejo.getRepo(orgId, repoName)
  res.json({ initialized: !!repo, repoName })
}
