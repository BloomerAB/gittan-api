import { randomUUID } from "node:crypto"

import type { Router } from "express"
import { z } from "zod"

import { hashPassword, verifyPassword } from "../auth/passwords.js"
import { createToken } from "../auth/tokens.js"
import type { TUserRepo } from "../db/user-repo.js"
import type { TTeamRepo } from "../db/team-repo.js"

const RegisterBody = z.object({
  email: z.string().email().max(255),
  password: z.string().min(12).max(128),
})

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const SetupOrgBody = z.object({
  orgName: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(128),
})

const loginAttempts = new Map<string, { count: number; resetAt: number }>()

const checkRateLimit = (key: string, maxAttempts: number, windowMs: number): boolean => {
  const now = Date.now()
  const entry = loginAttempts.get(key)

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxAttempts) return false

  loginAttempts.set(key, { count: entry.count + 1, resetAt: entry.resetAt })
  return true
}

export const registerAuthRoutes = (
  router: Router,
  userRepo: TUserRepo,
  teamRepo: TTeamRepo,
): void => {
  router.post("/auth/register", async (req, res) => {
    const parsed = RegisterBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues })
      return
    }

    const { email, password } = parsed.data

    if (!checkRateLimit(email, 3, 300_000)) {
      res.status(429).json({ error: "Too many registration attempts. Try again in 5 minutes." })
      return
    }

    try {
      const passwordHash = hashPassword(password)
      const user = await userRepo.create(randomUUID(), email, passwordHash)
      const token = createToken({ userId: user.id, email: user.email })

      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, role: user.role },
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        res.status(409).json({ error: "Email already registered" })
        return
      }
      throw err
    }
  })

  router.post("/auth/login", async (req, res) => {
    const parsed = LoginBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email or password" })
      return
    }

    const { email, password } = parsed.data
    const ip = req.ip ?? "unknown"

    if (!checkRateLimit(`login:${ip}`, 10, 600_000)) {
      res.status(429).json({ error: "Too many login attempts. Try again in 10 minutes." })
      return
    }

    const user = await userRepo.getByEmail(email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    const token = createToken({
      userId: user.id,
      email: user.email,
      orgId: user.orgId,
      role: user.role,
    })

    res.json({
      token,
      user: { id: user.id, email: user.email, orgId: user.orgId, role: user.role },
    })
  })

  router.post("/auth/setup-org", async (req, res) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" })
      return
    }

    const { verifyToken } = await import("../auth/tokens.js")
    const payload = verifyToken(authHeader.slice(7))
    if (!payload) {
      res.status(401).json({ error: "Invalid token" })
      return
    }

    const parsed = SetupOrgBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues })
      return
    }

    const { orgName, displayName } = parsed.data

    const team = await teamRepo.createTeam({
      id: randomUUID(),
      orgId: orgName,
      name: "default",
      displayName: "Default Team",
    })

    await userRepo.setOrg(payload.userId, orgName, "org-admin")

    const newToken = createToken({
      userId: payload.userId,
      email: payload.email,
      orgId: orgName,
      role: "org-admin",
    })

    res.status(201).json({
      token: newToken,
      org: { name: orgName, displayName },
      team: { id: team.id, name: team.name },
    })
  })
}
