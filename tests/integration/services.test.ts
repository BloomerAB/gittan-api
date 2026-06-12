import { Client as ScyllaClient } from "cassandra-driver"
import { connect as natsConnect, type NatsConnection } from "nats"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

describe("infrastructure services", () => {
  let scylla: ScyllaClient
  let nats: NatsConnection

  beforeAll(async () => {
    scylla = new ScyllaClient({
      contactPoints: ["localhost:9043"],
      localDataCenter: "datacenter1",
    })

    nats = await natsConnect({ servers: "nats://localhost:4222" })
  })

  afterAll(async () => {
    await scylla?.shutdown()
    await nats?.drain()
  })

  describe("ScyllaDB", () => {
    it("connects and executes a query", async () => {
      const result = await scylla.execute("SELECT now() FROM system.local")
      expect(result.rows).toHaveLength(1)
    })

    it("can create and use the gittan keyspace", async () => {
      await scylla.execute(`
        CREATE KEYSPACE IF NOT EXISTS gittan
        WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
      `)

      const result = await scylla.execute(
        "SELECT keyspace_name FROM system_schema.keyspaces WHERE keyspace_name = 'gittan'",
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].keyspace_name).toBe("gittan")
    })
  })

  describe("NATS", () => {
    it("connects successfully", () => {
      expect(nats.isClosed()).toBe(false)
    })

    it("can publish and subscribe", async () => {
      const received: string[] = []
      const sub = nats.subscribe("test.gittan")

      const done = (async () => {
        for await (const msg of sub) {
          received.push(new TextDecoder().decode(msg.data))
          if (received.length === 1) {
            sub.unsubscribe()
          }
        }
      })()

      nats.publish("test.gittan", new TextEncoder().encode("hello gittan"))

      await done
      expect(received).toEqual(["hello gittan"])
    })
  })

  describe("Forgejo", () => {
    it("responds to version endpoint", async () => {
      const res = await fetch("http://localhost:3333/api/v1/version")
      expect(res.ok).toBe(true)

      const body = await res.json()
      expect(body).toHaveProperty("version")
    })
  })
})
