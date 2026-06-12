import { describe, expect, it } from "vitest"

import { isImageAllowed, validatePipelineImages } from "../src/pipeline/image-allowlist.js"

describe("isImageAllowed", () => {
  it("allows gittan images by default", () => {
    expect(isImageAllowed("gittan/node:22", [])).toBe(true)
    expect(isImageAllowed("gittan/go:1.24", [])).toBe(true)
    expect(isImageAllowed("gittan/base:1", [])).toBe(true)
  })

  it("blocks non-gittan images with empty allowlist", () => {
    expect(isImageAllowed("ubuntu:24.04", [])).toBe(false)
    expect(isImageAllowed("node:22-slim", [])).toBe(false)
    expect(isImageAllowed("kalilinux/kali", [])).toBe(false)
  })

  it("allows explicitly allowlisted images", () => {
    const allowlist = ["aquasec/trivy:*", "hadolint/hadolint:*"]
    expect(isImageAllowed("aquasec/trivy:0.62", allowlist)).toBe(true)
    expect(isImageAllowed("hadolint/hadolint:2.12", allowlist)).toBe(true)
  })

  it("allows wildcard org patterns", () => {
    const allowlist = ["my-company/*"]
    expect(isImageAllowed("my-company/deploy:1", allowlist)).toBe(true)
    expect(isImageAllowed("my-company/scanner:latest", allowlist)).toBe(true)
    expect(isImageAllowed("other-company/tool:1", allowlist)).toBe(false)
  })

  it("allows exact image match", () => {
    const allowlist = ["nginx:1.27-alpine"]
    expect(isImageAllowed("nginx:1.27-alpine", allowlist)).toBe(true)
    expect(isImageAllowed("nginx:1.26-alpine", allowlist)).toBe(false)
  })
})

describe("validatePipelineImages", () => {
  it("returns no violations for gittan images", () => {
    const steps = [
      { name: "test", image: "gittan/node:22" },
      { name: "scan", image: "gittan/base:1" },
    ]
    expect(validatePipelineImages(steps, [])).toEqual([])
  })

  it("returns violations for blocked images", () => {
    const steps = [
      { name: "test", image: "gittan/node:22" },
      { name: "hack", image: "kalilinux/kali" },
    ]
    const violations = validatePipelineImages(steps, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].step).toBe("hack")
    expect(violations[0].image).toBe("kalilinux/kali")
  })

  it("skips steps without images", () => {
    const steps = [
      { name: "review" },
      { name: "test", image: "gittan/node:22" },
    ]
    expect(validatePipelineImages(steps, [])).toEqual([])
  })

  it("respects org allowlist", () => {
    const steps = [
      { name: "scan", image: "aquasec/trivy:0.62" },
    ]
    expect(validatePipelineImages(steps, ["aquasec/trivy:*"])).toEqual([])
    expect(validatePipelineImages(steps, [])).toHaveLength(1)
  })
})
