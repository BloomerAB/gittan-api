import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { loadConfig } from "../src/config/index.js"

describe("loadConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.stubEnv("PORT", "")
    vi.stubEnv("HOST", "")
    vi.stubEnv("NODE_ENV", "")
    vi.stubEnv("SCYLLA_HOSTS", "")
    vi.stubEnv("SCYLLA_KEYSPACE", "")
    vi.stubEnv("NATS_URL", "")
    vi.stubEnv("FORGEJO_URL", "")
    vi.stubEnv("FORGEJO_ADMIN_TOKEN", "")
    vi.stubEnv("OAUTH2_ISSUER", "http://localhost:9000")
    vi.stubEnv("OAUTH2_CLIENT_ID", "gittan-api")
    vi.stubEnv("OAUTH2_CLIENT_SECRET", "test-secret-32-chars-minimum-ok")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns defaults when no env vars set", () => {
    const config = loadConfig()
    expect(config.port).toBe(4000)
    expect(config.host).toBe("0.0.0.0")
    expect(config.nodeEnv).toBe("development")
    expect(config.scyllaKeyspace).toBe("gittan")
    expect(config.natsUrl).toBe("nats://localhost:4222")
    expect(config.forgejoUrl).toBe("http://localhost:3333")
  })

  it("reads port from env", () => {
    vi.stubEnv("PORT", "5000")
    const config = loadConfig()
    expect(config.port).toBe(5000)
  })

  it("parses comma-separated scylla hosts", () => {
    vi.stubEnv("SCYLLA_HOSTS", "host1,host2,host3")
    const config = loadConfig()
    expect(config.scyllaHosts).toEqual(["host1", "host2", "host3"])
  })

  it("throws on invalid port", () => {
    vi.stubEnv("PORT", "99999")
    expect(() => loadConfig()).toThrow("Invalid configuration")
  })

  it("throws on invalid node env", () => {
    vi.stubEnv("NODE_ENV", "staging")
    expect(() => loadConfig()).toThrow("Invalid configuration")
  })

  it("throws on invalid forgejo URL", () => {
    vi.stubEnv("FORGEJO_URL", "not-a-url")
    expect(() => loadConfig()).toThrow("Invalid configuration")
  })
})
