import { describe, expect, it, vi } from "vitest"

import {
  detectDependencies,
  parseGoMod,
  parsePackageJson,
  parsePyprojectToml,
  type TDetectorDeps,
} from "../src/pipeline/dependency-detector.js"

describe("parsePackageJson", () => {
  it("extracts all dependency types", () => {
    const result = parsePackageJson(
      JSON.stringify({
        dependencies: { express: "^5.0.0", zod: "^3.25.0" },
        devDependencies: { vitest: "^3.2.0" },
        peerDependencies: { react: "^19.0.0" },
      }),
    )

    expect(result!.type).toBe("npm")
    expect(result!.dependencies).toEqual([
      "express",
      "zod",
      "vitest",
      "react",
    ])
  })

  it("handles empty dependencies", () => {
    const result = parsePackageJson(JSON.stringify({ name: "test" }))
    expect(result!.dependencies).toEqual([])
  })

  it("returns undefined for invalid JSON", () => {
    expect(parsePackageJson("not json")).toBeUndefined()
  })
})

describe("parseGoMod", () => {
  it("extracts dependencies from require block", () => {
    const goMod = `
module github.com/bloomer/api

go 1.22

require (
    github.com/bloomer/types v0.1.0
    github.com/gin-gonic/gin v1.10.0
    github.com/scylladb/gocqlx/v2 v2.8.0
)
`
    const result = parseGoMod(goMod)
    expect(result!.type).toBe("go")
    expect(result!.dependencies).toContain("github.com/bloomer/types")
    expect(result!.dependencies).toContain("github.com/gin-gonic/gin")
  })

  it("handles single-line require", () => {
    const goMod = `
module github.com/bloomer/api
require github.com/bloomer/types v0.1.0
`
    const result = parseGoMod(goMod)
    expect(result!.dependencies).toContain("github.com/bloomer/types")
  })

  it("returns undefined for empty go.mod", () => {
    expect(parseGoMod("module github.com/test\ngo 1.22\n")).toBeUndefined()
  })
})

describe("parsePyprojectToml", () => {
  it("extracts dependencies", () => {
    const toml = `
[project]
name = "home-watcher"
dependencies = [
    "httpx>=0.27.0",
    "pydantic>=2.0",
    "structlog",
]
`
    const result = parsePyprojectToml(toml)
    expect(result!.type).toBe("python")
    expect(result!.dependencies).toEqual(["httpx", "pydantic", "structlog"])
  })

  it("strips version specifiers", () => {
    const toml = `
[project]
dependencies = [
    "torch>=2.0,<3.0",
    "numpy~=1.24",
    "requests[security]>=2.28",
]
`
    const result = parsePyprojectToml(toml)
    expect(result!.dependencies).toEqual(["torch", "numpy", "requests"])
  })

  it("returns undefined when no dependencies", () => {
    expect(parsePyprojectToml("[project]\nname = 'test'\n")).toBeUndefined()
  })
})

describe("detectDependencies", () => {
  const orgRepos = [
    { id: "types-id", name: "shared-types", orgId: "bloomer" },
    { id: "utils-id", name: "shared-utils", orgId: "bloomer" },
    { id: "api-id", name: "api-service", orgId: "bloomer" },
  ]

  it("detects npm dependency matching repo name with org scope", async () => {
    const deps: TDetectorDeps = {
      repoMetadata: {} as any,
      fetchFile: vi.fn().mockImplementation(async (_org: string, _repo: string, path: string) => {
        if (path === "package.json") {
          return JSON.stringify({
            dependencies: { "@bloomer/shared-types": "^0.1.0", express: "^5.0.0" },
          })
        }
        return undefined
      }),
      listOrgRepos: vi.fn().mockResolvedValue(orgRepos),
    }

    const detected = await detectDependencies("bloomer", "api-service", deps)

    expect(detected).toHaveLength(1)
    expect(detected[0].packageName).toBe("@bloomer/shared-types")
    expect(detected[0].matchedRepoId).toBe("types-id")
    expect(detected[0].matchedRepoName).toBe("shared-types")
    expect(detected[0].confidence).toBe("medium")
  })

  it("detects dependency via published packages with high confidence", async () => {
    const reposWithPackages = [
      {
        id: "types-id",
        name: "shared-types",
        orgId: "bloomer",
        publishedPackages: ["@gittan/types"],
      },
    ]

    const deps: TDetectorDeps = {
      repoMetadata: {} as any,
      fetchFile: vi.fn().mockImplementation(async (_org: string, _repo: string, path: string) => {
        if (path === "package.json") {
          return JSON.stringify({
            dependencies: { "@gittan/types": "^0.1.0" },
          })
        }
        return undefined
      }),
      listOrgRepos: vi.fn().mockResolvedValue(reposWithPackages),
    }

    const detected = await detectDependencies("bloomer", "api-service", deps)

    expect(detected).toHaveLength(1)
    expect(detected[0].confidence).toBe("high")
  })

  it("does not detect self-dependency", async () => {
    const deps: TDetectorDeps = {
      repoMetadata: {} as any,
      fetchFile: vi.fn().mockImplementation(async (_org: string, _repo: string, path: string) => {
        if (path === "package.json") {
          return JSON.stringify({
            dependencies: { "@bloomer/api-service": "^1.0.0" },
          })
        }
        return undefined
      }),
      listOrgRepos: vi.fn().mockResolvedValue(orgRepos),
    }

    const detected = await detectDependencies("bloomer", "api-service", deps)
    expect(detected).toEqual([])
  })

  it("detects dependencies across multiple manifest types", async () => {
    const deps: TDetectorDeps = {
      repoMetadata: {} as any,
      fetchFile: vi.fn().mockImplementation(async (_org: string, _repo: string, path: string) => {
        if (path === "package.json") {
          return JSON.stringify({
            dependencies: { "@bloomer/shared-types": "^0.1.0" },
          })
        }
        if (path === "go.mod") {
          return `module github.com/bloomer/api\nrequire github.com/bloomer/shared-utils v0.1.0\n`
        }
        return undefined
      }),
      listOrgRepos: vi.fn().mockResolvedValue([
        ...orgRepos,
        { id: "utils-go-id", name: "shared-utils", orgId: "bloomer" },
      ]),
    }

    const detected = await detectDependencies("bloomer", "api-service", deps)
    expect(detected.length).toBeGreaterThanOrEqual(2)
  })

  it("returns empty when no manifest files found", async () => {
    const deps: TDetectorDeps = {
      repoMetadata: {} as any,
      fetchFile: vi.fn().mockResolvedValue(undefined),
      listOrgRepos: vi.fn().mockResolvedValue(orgRepos),
    }

    const detected = await detectDependencies("bloomer", "api-service", deps)
    expect(detected).toEqual([])
  })

  it("returns empty when no org repos match", async () => {
    const deps: TDetectorDeps = {
      repoMetadata: {} as any,
      fetchFile: vi.fn().mockImplementation(async (_org: string, _repo: string, path: string) => {
        if (path === "package.json") {
          return JSON.stringify({
            dependencies: { lodash: "^4.0.0", express: "^5.0.0" },
          })
        }
        return undefined
      }),
      listOrgRepos: vi.fn().mockResolvedValue(orgRepos),
    }

    const detected = await detectDependencies("bloomer", "api-service", deps)
    expect(detected).toEqual([])
  })
})
