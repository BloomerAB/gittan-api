import { describe, expect, it, vi } from "vitest"

import type { TStepRegistry } from "../src/db/step-registry.js"

const createMockRegistry = (): TStepRegistry => {
  const store = new Map<string, {
    org_id: string; name: string; image: string; run: string;
    defaults: string; cache: string[]; description: string;
    created_at: Date; updated_at: Date;
  }>()

  return {
    register: vi.fn().mockImplementation(async (input) => {
      const now = new Date().toISOString()
      const def = {
        orgId: input.orgId,
        name: input.name,
        image: input.image,
        run: input.run,
        defaults: input.defaults ?? {},
        cache: input.cache ?? [],
        description: input.description ?? "",
        createdAt: now,
        updatedAt: now,
      }
      store.set(`${input.orgId}:${input.name}`, {
        org_id: input.orgId,
        name: input.name,
        image: input.image,
        run: input.run,
        defaults: JSON.stringify(input.defaults ?? {}),
        cache: input.cache ?? [],
        description: input.description ?? "",
        created_at: new Date(),
        updated_at: new Date(),
      })
      return def
    }),
    get: vi.fn(),
    list: vi.fn(),
    resolve: vi.fn().mockImplementation(async (_orgId, useRef, withParams) => {
      const entry = store.get(`${_orgId}:${useRef}`)
      if (!entry) return undefined

      const defaults = JSON.parse(entry.defaults)
      const params = { ...defaults, ...withParams }

      let image = entry.image
      let run = entry.run
      for (const [key, value] of Object.entries(params)) {
        image = image.replaceAll(`\${${key}}`, value as string)
        run = run.replaceAll(`\${${key}}`, value as string)
      }

      return { image, run, cache: entry.cache }
    }),
  }
}

describe("step registry", () => {
  it("registers and resolves a step definition", async () => {
    const registry = createMockRegistry()

    await registry.register({
      orgId: "org-1",
      name: "node/test",
      image: "node:${node-version}-slim",
      run: "npm ci && npm test",
      defaults: { "node-version": "22" },
      cache: ["node_modules"],
      description: "Run Node.js tests",
    })

    const resolved = await registry.resolve("org-1", "node/test")
    expect(resolved).toBeDefined()
    expect(resolved!.image).toBe("node:22-slim")
    expect(resolved!.run).toBe("npm ci && npm test")
    expect(resolved!.cache).toEqual(["node_modules"])
  })

  it("overrides defaults with with-params", async () => {
    const registry = createMockRegistry()

    await registry.register({
      orgId: "org-1",
      name: "node/test",
      image: "node:${node-version}-slim",
      run: "npm test",
      defaults: { "node-version": "22" },
    })

    const resolved = await registry.resolve("org-1", "node/test", {
      "node-version": "20",
    })
    expect(resolved!.image).toBe("node:20-slim")
  })

  it("returns undefined for non-existent step", async () => {
    const registry = createMockRegistry()
    const resolved = await registry.resolve("org-1", "nonexistent")
    expect(resolved).toBeUndefined()
  })

  it("handles steps without template variables", async () => {
    const registry = createMockRegistry()

    await registry.register({
      orgId: "org-1",
      name: "platform/trivy",
      image: "aquasec/trivy:latest",
      run: "trivy fs --severity HIGH,CRITICAL .",
      description: "Security scan with Trivy",
    })

    const resolved = await registry.resolve("org-1", "platform/trivy")
    expect(resolved!.image).toBe("aquasec/trivy:latest")
    expect(resolved!.run).toBe("trivy fs --severity HIGH,CRITICAL .")
  })

  it("supports multiple template variables", async () => {
    const registry = createMockRegistry()

    await registry.register({
      orgId: "org-1",
      name: "docker/build",
      image: "docker:${docker-version}",
      run: "docker build -t ${registry}/${image-name}:${tag} .",
      defaults: {
        "docker-version": "27",
        registry: "ghcr.io",
        tag: "latest",
      },
    })

    const resolved = await registry.resolve("org-1", "docker/build", {
      "image-name": "api-service",
      tag: "v1.2.3",
    })

    expect(resolved!.image).toBe("docker:27")
    expect(resolved!.run).toBe(
      "docker build -t ghcr.io/api-service:v1.2.3 .",
    )
  })
})
