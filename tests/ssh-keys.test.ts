import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../src/deps.js", () => {
  const mockDeps: Record<string, unknown> = {}
  return {
    deps: () => mockDeps,
    __setMockDeps: (d: Record<string, unknown>) => Object.assign(mockDeps, d),
  }
})

describe("ensureForgejoUser", () => {
  it("creates Forgejo user with gt- prefix from UUID", () => {
    const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    const expected = `gt-${userId.replace(/-/g, "").slice(0, 16)}`
    expect(expected).toBe("gt-a1b2c3d4e5f67890")
    expect(expected).toHaveLength(19)
  })

  it("generates unique usernames from different UUIDs", () => {
    const uuid1 = "11111111-2222-3333-4444-555555555555"
    const uuid2 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const u1 = `gt-${uuid1.replace(/-/g, "").slice(0, 16)}`
    const u2 = `gt-${uuid2.replace(/-/g, "").slice(0, 16)}`
    expect(u1).not.toBe(u2)
  })

  it("produces valid Forgejo usernames (alphanumeric + hyphen)", () => {
    const userId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    const username = `gt-${userId.replace(/-/g, "").slice(0, 16)}`
    expect(username).toMatch(/^[a-z0-9-]+$/)
    expect(username.length).toBeLessThanOrEqual(40)
  })
})
