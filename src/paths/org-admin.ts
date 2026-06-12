import type { Router } from "express"
import { z } from "zod"

import type { TTeamRepo } from "../db/team-repo.js"
import type { TStepRegistry } from "../db/step-registry.js"

const UpdateOidcBody = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  scimEnabled: z.boolean().default(false),
  mandatorySso: z.boolean().default(false),
})

const CreateStepBody = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9/.-]+$/),
  image: z.string().min(1),
  run: z.string().min(1),
  defaults: z.record(z.string()).optional(),
  cache: z.array(z.string()).optional(),
  description: z.string().max(256).optional(),
})

export type TOrgAdminDeps = {
  readonly teamRepo: TTeamRepo
  readonly stepRegistry: TStepRegistry
}

export const registerOrgAdminRoutes = (
  router: Router,
  deps: TOrgAdminDeps,
): void => {
  router.get("/admin/orgs/:orgId/teams", async (req, res) => {
    const teams = await deps.teamRepo.listTeams(req.params.orgId)
    res.json(teams)
  })

  router.post("/admin/orgs/:orgId/teams", async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
        displayName: z.string().min(1).max(128),
        slackChannel: z.string().optional(),
      })
      .safeParse(req.body)

    if (!body.success) {
      res.status(400).json({ error: body.error.issues })
      return
    }

    try {
      const team = await deps.teamRepo.createTeam({
        id: crypto.randomUUID(),
        orgId: req.params.orgId,
        ...body.data,
      })
      res.status(201).json(team)
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        res.status(409).json({ error: err.message })
        return
      }
      throw err
    }
  })

  router.get("/admin/orgs/:orgId/teams/:teamId/members", async (req, res) => {
    const members = await deps.teamRepo.listMembers(req.params.teamId)
    res.json(members)
  })

  router.post("/admin/orgs/:orgId/teams/:teamId/members", async (req, res) => {
    const body = z
      .object({
        userId: z.string().min(1),
        role: z.enum(["team-admin", "writer", "reader"]),
      })
      .safeParse(req.body)

    if (!body.success) {
      res.status(400).json({ error: body.error.issues })
      return
    }

    const member = await deps.teamRepo.addMember({
      teamId: req.params.teamId,
      addedBy: "org-admin",
      ...body.data,
    })
    res.status(201).json(member)
  })

  router.delete(
    "/admin/orgs/:orgId/teams/:teamId/members/:userId",
    async (req, res) => {
      await deps.teamRepo.removeMember(req.params.teamId, req.params.userId)
      res.status(204).end()
    },
  )

  router.get("/admin/orgs/:orgId/steps", async (req, res) => {
    const steps = await deps.stepRegistry.list(req.params.orgId)
    res.json(steps)
  })

  router.post("/admin/orgs/:orgId/steps", async (req, res) => {
    const parsed = CreateStepBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues })
      return
    }

    const step = await deps.stepRegistry.register({
      orgId: req.params.orgId,
      ...parsed.data,
    })
    res.status(201).json(step)
  })

  router.get("/admin/orgs/:orgId/steps/:name", async (req, res) => {
    const step = await deps.stepRegistry.get(
      req.params.orgId,
      req.params.name,
    )
    if (!step) {
      res.status(404).json({ error: "Step not found" })
      return
    }
    res.json(step)
  })
}
