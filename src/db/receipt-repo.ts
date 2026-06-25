import type { Client } from "cassandra-driver"
import { z } from "zod"

import { KEYSPACE } from "./schema.js"

export type TReceiptItem = {
  readonly label: string
  readonly amount: number
}

export type TReceiptRow = {
  readonly orgId: string
  readonly id: string
  readonly month: string
  readonly amountEur: number
  readonly plan: string
  readonly description: string
  readonly items: ReadonlyArray<TReceiptItem>
  readonly createdAt: string
}

const CreateReceiptSchema = z.object({
  orgId: z.string().min(1),
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amountEur: z.number().int().min(0),
  plan: z.enum(["personal", "starter", "team"]),
  description: z.string().min(1),
  items: z.array(z.object({ label: z.string(), amount: z.number() })).min(1),
})

export const createReceiptRepo = (client: Client) => ({
  create: async (input: z.infer<typeof CreateReceiptSchema>): Promise<TReceiptRow> => {
    const validated = CreateReceiptSchema.parse(input)
    const now = new Date().toISOString()

    await client.execute(
      `INSERT INTO ${KEYSPACE}.receipts (org_id, id, month, amount_eur, plan, description, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [validated.orgId, validated.id, validated.month, validated.amountEur, validated.plan, validated.description, JSON.stringify(validated.items), now],
      { prepare: true },
    )

    return { ...validated, createdAt: now }
  },

  list: async (orgId: string): Promise<ReadonlyArray<TReceiptRow>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.receipts WHERE org_id = ? LIMIT 50`,
      [orgId],
      { prepare: true },
    )

    return result.rows.map(rowToReceipt)
  },

  getById: async (orgId: string, id: string): Promise<TReceiptRow | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.receipts WHERE org_id = ? AND id = ?`,
      [orgId, id],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined
    return rowToReceipt(result.first())
  },
})

const parseItems = (raw: unknown): ReadonlyArray<TReceiptItem> => {
  try {
    const parsed = JSON.parse((raw as string) ?? "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const rowToReceipt = (row: Record<string, unknown>): TReceiptRow => ({
  orgId: row.org_id as string,
  id: row.id as string,
  month: row.month as string,
  amountEur: (row.amount_eur as number) ?? 0,
  plan: row.plan as string,
  description: row.description as string,
  items: parseItems(row.items),
  createdAt: (row.created_at as Date).toISOString(),
})

export type TReceiptRepo = ReturnType<typeof createReceiptRepo>
