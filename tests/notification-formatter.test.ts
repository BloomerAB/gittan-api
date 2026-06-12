import { describe, expect, it } from "vitest"

import {
  formatFailureCompact,
  formatFailureDetailed,
  formatReviewNeeded,
  type TPipelineNotification,
  type TReviewNotification,
} from "../src/notifications/formatter.js"

const baseNotification: TPipelineNotification = {
  repoName: "api-service",
  branch: "main",
  commitSha: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  pusher: "malin",
  status: "failed",
  steps: [
    { name: "lint", status: "passed", durationMs: 2000, source: "repo" },
    {
      name: "test",
      status: "failed",
      durationMs: 4000,
      error: "src/auth/validate.test.ts:42 — expected 401, got 500",
      source: "repo",
    },
    { name: "build", status: "skipped", source: "repo" },
    { name: "trivy", status: "skipped", source: "policy" },
  ],
  durationMs: 6000,
  isCascade: false,
}

describe("formatFailureCompact", () => {
  it("formats single-line failure with error", () => {
    const result = formatFailureCompact(baseNotification)

    expect(result).toContain("✗ api-service / main @ a1b2c3d")
    expect(result).toContain("test failed")
    expect(result).toContain("src/auth/validate.test.ts:42")
    expect(result).toContain("pushed by malin")
  })

  it("includes cascade source when present", () => {
    const result = formatFailureCompact({
      ...baseNotification,
      isCascade: true,
      sourceRepo: "shared-types",
    })

    expect(result).toContain("cascade from shared-types")
  })

  it("includes pipeline URL when present", () => {
    const result = formatFailureCompact({
      ...baseNotification,
      pipelineUrl: "https://gittan.eu/bloomer/api-service/pipeline/123",
    })

    expect(result).toContain("https://gittan.eu/bloomer/api-service/pipeline/123")
  })

  it("formats duration in seconds", () => {
    const result = formatFailureCompact(baseNotification)
    expect(result).toContain("6s")
  })

  it("formats duration in minutes", () => {
    const result = formatFailureCompact({
      ...baseNotification,
      durationMs: 125000,
    })
    expect(result).toContain("2m 5s")
  })
})

describe("formatFailureDetailed", () => {
  it("shows all steps with icons", () => {
    const result = formatFailureDetailed(baseNotification)

    expect(result).toContain("✓ lint")
    expect(result).toContain("✗ test")
    expect(result).toContain("⊘ build")
    expect(result).toContain("⊘ trivy (policy)")
  })

  it("includes error details for failed steps", () => {
    const result = formatFailureDetailed(baseNotification)
    expect(result).toContain("src/auth/validate.test.ts:42")
  })

  it("shows step source for non-repo steps", () => {
    const result = formatFailureDetailed(baseNotification)
    expect(result).toContain("(policy)")
  })
})

describe("formatReviewNeeded", () => {
  const reviewNotification: TReviewNotification = {
    repoName: "api-service",
    branch: "feat/new-auth",
    commitSha: "d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3",
    pusher: "erik",
    filesChanged: 4,
    linesAdded: 120,
    linesRemoved: 30,
    summary: "add JWT validation middleware",
    suggestedReviewer: "malin",
    suggestedReviewerReason: "83% of recent changes",
  }

  it("formats review request with stats", () => {
    const result = formatReviewNeeded(reviewNotification)

    expect(result).toContain("⟐ api-service / feat/new-auth @ d4e5f6g")
    expect(result).toContain("review needed")
    expect(result).toContain("4 files · +120 -30")
    expect(result).toContain("add JWT validation middleware")
  })

  it("includes suggested reviewer", () => {
    const result = formatReviewNeeded(reviewNotification)

    expect(result).toContain("@malin")
    expect(result).toContain("83% of recent changes")
  })

  it("works without suggested reviewer", () => {
    const result = formatReviewNeeded({
      ...reviewNotification,
      suggestedReviewer: undefined,
    })

    expect(result).not.toContain("suggested:")
    expect(result).toContain("review needed")
  })
})
