import type { Client } from "cassandra-driver"

import { KEYSPACE } from "./schema.js"

export type TStepDefinition = {
  readonly orgId: string
  readonly name: string
  readonly image: string
  readonly run: string
  readonly defaults: Record<string, string>
  readonly cache: ReadonlyArray<string>
  readonly description: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type TCreateStepInput = {
  readonly orgId: string
  readonly name: string
  readonly image: string
  readonly run: string
  readonly defaults?: Record<string, string>
  readonly cache?: ReadonlyArray<string>
  readonly description?: string
}

export const createStepRegistry = (client: Client) => ({
  register: async (input: TCreateStepInput): Promise<TStepDefinition> => {
    const now = new Date().toISOString()
    const defaults = input.defaults ?? {}
    const cache = input.cache ?? []
    const description = input.description ?? ""

    await client.execute(
      `INSERT INTO ${KEYSPACE}.step_definitions
       (org_id, name, image, run, defaults, cache, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.orgId, input.name, input.image, input.run,
       JSON.stringify(defaults), cache, description, now, now],
      { prepare: true },
    )

    return {
      orgId: input.orgId,
      name: input.name,
      image: input.image,
      run: input.run,
      defaults,
      cache,
      description,
      createdAt: now,
      updatedAt: now,
    }
  },

  get: async (orgId: string, name: string): Promise<TStepDefinition | undefined> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.step_definitions WHERE org_id = ? AND name = ?`,
      [orgId, name],
      { prepare: true },
    )

    if (result.rowLength === 0) return undefined

    const row = result.first()
    return {
      orgId: row.org_id,
      name: row.name,
      image: row.image,
      run: row.run,
      defaults: JSON.parse(row.defaults ?? "{}"),
      cache: row.cache ?? [],
      description: row.description ?? "",
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  },

  list: async (orgId: string): Promise<ReadonlyArray<TStepDefinition>> => {
    const result = await client.execute(
      `SELECT * FROM ${KEYSPACE}.step_definitions WHERE org_id = ?`,
      [orgId],
      { prepare: true },
    )

    return result.rows.map((row) => ({
      orgId: row.org_id,
      name: row.name,
      image: row.image,
      run: row.run,
      defaults: JSON.parse(row.defaults ?? "{}"),
      cache: row.cache ?? [],
      description: row.description ?? "",
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }))
  },

  remove: async (orgId: string, name: string): Promise<void> => {
    await client.execute(
      `DELETE FROM ${KEYSPACE}.step_definitions WHERE org_id = ? AND name = ?`,
      [orgId, name],
      { prepare: true },
    )
  },

  resolve: async (
    orgId: string,
    useRef: string,
    withParams?: Record<string, string>,
  ): Promise<{ image: string; run: string; cache: ReadonlyArray<string> } | undefined> => {
    const def = await client.execute(
      `SELECT * FROM ${KEYSPACE}.step_definitions WHERE org_id = ? AND name = ?`,
      [orgId, useRef],
      { prepare: true },
    )

    if (def.rowLength === 0) return undefined

    const row = def.first()
    const defaults = JSON.parse(row.defaults ?? "{}")
    const params = { ...defaults, ...withParams }

    let image = row.image as string
    let run = row.run as string

    for (const [key, value] of Object.entries(params)) {
      image = image.replaceAll(`\${${key}}`, String(value))
      run = run.replaceAll(`\${${key}}`, String(value))
    }

    return {
      image,
      run,
      cache: row.cache ?? [],
    }
  },
})

export type TStepRegistry = ReturnType<typeof createStepRegistry>
