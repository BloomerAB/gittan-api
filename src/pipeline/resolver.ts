import type { TOrgPolicy, TPipelineStep, TTeamTemplate } from "@gittan/types"

export type TResolvedStep = {
  readonly name: string
  readonly image?: string
  readonly use?: string
  readonly with?: Record<string, string>
  readonly run?: string
  readonly needs?: ReadonlyArray<string>
  readonly only?: string
  readonly cache?: ReadonlyArray<string>
  readonly artifacts?: ReadonlyArray<string>
  readonly secrets?: ReadonlyArray<string>
  readonly timeout: string
  readonly source: "repo" | "policy" | "template"
  readonly policyName?: string
}

export type TResolvedPipeline = {
  readonly steps: ReadonlyArray<TResolvedStep>
  readonly resolvedFrom: {
    readonly policies: ReadonlyArray<string>
    readonly template?: string
    readonly repoConfig: boolean
  }
}

export type TResolveInput = {
  readonly repoConfig?: {
    readonly steps: ReadonlyArray<TPipelineStep>
  }
  readonly policies: ReadonlyArray<TOrgPolicy>
  readonly template?: TTeamTemplate
  readonly repoFiles: ReadonlyArray<string>
  readonly teamName: string
  readonly repoName: string
  readonly repoTags: ReadonlyArray<string>
}

const matchesPolicy = (
  policy: TOrgPolicy,
  input: TResolveInput,
): boolean => {
  const { match } = policy

  if (match.files) {
    const hasMatch = match.files.some((f) => input.repoFiles.includes(f))
    if (!hasMatch) return false
  }

  if (match.team) {
    if (match.team !== input.teamName) return false
  }

  if (match.name) {
    const pattern = match.name.replace(/\*/g, ".*")
    const regex = new RegExp(`^${pattern}$`)
    if (!regex.test(input.repoName)) return false
  }

  if (match.tags) {
    const hasTag = match.tags.some((t) => input.repoTags.includes(t))
    if (!hasTag) return false
  }

  return true
}

const toResolvedStep = (
  step: TPipelineStep,
  source: TResolvedStep["source"],
  policyName?: string,
): TResolvedStep => ({
  name: step.name,
  image: step.image,
  use: step.use,
  with: step.with,
  run: step.run,
  needs: step.needs,
  only: step.only,
  cache: step.cache,
  artifacts: step.artifacts,
  secrets: step.secrets,
  timeout: step.timeout ?? "10m",
  source,
  policyName,
})

export const resolvePipeline = (input: TResolveInput): TResolvedPipeline => {
  const matchedPolicies = input.policies.filter(
    (p) => p.enabled && matchesPolicy(p, input),
  )

  const beforeSteps = matchedPolicies.flatMap((p) =>
    (p.inject.before ?? []).map((s) => toResolvedStep(s, "policy", p.name)),
  )

  const afterSteps = matchedPolicies.flatMap((p) =>
    (p.inject.after ?? []).map((s) => toResolvedStep(s, "policy", p.name)),
  )

  const hasRepoConfig = input.repoConfig !== undefined
  const baseSteps = hasRepoConfig
    ? input.repoConfig!.steps.map((s) => toResolvedStep(s, "repo"))
    : input.template?.steps
      ? input.template.steps.map((s) => toResolvedStep(s, "template"))
      : []

  return {
    steps: [...beforeSteps, ...baseSteps, ...afterSteps],
    resolvedFrom: {
      policies: matchedPolicies.map((p) => p.name),
      template: !hasRepoConfig && input.template ? input.template.name : undefined,
      repoConfig: hasRepoConfig,
    },
  }
}
