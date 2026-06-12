import { describe, expect, it } from "vitest"

import {
  resolvePipeline,
  type TResolveInput,
} from "../src/pipeline/resolver.js"

const baseInput: TResolveInput = {
  repoConfig: {
    steps: [
      { name: "test", image: "node:22-slim", run: "npm test" },
      { name: "build", image: "node:22-slim", run: "npm run build", needs: ["test"] },
    ],
  },
  policies: [],
  template: undefined,
  repoFiles: ["package.json", "tsconfig.json"],
  teamName: "platform",
  repoName: "api-service",
  repoTags: [],
}

describe("resolvePipeline", () => {
  it("returns repo steps when no policies or template", () => {
    const result = resolvePipeline(baseInput)

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].name).toBe("test")
    expect(result.steps[0].source).toBe("repo")
    expect(result.steps[1].name).toBe("build")
    expect(result.steps[1].source).toBe("repo")
    expect(result.resolvedFrom.policies).toEqual([])
    expect(result.resolvedFrom.repoConfig).toBe(true)
  })

  it("injects policy steps before repo steps", () => {
    const result = resolvePipeline({
      ...baseInput,
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "security-baseline",
          match: { files: ["package.json"] },
          inject: {
            before: [{ name: "audit", use: "platform/npm-audit" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps[0].name).toBe("audit")
    expect(result.steps[0].source).toBe("policy")
    expect(result.steps[0].policyName).toBe("security-baseline")
    expect(result.steps[1].name).toBe("test")
    expect(result.steps[1].source).toBe("repo")
    expect(result.resolvedFrom.policies).toEqual(["security-baseline"])
  })

  it("injects policy steps after repo steps", () => {
    const result = resolvePipeline({
      ...baseInput,
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "security-scan",
          match: { files: ["package.json"] },
          inject: {
            after: [{ name: "trivy", use: "platform/trivy" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    const lastStep = result.steps[result.steps.length - 1]
    expect(lastStep.name).toBe("trivy")
    expect(lastStep.source).toBe("policy")
  })

  it("injects both before and after from same policy", () => {
    const result = resolvePipeline({
      ...baseInput,
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "full-security",
          match: { files: ["package.json"] },
          inject: {
            before: [{ name: "audit", use: "platform/audit" }],
            after: [{ name: "scan", use: "platform/scan" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps[0].name).toBe("audit")
    expect(result.steps[result.steps.length - 1].name).toBe("scan")
  })

  it("skips disabled policies", () => {
    const result = resolvePipeline({
      ...baseInput,
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "disabled-policy",
          match: { files: ["package.json"] },
          inject: {
            before: [{ name: "skip-me", use: "platform/skip" }],
          },
          enabled: false,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps.every((s) => s.name !== "skip-me")).toBe(true)
  })

  it("skips policies that don't match repo files", () => {
    const result = resolvePipeline({
      ...baseInput,
      repoFiles: ["go.mod"],
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "node-only",
          match: { files: ["package.json"] },
          inject: {
            before: [{ name: "npm-audit", use: "platform/npm-audit" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps.every((s) => s.name !== "npm-audit")).toBe(true)
    expect(result.resolvedFrom.policies).toEqual([])
  })

  it("matches policies by team name", () => {
    const result = resolvePipeline({
      ...baseInput,
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "platform-only",
          match: { team: "platform" },
          inject: {
            before: [{ name: "platform-check", use: "platform/check" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps[0].name).toBe("platform-check")
  })

  it("matches policies by repo name pattern", () => {
    const result = resolvePipeline({
      ...baseInput,
      repoName: "api-gateway",
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "api-policy",
          match: { name: "api-*" },
          inject: {
            after: [{ name: "api-check", use: "platform/api-check" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps.some((s) => s.name === "api-check")).toBe(true)
  })

  it("matches policies by tags", () => {
    const result = resolvePipeline({
      ...baseInput,
      repoTags: ["production", "critical"],
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "prod-policy",
          match: { tags: ["production"] },
          inject: {
            after: [{ name: "prod-check", use: "platform/prod" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps.some((s) => s.name === "prod-check")).toBe(true)
  })

  it("does not match when tags don't overlap", () => {
    const result = resolvePipeline({
      ...baseInput,
      repoTags: ["staging"],
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "prod-only",
          match: { tags: ["production"] },
          inject: {
            after: [{ name: "prod-check", use: "platform/prod" }],
          },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps.every((s) => s.name !== "prod-check")).toBe(true)
  })

  it("applies multiple matching policies in order", () => {
    const result = resolvePipeline({
      ...baseInput,
      policies: [
        {
          id: "p1",
          orgId: "org-1",
          name: "first-policy",
          match: { files: ["package.json"] },
          inject: { before: [{ name: "first", use: "p/first" }] },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
        {
          id: "p2",
          orgId: "org-1",
          name: "second-policy",
          match: { files: ["tsconfig.json"] },
          inject: { before: [{ name: "second", use: "p/second" }] },
          enabled: true,
          createdAt: "2026-06-12T10:00:00Z",
          updatedAt: "2026-06-12T10:00:00Z",
        },
      ],
    })

    expect(result.steps[0].name).toBe("first")
    expect(result.steps[1].name).toBe("second")
    expect(result.resolvedFrom.policies).toEqual(["first-policy", "second-policy"])
  })

  it("uses template steps as base when no repo config", () => {
    const result = resolvePipeline({
      ...baseInput,
      repoConfig: undefined,
      template: {
        id: "t1",
        teamId: "team-1",
        name: "node-api",
        steps: [
          { name: "lint", image: "node:22-slim", run: "npm run lint" },
          { name: "test", image: "node:22-slim", run: "npm test" },
        ],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      },
    })

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].name).toBe("lint")
    expect(result.steps[0].source).toBe("template")
    expect(result.resolvedFrom.template).toBe("node-api")
    expect(result.resolvedFrom.repoConfig).toBe(false)
  })

  it("repo config overrides template steps", () => {
    const result = resolvePipeline({
      ...baseInput,
      template: {
        id: "t1",
        teamId: "team-1",
        name: "node-api",
        steps: [
          { name: "template-lint", image: "node:22-slim", run: "npm run lint" },
        ],
        createdAt: "2026-06-12T10:00:00Z",
        updatedAt: "2026-06-12T10:00:00Z",
      },
    })

    expect(result.steps.every((s) => s.name !== "template-lint")).toBe(true)
    expect(result.steps[0].name).toBe("test")
    expect(result.resolvedFrom.repoConfig).toBe(true)
  })

  it("returns empty steps gracefully when nothing is configured", () => {
    const result = resolvePipeline({
      ...baseInput,
      repoConfig: undefined,
      template: undefined,
      policies: [],
    })

    expect(result.steps).toEqual([])
  })
})
