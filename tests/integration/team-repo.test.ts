import type { Client } from "cassandra-driver"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { createTeamRepo } from "../../src/db/team-repo.js"
import { cleanupTestDb, setupTestDb } from "./db-setup.js"

describe("teamRepo", () => {
  let client: Client
  let teamRepo: ReturnType<typeof createTeamRepo>

  beforeAll(async () => {
    client = await setupTestDb()
    teamRepo = createTeamRepo(client)
  })

  afterEach(async () => {
    await cleanupTestDb(client)
  })

  afterAll(async () => {
    await client.shutdown()
  })

  describe("createTeam", () => {
    it("creates a team and returns it", async () => {
      const team = await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform Team",
      })

      expect(team.id).toBe("team-1")
      expect(team.orgId).toBe("org-1")
      expect(team.name).toBe("platform")
      expect(team.displayName).toBe("Platform Team")
      expect(team.slackChannel).toBeUndefined()
      expect(team.createdAt).toBeDefined()
      expect(team.updatedAt).toBeDefined()
    })

    it("creates a team with slack channel", async () => {
      const team = await teamRepo.createTeam({
        id: "team-2",
        orgId: "org-1",
        name: "api",
        displayName: "API Team",
        slackChannel: "#api-alerts",
      })

      expect(team.slackChannel).toBe("#api-alerts")
    })

    it("rejects duplicate team name in same org", async () => {
      await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform Team",
      })

      await expect(
        teamRepo.createTeam({
          id: "team-2",
          orgId: "org-1",
          name: "platform",
          displayName: "Another Platform",
        }),
      ).rejects.toThrow('Team "platform" already exists')
    })

    it("allows same team name in different orgs", async () => {
      await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform Team Org 1",
      })

      const team2 = await teamRepo.createTeam({
        id: "team-2",
        orgId: "org-2",
        name: "platform",
        displayName: "Platform Team Org 2",
      })

      expect(team2.orgId).toBe("org-2")
    })
  })

  describe("getTeam", () => {
    it("returns team by org and id", async () => {
      await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform Team",
      })

      const team = await teamRepo.getTeam("org-1", "team-1")
      expect(team).toBeDefined()
      expect(team!.name).toBe("platform")
    })

    it("returns undefined for non-existent team", async () => {
      const team = await teamRepo.getTeam("org-1", "nonexistent")
      expect(team).toBeUndefined()
    })
  })

  describe("getTeamByName", () => {
    it("finds team by org and name", async () => {
      await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform Team",
      })

      const team = await teamRepo.getTeamByName("org-1", "platform")
      expect(team).toBeDefined()
      expect(team!.id).toBe("team-1")
    })

    it("returns undefined for non-existent name", async () => {
      const team = await teamRepo.getTeamByName("org-1", "nonexistent")
      expect(team).toBeUndefined()
    })
  })

  describe("listTeams", () => {
    it("lists all teams in an org", async () => {
      await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform",
      })
      await teamRepo.createTeam({
        id: "team-2",
        orgId: "org-1",
        name: "api",
        displayName: "API",
      })
      await teamRepo.createTeam({
        id: "team-3",
        orgId: "org-2",
        name: "mobile",
        displayName: "Mobile",
      })

      const teams = await teamRepo.listTeams("org-1")
      expect(teams).toHaveLength(2)

      const names = teams.map((t) => t.name).sort()
      expect(names).toEqual(["api", "platform"])
    })

    it("returns empty array for org with no teams", async () => {
      const teams = await teamRepo.listTeams("org-nonexistent")
      expect(teams).toEqual([])
    })
  })

  describe("addMember", () => {
    it("adds a member to a team", async () => {
      await teamRepo.createTeam({
        id: "team-1",
        orgId: "org-1",
        name: "platform",
        displayName: "Platform",
      })

      const member = await teamRepo.addMember({
        teamId: "team-1",
        userId: "user-1",
        role: "writer",
        addedBy: "admin-1",
      })

      expect(member.teamId).toBe("team-1")
      expect(member.userId).toBe("user-1")
      expect(member.role).toBe("writer")
      expect(member.addedBy).toBe("admin-1")
    })

    it("supports all team roles", async () => {
      for (const role of ["team-admin", "writer", "reader"] as const) {
        const member = await teamRepo.addMember({
          teamId: "team-1",
          userId: `user-${role}`,
          role,
          addedBy: "admin-1",
        })
        expect(member.role).toBe(role)
      }
    })
  })

  describe("listMembers", () => {
    it("lists all members of a team", async () => {
      await teamRepo.addMember({
        teamId: "team-1",
        userId: "user-1",
        role: "team-admin",
        addedBy: "admin-1",
      })
      await teamRepo.addMember({
        teamId: "team-1",
        userId: "user-2",
        role: "writer",
        addedBy: "admin-1",
      })

      const members = await teamRepo.listMembers("team-1")
      expect(members).toHaveLength(2)

      const userIds = members.map((m) => m.userId).sort()
      expect(userIds).toEqual(["user-1", "user-2"])
    })

    it("returns empty array for team with no members", async () => {
      const members = await teamRepo.listMembers("team-nonexistent")
      expect(members).toEqual([])
    })
  })

  describe("removeMember", () => {
    it("removes a member from a team", async () => {
      await teamRepo.addMember({
        teamId: "team-1",
        userId: "user-1",
        role: "writer",
        addedBy: "admin-1",
      })

      await teamRepo.removeMember("team-1", "user-1")

      const members = await teamRepo.listMembers("team-1")
      expect(members).toEqual([])
    })

    it("does not throw when removing non-existent member", async () => {
      await expect(
        teamRepo.removeMember("team-1", "nonexistent"),
      ).resolves.not.toThrow()
    })
  })
})
