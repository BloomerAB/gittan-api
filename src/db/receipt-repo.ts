import type { Client } from "cassandra-driver"

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

export const createReceiptRepo = (client: Client) => ({
  create: async (input: {
    readonly orgId: string
    readonly id: string
    readonly month: string
    readonly amountEur: number
    readonly plan: string
    readonly description: string
    readonly items: ReadonlyArray<TReceiptItem>
  }): Promise<TReceiptRow> => {
    const now = new Date().toISOString()

    await client.execute(
      `INSERT INTO ${KEYSPACE}.receipts (org_id, id, month, amount_eur, plan, description, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.orgId, input.id, input.month, input.amountEur, input.plan, input.description, JSON.stringify(input.items), now],
      { prepare: true },
    )

    return { ...input, createdAt: now }
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

const rowToReceipt = (row: Record<string, unknown>): TReceiptRow => ({
  orgId: row.org_id as string,
  id: row.id as string,
  month: row.month as string,
  amountEur: (row.amount_eur as number) ?? 0,
  plan: row.plan as string,
  description: row.description as string,
  items: JSON.parse((row.items as string) ?? "[]") as ReadonlyArray<TReceiptItem>,
  createdAt: (row.created_at as Date).toISOString(),
})

export type TReceiptRepo = ReturnType<typeof createReceiptRepo>
