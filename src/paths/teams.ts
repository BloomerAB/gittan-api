import { randomUUID } from "node:crypto"

import type { Router } from "express"
import { z } from "zod"

import type { TTeamRepo } from "../db/team-repo.js"

const CreateTeamBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(128),
  slackChannel: z.string().optional(),
})

const AddMemberBody = z.object({
  userId: z.string().min(1),
  role: z.enum(["team-admin", "writer", "reader"]),
})

export const registerTeamRoutes = (
  router: Router,
  teamRepo: TTeamRepo,
): void => {
  router.get("/orgs/:orgId/teams", async (req, res) => {
    const teams = await teamRepo.listTeams(req.params.orgId)
    res.json(teams)
  })

  router.post("/orgs/:orgId/teams", async (req, res) => {
    const parsed = CreateTeamBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues })
      return
    }

    try {
      const team = await teamRepo.createTeam({
        id: randomUUID(),
        orgId: req.params.orgId,
        ...parsed.data,
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

  router.get("/orgs/:orgId/teams/:teamId", async (req, res) => {
    const team = await teamRepo.getTeam(req.params.orgId, req.params.teamId)
    if (!team) {
      res.status(404).json({ error: "Team not found" })
      return
    }
    res.json(team)
  })

  router.get("/orgs/:orgId/teams/by-name/:name", async (req, res) => {
    const team = await teamRepo.getTeamByName(req.params.orgId, req.params.name)
    if (!team) {
      res.status(404).json({ error: "Team not found" })
      return
    }
    res.json(team)
  })

  router.get("/teams/:teamId/members", async (req, res) => {
    const members = await teamRepo.listMembers(req.params.teamId)
    res.json(members)
  })

  router.post("/teams/:teamId/members", async (req, res) => {
    const parsed = AddMemberBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues })
      return
    }

    const member = await teamRepo.addMember({
      teamId: req.params.teamId,
      addedBy: "system",
      ...parsed.data,
    })
    res.status(201).json(member)
  })

  router.delete("/teams/:teamId/members/:userId", async (req, res) => {
    await teamRepo.removeMember(req.params.teamId, req.params.userId)
    res.status(204).end()
  })
}
