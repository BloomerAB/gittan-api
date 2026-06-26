import { randomUUID } from "node:crypto"

import type { Request, Response } from "express"
import { z } from "zod"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"

const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/

const MigrateRepoBody = z.object({
  githubUrl: z.string().regex(GITHUB_URL_PATTERN, "Must be a valid GitHub repository URL"),
  githubToken: z.string().min(1, "GitHub token is required"),
  teamId: z.string().min(1),
  private: z.boolean().default(true),
  gatedBranches: z.array(z.string()).default(["main"]),
  update: z.boolean().default(false),
})

const extractRepoName = (githubUrl: string): string => {
  const parts = githubUrl.replace(/\.git$/, "").split("/")
  return parts[parts.length - 1].toLowerCase()
}

export const POST = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const { repoMetadata, teamRepo, forgejo, config } = deps()
  const parsed = MigrateRepoBody.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues })
    return
  }

  const orgId = param(req, "orgId")
  const { githubUrl, githubToken, teamId, gatedBranches, update } = parsed.data
  const isPrivate = parsed.data.private
  const repoName = extractRepoName(githubUrl)

  const team = await teamRepo.getTeam(orgId, teamId)
  if (!team) {
    res.status(404).json({ error: "Team not found" })
    return
  }

  const existingForgejo = await forgejo.getRepo(orgId, repoName)
  if (existingForgejo) {
    const existingMeta = await repoMetadata.getByForgejoName(`${orgId}/${repoName}`)
    if (existingMeta && !update) {
      res.status(409).json({ error: `Repository '${repoName}' already exists`, canUpdate: true })
      return
    }
    await forgejo.deleteRepo(orgId, repoName)
    if (existingMeta) {
      await repoMetadata.delete(orgId, existingMeta.id)
    }
  }

  let forgejoOrg = await forgejo.getOrg(orgId)
  if (!forgejoOrg) {
    forgejoOrg = await forgejo.createOrg(orgId)
  }

  const cloneUrl = githubUrl.endsWith(".git") ? githubUrl : `${githubUrl}.git`

  try {
    const forgejoRepo = await forgejo.migrateRepo({
      orgName: orgId,
      repoName,
      cloneUrl,
      authToken: githubToken,
      isPrivate,
    })

    const webhookBaseUrl = `http://localhost:${config.port}`
    await forgejo.createWebhook(orgId, repoName, `${webhookBaseUrl}/hooks/push`, ["push"])

    const repoId = randomUUID()
    const metadata = await repoMetadata.create({
      id: repoId,
      orgId,
      teamId,
      name: repoName,
      forgejoFullName: forgejoRepo.fullName,
      cloneUrl: forgejoRepo.cloneUrl,
      sshUrl: forgejoRepo.sshUrl,
      gatedBranches,
    })

    res.status(201).json({ ...metadata, migratedFrom: githubUrl })
  } catch (err) {
    try { await forgejo.deleteRepo(orgId, repoName) } catch { /* best-effort cleanup */ }

    const message = err instanceof Error ? err.message : "Migration failed"
    if (message.includes("409") || message.includes("already exists")) {
      res.status(409).json({ error: `Repository '${repoName}' already exists in Forgejo` })
      return
    }
    res.status(500).json({ error: `Migration failed: ${message}` })
  }
}
