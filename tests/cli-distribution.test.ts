import { describe, it, expect } from "vitest"
import { generateInstallScript } from "../src/cli/distribution.js"

describe("generateInstallScript", () => {
  it("produces a valid bash script with the given base URL", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("#!/bin/bash")
    expect(script).toContain("set -euo pipefail")
    expect(script).toContain("https://cli.gittan.eu")
  })

  it("includes platform detection for darwin and linux", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("Darwin")
    expect(script).toContain("Linux")
    expect(script).toContain("darwin")
    expect(script).toContain("linux")
  })

  it("includes architecture detection", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("x86_64")
    expect(script).toContain("arm64")
    expect(script).toContain("aarch64")
  })

  it("supports custom install directory via env var", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("GITTAN_INSTALL_DIR")
    expect(script).toContain("/usr/local/bin")
  })

  it("downloads from the correct URL pattern", () => {
    const script = generateInstallScript("https://custom.example.com")

    expect(script).toContain("https://custom.example.com")
    expect(script).toContain("/dl/")
    expect(script).toContain("gittan-${platform}.tar.gz")
  })

  it("supports pinning to a specific version", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("GITTAN_CLI_VERSION")
    expect(script).toContain("latest")
  })

  it("handles sudo for non-writable install dirs", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("sudo install")
    expect(script).toContain("! -w")
  })

  it("cleans up temp directory on exit", () => {
    const script = generateInstallScript("https://cli.gittan.eu")

    expect(script).toContain("mktemp -d")
    expect(script).toContain("trap")
    expect(script).toContain("rm -rf")
  })
})
