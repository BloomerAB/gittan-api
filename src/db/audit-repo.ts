import type { Client } from "cassandra-driver"
import { types as CassandraTypes } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TAuditEvent = {
  readonly orgId: string
  readonly id: string
  readonly actorId: string
  readonly actorEmail: string
  readonly action: string
  readonly resourceType: string
  readonly resourceId: string
  readonly detail: string
  readonly createdAt: string
}

export type TLogAuditInput = {
  readonly orgId: string
  readonly actorId: string
  readonly actorEmail: string
  readonly action: string
  readonly resourceType: string
  readonly resourceId: string
  readonly detail: string
}

const rowToEvent = (row: Record<string, unknown>): TAuditEvent => ({
  orgId: row.org_id as string,
  id: String(row.id),
  actorId: row.actor_id as string,
  actorEmail: row.actor_email as string,
  action: row.action as string,
  resourceType: row.resource_type as string,
  resourceId: row.resource_id as string,
  detail: (row.detail as string | null) ?? "",
  createdAt: (row.created_at as Date).toISOString(),
})

export const createAuditRepo = (client: Client) => ({
  log: async (input: TLogAuditInput): Promise<void> => {
    const id = CassandraTypes.TimeUuid.now()
    const now = new Date()

    await client.execute(
      `INSERT INTO ${KEYSPACE}.audit_log
       (org_id, id, actor_id, actor_email, action, resource_type, resource_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orgId,
        id,
        input.actorId,
        input.actorEmail,
        input.action,
        input.resourceType,
        input.resourceId,
        input.detail,
        now,
      ],
      { prepare: true },
    )
  },

  list: async (orgId: string, { limit = 50 }: { limit?: number } = {}): Promise<ReadonlyArray<TAuditEvent>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.audit_log WHERE org_id = ? LIMIT ?`,
      [orgId, limit],
      { prepare: true },
    )

    return result.rows.map((row) => rowToEvent(row as Record<string, unknown>))
  },
})

export type TAuditRepo = ReturnType<typeof createAuditRepo>
