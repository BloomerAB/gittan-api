import { z } from "zod"
import YAML from "yaml"

const parseYaml = (content: string): unknown => YAML.parse(content, { schema: "core" })

import type { TForgejoClient } from "../integrations/forgejo.js"
import type { TStepRegistry } from "../db/step-registry.js"
import type { TPolicyRepo } from "../db/policy-repo.js"

const CONFIG_REPO_SUFFIX = "-pipelines"

const StepFileSchema = z.object({
  image: z.string().min(1),
  run: z.string().min(1),
  description: z.string().optional().default(""),
  defaults: z.record(z.string()).optional().default({}),
  cache: z.array(z.string()).optional().default([]),
})

const PolicyMatchSchema = z.object({
  files: z.array(z.string()).optional(),
  team: z.string().optional(),
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).refine(
  d => d.files || d.team || d.name || d.tags,
  { message: "At least one match criterion required" },
)

const PolicyInjectStepSchema = z.object({
  name: z.string().min(1),
  image: z.string().optional(),
  use: z.string().optional(),
  with: z.record(z.string()).optional(),
  run: z.string().optional(),
  timeout: z.string().optional(),
})

const PolicyFileSchema = z.object({
  description: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
  match: PolicyMatchSchema,
  inject: z.object({
    before: z.array(PolicyInjectStepSchema).optional().default([]),
    after: z.array(PolicyInjectStepSchema).optional().default([]),
  }),
})

export type TConfigRepoResult = {
  readonly steps: { readonly synced: number; readonly errors: ReadonlyArray<string> }
  readonly policies: { readonly synced: number; readonly errors: ReadonlyArray<string> }
}

export const isConfigRepo = (repoName: string): boolean =>
  repoName === `org${CONFIG_REPO_SUFFIX}`

export const configRepoName = (scope: "org" | "team", name: string): string =>
  scope === "org" ? `org${CONFIG_REPO_SUFFIX}` : `${name}${CONFIG_REPO_SUFFIX}`

export const initConfigRepo = async (
  forgejo: TForgejoClient,
  orgId: string,
  stepRegistry: TStepRegistry,
  policyRepo: TPolicyRepo,
): Promise<void> => {
  const repoName = configRepoName("org", "")

  const existing = await forgejo.getRepo(orgId, repoName)
  if (existing) return

  await forgejo.createRepo(orgId, {
    name: repoName,
    description: "Pipeline configuration (steps & policies). Managed by gittan.",
    private: true,
    defaultBranch: "main",
  })

  const steps = await stepRegistry.list(orgId)
  for (const step of steps) {
    const yaml = YAML.stringify({
      image: step.image,
      run: step.run,
      description: step.description || undefined,
      defaults: Object.keys(step.defaults).length > 0 ? step.defaults : undefined,
      cache: step.cache.length > 0 ? [...step.cache] : undefined,
    })
    await forgejo.createFileCommit(
      orgId, repoName,
      `steps/${step.name}.yaml`,
      yaml,
      `seed step: ${step.name}`,
    )
  }

  const policies = await policyRepo.list(orgId)
  for (const policy of policies) {
    const matchObj: Record<string, unknown> = {}
    if (policy.matchFiles) matchObj.files = policy.matchFiles.split(",").map(s => s.trim())
    if (policy.matchTeam) matchObj.team = policy.matchTeam
    if (policy.matchName) matchObj.name = policy.matchName

    const yaml = YAML.stringify({
      description: policy.description || undefined,
      enabled: true,
      match: matchObj,
      inject: {
        before: policy.steps.filter(s => s.position === "before").map(s => ({
          name: s.name,
          use: s.use,
        })),
        after: policy.steps.filter(s => s.position === "after").map(s => ({
          name: s.name,
          use: s.use,
        })),
      },
    })
    await forgejo.createFileCommit(
      orgId, repoName,
      `policies/${policy.name}.yaml`,
      yaml,
      `seed policy: ${policy.name}`,
    )
  }
}

export const syncConfigRepo = async (
  forgejo: TForgejoClient,
  orgId: string,
  repoName: string,
  stepRegistry: TStepRegistry,
  policyRepo: TPolicyRepo,
): Promise<TConfigRepoResult> => {
  const stepErrors: string[] = []
  const policyErrors: string[] = []
  let stepsSynced = 0
  let policiesSynced = 0

  const stepFiles = await forgejo.listDirectory(orgId, repoName, "steps")
  const yamlStepFiles = stepFiles.filter(f => f.name.endsWith(".yaml") || f.name.endsWith(".yml"))

  const allStepFileNames = new Set(
    yamlStepFiles.map(f => f.name.replace(/\.(yaml|yml)$/, "")),
  )
  const VALID_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/

  for (const file of yamlStepFiles) {
    const stepName = file.name.replace(/\.(yaml|yml)$/, "")

    if (!VALID_NAME.test(stepName)) {
      stepErrors.push(`${file.name}: invalid step name "${stepName}"`)
      continue
    }

    try {
      const content = await forgejo.getFileContent(orgId, repoName, `steps/${file.name}`)
      if (!content) {
        stepErrors.push(`${file.name}: empty file`)
        continue
      }

      const parsed = parseYaml(content)
      const validated = StepFileSchema.parse(parsed)

      await stepRegistry.register({
        orgId,
        name: stepName,
        image: validated.image,
        run: validated.run,
        description: validated.description,
        defaults: validated.defaults,
        cache: validated.cache,
      })

      stepsSynced++
    } catch (err) {
      stepErrors.push(`${file.name}: ${err instanceof Error ? err.message : "parse error"}`)
    }
  }

  const existingSteps = await stepRegistry.list(orgId)
  for (const step of existingSteps) {
    if (!allStepFileNames.has(step.name)) {
      await stepRegistry.remove(orgId, step.name)
    }
  }

  const policyFiles = await forgejo.listDirectory(orgId, repoName, "policies")
  const yamlPolicyFiles = policyFiles.filter(f => f.name.endsWith(".yaml") || f.name.endsWith(".yml"))

  const allPolicyFileNames = new Set(
    yamlPolicyFiles.map(f => f.name.replace(/\.(yaml|yml)$/, "")),
  )

  const existingPoliciesForLookup = await policyRepo.list(orgId)
  const policyByName = new Map(existingPoliciesForLookup.map(p => [p.name, p]))

  for (const file of yamlPolicyFiles) {
    const policyName = file.name.replace(/\.(yaml|yml)$/, "")

    if (!VALID_NAME.test(policyName)) {
      policyErrors.push(`${file.name}: invalid policy name "${policyName}"`)
      continue
    }

    try {
      const content = await forgejo.getFileContent(orgId, repoName, `policies/${file.name}`)
      if (!content) {
        policyErrors.push(`${file.name}: empty file`)
        continue
      }

      const parsed = parseYaml(content)
      const validated = PolicyFileSchema.parse(parsed)

      const existing = policyByName.get(policyName)
      if (existing) {
        await policyRepo.remove(orgId, existing.id)
      }

      await policyRepo.create({
        orgId,
        name: policyName,
        description: validated.description,
        matchFiles: validated.match.files?.join(","),
        matchTeam: validated.match.team,
        matchName: validated.match.name,
        steps: [
          ...validated.inject.before.map(s => ({
            position: "before" as const,
            name: s.name,
            use: s.use ?? s.name,
          })),
          ...validated.inject.after.map(s => ({
            position: "after" as const,
            name: s.name,
            use: s.use ?? s.name,
          })),
        ],
      })

      policiesSynced++
    } catch (err) {
      policyErrors.push(`${file.name}: ${err instanceof Error ? err.message : "parse error"}`)
    }
  }

  const allPoliciesForDeletion = await policyRepo.list(orgId)
  for (const policy of allPoliciesForDeletion) {
    if (!allPolicyFileNames.has(policy.name)) {
      await policyRepo.remove(orgId, policy.id)
    }
  }

  return {
    steps: { synced: stepsSynced, errors: stepErrors },
    policies: { synced: policiesSynced, errors: policyErrors },
  }
}
