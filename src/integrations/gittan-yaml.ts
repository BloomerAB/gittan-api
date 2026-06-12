import { GittanYamlSchema, type TGittanYaml } from "@gittan/types"
import * as yaml from "yaml"

import type { TConfig } from "../config/index.js"

export type TGittanYamlLoader = {
  readonly load: (
    orgName: string,
    repoName: string,
    branch?: string,
  ) => Promise<TGittanYaml | undefined>
  readonly listRootFiles: (
    orgName: string,
    repoName: string,
    branch?: string,
  ) => Promise<ReadonlyArray<string>>
}

export const createGittanYamlLoader = (config: TConfig): TGittanYamlLoader => {
  const fetchFileContent = async (
    orgName: string,
    repoName: string,
    filePath: string,
    branch: string,
  ): Promise<string | undefined> => {
    try {
      const res = await fetch(
        `${config.forgejoUrl}/api/v1/repos/${orgName}/${repoName}/raw/${filePath}?ref=${branch}`,
        {
          headers: config.forgejoAdminToken
            ? { Authorization: `token ${config.forgejoAdminToken}` }
            : {},
        },
      )
      if (!res.ok) return undefined
      return await res.text()
    } catch {
      return undefined
    }
  }

  return {
    load: async (orgName, repoName, branch = "main") => {
      const content = await fetchFileContent(
        orgName,
        repoName,
        ".gittan.yaml",
        branch,
      )

      if (!content) return undefined

      try {
        const parsed = yaml.parse(content)
        const result = GittanYamlSchema.safeParse(parsed)

        if (!result.success) {
          console.error(
            `.gittan.yaml validation failed for ${orgName}/${repoName}:`,
            result.error.issues,
          )
          return undefined
        }

        return result.data
      } catch (err) {
        console.error(
          `.gittan.yaml parse failed for ${orgName}/${repoName}:`,
          err,
        )
        return undefined
      }
    },

    listRootFiles: async (orgName, repoName, branch = "main") => {
      try {
        const res = await fetch(
          `${config.forgejoUrl}/api/v1/repos/${orgName}/${repoName}/contents/?ref=${branch}`,
          {
            headers: config.forgejoAdminToken
              ? { Authorization: `token ${config.forgejoAdminToken}` }
              : {},
          },
        )

        if (!res.ok) return []

        const entries = (await res.json()) as ReadonlyArray<{
          name: string
          type: string
        }>
        return entries
          .filter((e) => e.type === "file")
          .map((e) => e.name)
      } catch {
        return []
      }
    },
  }
}
