import { randomUUID } from "node:crypto"

import type { Router } from "express"
import { z } from "zod"

import type { TRepoMetadataRepo } from "../db/repo-metadata.js"
import type { TTeamRepo } from "../db/team-repo.js"
import type { TForgejoClient } from "../integrations/forgejo.js"

const CreateRepoBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  teamId: z.string().min(1),
  description: z.string().max(256).optional(),
  private: z.boolean().default(true),
  gatedBranches: z.array(z.string()).default(["main"]),
})

export type TRepoDeps = {
  readonly repoMetadata: TRepoMetadataRepo
  readonly teamRepo: TTeamRepo
  readonly forgejo: TForgejoClient
  readonly webhookBaseUrl: string
}

export const registerRepoRoutes = (
  router: Router,
  deps: TRepoDeps,
): void => {
  router.post("/orgs/:orgId/repos", async (req, res) => {
    const parsed = CreateRepoBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues })
      return
    }

    const { orgId } = req.params
    const { name, teamId, description, gatedBranches } = parsed.data
    const isPrivate = parsed.data.private

    const team = await deps.teamRepo.getTeam(orgId, teamId)
    if (!team) {
      res.status(404).json({ error: "Team not found" })
      return
    }

    let forgejoOrg = await deps.forgejo.getOrg(orgId)
    if (!forgejoOrg) {
      forgejoOrg = await deps.forgejo.createOrg(orgId)
    }

    const forgejoRepo = await deps.forgejo.createRepo(orgId, {
      name,
      description,
      private: isPrivate,
    })

    await deps.forgejo.createWebhook(orgId, name, `${deps.webhookBaseUrl}/hooks/push`, [
      "push",
    ])

    const repoId = randomUUID()
    const metadata = await deps.repoMetadata.create({
      id: repoId,
      orgId,
      teamId,
      name,
      forgejoFullName: forgejoRepo.fullName,
      cloneUrl: forgejoRepo.cloneUrl,
      sshUrl: forgejoRepo.sshUrl,
      gatedBranches,
    })

    res.status(201).json(metadata)
  })

  router.get("/orgs/:orgId/repos/:repoId", async (req, res) => {
    const repo = await deps.repoMetadata.getById(
      req.params.orgId,
      req.params.repoId,
    )
    if (!repo) {
      res.status(404).json({ error: "Repository not found" })
      return
    }
    res.json(repo)
  })

  router.get("/teams/:teamId/repos", async (req, res) => {
    const repos = await deps.repoMetadata.listByTeam(req.params.teamId)
    res.json(repos)
  })
}
