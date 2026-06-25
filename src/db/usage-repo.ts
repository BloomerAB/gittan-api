import type { Client } from "cassandra-driver"
import { PLAN_LIMITS, type TPlanType } from "@bloomerab/gittan-types"

import { KEYSPACE } from "./schema.js"

export type TOrgPlanRow = {
  readonly orgId: string
  readonly plan: TPlanType
  readonly ciBlocks: number
  readonly receiptEmail?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type TUsageEventRow = {
  readonly orgId: string
  readonly month: string
  readonly eventId: string
  readonly type: string
  readonly pipelineRunId: string
  readonly teamId: string
  readonly repoId: string
  readonly durationMs: number
  readonly ciMinutes: number
  readonly createdAt: string
}

export type TOrgUsageRow = {
  readonly orgId: string
  readonly month: string
  readonly ciMinutesUsed: number
  readonly storageBytes: number
  readonly userCount: number
  readonly teamCount: number
  readonly repoCount: number
  readonly updatedAt: string
}

const currentMonth = (): string => {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export const createUsageRepo = (client: Client) => ({
  getPlan: async (orgId: string): Promise<TOrgPlanRow | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_plans WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToPlan(result.first())
  },

  setPlan: async (orgId: string, plan: TPlanType, ciBlocks: number = 0, receiptEmail?: string): Promise<TOrgPlanRow> => {
    const now = new Date().toISOString()

    const existing = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_plans WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    const existingEmail = existing.rowLength > 0 ? (existing.first().billing_email as string | null) : null
    const effectiveEmail = receiptEmail ?? existingEmail ?? null
    const createdAt = existing.rowLength > 0 ? (existing.first().created_at as Date).toISOString() : now

    await client.execute(
      `INSERT INTO ${KEYSPACE}.org_plans (org_id, plan, ci_blocks, billing_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, plan, ciBlocks, effectiveEmail, createdAt, now],
      { prepare: true },
    )

    return { orgId, plan, ciBlocks, receiptEmail: effectiveEmail ?? undefined, createdAt, updatedAt: now }
  },

  recordPipelineUsage: async (input: {
    readonly orgId: string
    readonly pipelineRunId: string
    readonly teamId: string
    readonly repoId: string
    readonly durationMs: number
  }): Promise<void> => {
    const month = currentMonth()
    const eventId = `${Date.now()}-${input.pipelineRunId}`
    const ciMinutes = Math.ceil(input.durationMs / 60_000)
    const now = new Date().toISOString()

    await client.batch(
      [
        {
          query: `INSERT INTO ${KEYSPACE}.usage_events (org_id, month, event_id, type, pipeline_run_id, team_id, repo_id, duration_ms, ci_minutes, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [input.orgId, month, eventId, "pipeline_run", input.pipelineRunId, input.teamId, input.repoId, input.durationMs, ciMinutes, now],
        },
        {
          query: `UPDATE ${KEYSPACE}.org_usage_monthly SET ci_minutes_used = ci_minutes_used + ?, updated_at = ? WHERE org_id = ? AND month = ?`,
          params: [ciMinutes, now, input.orgId, month],
        },
      ],
      { prepare: true },
    )
  },

  getUsage: async (orgId: string, month?: string): Promise<TOrgUsageRow | undefined> => {
    const m = month ?? currentMonth()
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_usage_monthly WHERE org_id = ? AND month = ?`,
      [orgId, m],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToUsage(result.first())
  },

  getUsageHistory: async (orgId: string, months: number = 6): Promise<ReadonlyArray<TOrgUsageRow>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_usage_monthly WHERE org_id = ? LIMIT ?`,
      [orgId, months],
      { prepare: true },
    )

    return result.rows.map(rowToUsage)
  },

  getEffectiveCiLimit: async (orgId: string): Promise<number> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.org_plans WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    if (result.rowLength === 0) return PLAN_LIMITS.starter.ciMinutesLimit

    const plan = result.first()
    const planType = (plan.plan as TPlanType) ?? "starter"
    const ciBlocks = (plan.ci_blocks as number) ?? 0
    const baseLimits = PLAN_LIMITS[planType]

    return baseLimits.ciMinutesLimit + ciBlocks * 10_000
  },

  listAllOrgUsage: async (): Promise<ReadonlyArray<{
    readonly orgId: string
    readonly plan: TPlanType
    readonly ciBlocks: number
    readonly ciMinutesUsed: number
    readonly ciMinutesLimit: number
    readonly storageBytes: number
    readonly userCount: number
    readonly teamCount: number
    readonly repoCount: number
    readonly quotaStatus: "ok" | "warning" | "blocked"
    readonly monthlyRevenue: number
  }>> => {
    const month = currentMonth()

    const [plans, usages, orgs] = await Promise.all([
      client.execute(`SELECT * FROM ${KEYSPACE}.org_plans`, [], { prepare: true }),
      client.execute(`SELECT * FROM ${KEYSPACE}.org_usage_monthly WHERE month = ? ALLOW FILTERING`, [month], { prepare: true }),
      client.execute(`SELECT id, name, display_name FROM ${KEYSPACE}.orgs`, [], { prepare: true }),
    ])

    const usageByOrg = new Map(
      usages.rows.map((r) => [r.org_id as string, r]),
    )

    const orgIds = new Set([
      ...plans.rows.map((r) => r.org_id as string),
      ...orgs.rows.map((r) => r.id as string),
    ])

    return [...orgIds].map((orgId) => {
      const planRow = plans.rows.find((r) => (r.org_id as string) === orgId)
      const usageRow = usageByOrg.get(orgId)

      const plan = (planRow?.plan as TPlanType) ?? "starter"
      const ciBlocks = (planRow?.ci_blocks as number) ?? 0
      const baseLimits = PLAN_LIMITS[plan]
      const ciMinutesLimit = baseLimits.ciMinutesLimit + ciBlocks * 10_000
      const ciMinutesUsed = (usageRow?.ci_minutes_used as number) ?? 0

      const ratio = ciMinutesLimit > 0 ? ciMinutesUsed / ciMinutesLimit : 0
      const quotaStatus = ratio >= 1 ? "blocked" as const : ratio >= 0.9 ? "warning" as const : "ok" as const

      const planPrice = plan === "team" ? 199 : 29
      const blockPrice = ciBlocks * 79
      const monthlyRevenue = planPrice + blockPrice

      return {
        orgId,
        plan,
        ciBlocks,
        ciMinutesUsed,
        ciMinutesLimit,
        storageBytes: Number(usageRow?.storage_bytes ?? 0),
        userCount: (usageRow?.user_count as number) ?? 0,
        teamCount: (usageRow?.team_count as number) ?? 0,
        repoCount: (usageRow?.repo_count as number) ?? 0,
        quotaStatus,
        monthlyRevenue,
      }
    })
  },

  updateCounts: async (orgId: string, counts: {
    readonly userCount: number
    readonly teamCount: number
    readonly repoCount: number
    readonly storageBytes: number
  }): Promise<void> => {
    const month = currentMonth()
    const now = new Date().toISOString()

    await client.execute(
      `UPDATE ${KEYSPACE}.org_usage_monthly SET user_count = ?, team_count = ?, repo_count = ?, storage_bytes = ?, updated_at = ? WHERE org_id = ? AND month = ?`,
      [counts.userCount, counts.teamCount, counts.repoCount, counts.storageBytes, now, orgId, month],
      { prepare: true },
    )
  },
})

const rowToPlan = (row: Record<string, unknown>): TOrgPlanRow => ({
  orgId: row.org_id as string,
  plan: (row.plan as TPlanType) ?? "personal",
  ciBlocks: (row.ci_blocks as number) ?? 0,
  receiptEmail: (row.billing_email as string | null) ?? undefined,
  createdAt: (row.created_at as Date).toISOString(),
  updatedAt: (row.updated_at as Date).toISOString(),
})

const rowToUsage = (row: Record<string, unknown>): TOrgUsageRow => ({
  orgId: row.org_id as string,
  month: row.month as string,
  ciMinutesUsed: (row.ci_minutes_used as number) ?? 0,
  storageBytes: Number(row.storage_bytes ?? 0),
  userCount: (row.user_count as number) ?? 0,
  teamCount: (row.team_count as number) ?? 0,
  repoCount: (row.repo_count as number) ?? 0,
  updatedAt: row.updated_at ? (row.updated_at as Date).toISOString() : new Date().toISOString(),
})

export type TUsageRepo = ReturnType<typeof createUsageRepo>
