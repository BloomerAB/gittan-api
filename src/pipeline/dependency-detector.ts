import type { TRepoMetadataRepo } from "../db/repo-metadata.js"

export type TDetectedDependency = {
  readonly packageName: string
  readonly sourceFile: string
  readonly matchedRepoId: string
  readonly matchedRepoName: string
  readonly confidence: "high" | "medium"
}

export type TPackageManifest = {
  readonly type: "npm" | "go" | "python"
  readonly file: string
  readonly dependencies: ReadonlyArray<string>
}

export const parsePackageJson = (content: string): TPackageManifest | undefined => {
  try {
    const pkg = JSON.parse(content)
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]
    return { type: "npm", file: "package.json", dependencies: deps }
  } catch {
    return undefined
  }
}

export const parseGoMod = (content: string): TPackageManifest | undefined => {
  const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/g)
  const singleRequires = content.match(/^require\s+\S+/gm)

  const deps: string[] = []

  if (requireBlock) {
    for (const block of requireBlock) {
      const lines = block.split("\n").slice(1, -1)
      for (const line of lines) {
        const match = line.trim().match(/^(\S+)/)
        if (match && !match[1].startsWith("//")) {
          deps.push(match[1])
        }
      }
    }
  }

  if (singleRequires) {
    for (const line of singleRequires) {
      const match = line.match(/^require\s+(\S+)/)
      if (match) deps.push(match[1])
    }
  }

  if (deps.length === 0) return undefined

  return { type: "go", file: "go.mod", dependencies: deps }
}

export const parsePyprojectToml = (content: string): TPackageManifest | undefined => {
  const depsMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/m)
  if (!depsMatch) return undefined

  const deps = depsMatch[1]
    .split("\n")
    .map((line) => line.trim().replace(/^["']|["'],?$/g, ""))
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((dep) => dep.split(/[>=<~!;\[]/)[0].trim())
    .filter((dep) => dep.length > 0)

  return { type: "python", file: "pyproject.toml", dependencies: deps }
}

export type TDetectorDeps = {
  readonly repoMetadata: TRepoMetadataRepo
  readonly fetchFile: (
    orgName: string,
    repoName: string,
    filePath: string,
  ) => Promise<string | undefined>
  readonly listOrgRepos: () => Promise<
    ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly orgId: string
      readonly publishedPackages?: ReadonlyArray<string>
    }>
  >
}

export const detectDependencies = async (
  orgName: string,
  repoName: string,
  deps: TDetectorDeps,
): Promise<ReadonlyArray<TDetectedDependency>> => {
  const manifests: TPackageManifest[] = []

  const packageJson = await deps.fetchFile(orgName, repoName, "package.json")
  if (packageJson) {
    const parsed = parsePackageJson(packageJson)
    if (parsed) manifests.push(parsed)
  }

  const goMod = await deps.fetchFile(orgName, repoName, "go.mod")
  if (goMod) {
    const parsed = parseGoMod(goMod)
    if (parsed) manifests.push(parsed)
  }

  const pyproject = await deps.fetchFile(orgName, repoName, "pyproject.toml")
  if (pyproject) {
    const parsed = parsePyprojectToml(pyproject)
    if (parsed) manifests.push(parsed)
  }

  const orgRepos = await deps.listOrgRepos()
  const detected: TDetectedDependency[] = []

  for (const manifest of manifests) {
    for (const depName of manifest.dependencies) {
      for (const repo of orgRepos) {
        if (repo.name === repoName) continue

        const isMatch =
          depName === repo.name ||
          depName === `@${orgName}/${repo.name}` ||
          depName.endsWith(`/${repo.name}`) ||
          repo.publishedPackages?.includes(depName)

        if (isMatch) {
          const alreadyDetected = detected.some(
            (d) => d.matchedRepoId === repo.id && d.sourceFile === manifest.file,
          )
          if (!alreadyDetected) {
            detected.push({
              packageName: depName,
              sourceFile: manifest.file,
              matchedRepoId: repo.id,
              matchedRepoName: repo.name,
              confidence: repo.publishedPackages?.includes(depName)
                ? "high"
                : "medium",
            })
          }
        }
      }
    }
  }

  return detected
}
