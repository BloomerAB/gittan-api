import type { TConfig } from "../config/index.js"

export type TForgejoRepo = {
  readonly id: number
  readonly name: string
  readonly fullName: string
  readonly cloneUrl: string
  readonly sshUrl: string
  readonly empty: boolean
  readonly defaultBranch: string
}

export type TCreateRepoInput = {
  readonly name: string
  readonly description?: string
  readonly private?: boolean
  readonly defaultBranch?: string
}

export type TForgejoOrg = {
  readonly id: number
  readonly name: string
}

export type TForgejoWebhook = {
  readonly id: number
  readonly url: string
  readonly active: boolean
  readonly events: ReadonlyArray<string>
}

type TForgejoRepoRaw = {
  readonly id: number
  readonly name: string
  readonly full_name: string
  readonly clone_url: string
  readonly ssh_url: string
  readonly empty: boolean
  readonly default_branch: string
  readonly size: number
}

const mapRepo = (raw: TForgejoRepoRaw): TForgejoRepo => ({
  id: raw.id,
  name: raw.name,
  fullName: raw.full_name,
  cloneUrl: raw.clone_url,
  sshUrl: raw.ssh_url,
  empty: raw.empty,
  defaultBranch: raw.default_branch,
})

export const createForgejoClient = (config: TConfig) => {
  const baseUrl = config.forgejoUrl
  const token = config.forgejoAdminToken

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(
        `Forgejo API ${method} ${path} failed (${res.status}): ${text}`,
      )
    }

    if (res.status === 204) return undefined as T

    return (await res.json()) as T
  }

  return {
    createOrg: async (name: string): Promise<TForgejoOrg> => {
      const raw = await request<{ id: number; username: string }>("POST", "/orgs", {
        username: name,
        visibility: "private",
      })
      return { id: raw.id, name: raw.username }
    },

    getOrg: async (name: string): Promise<TForgejoOrg | undefined> => {
      try {
        const raw = await request<{ id: number; username: string }>("GET", `/orgs/${name}`)
        return { id: raw.id, name: raw.username }
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          return undefined
        }
        throw err
      }
    },

    createRepo: async (
      orgName: string,
      input: TCreateRepoInput,
    ): Promise<TForgejoRepo> => {
      const raw = await request<TForgejoRepoRaw>("POST", `/orgs/${orgName}/repos`, {
        name: input.name,
        description: input.description ?? "",
        private: input.private ?? true,
        default_branch: input.defaultBranch ?? "main",
        auto_init: true,
      })
      return mapRepo(raw)
    },

    getRepo: async (
      orgName: string,
      repoName: string,
    ): Promise<TForgejoRepo | undefined> => {
      try {
        const raw = await request<TForgejoRepoRaw>("GET", `/repos/${orgName}/${repoName}`)
        return mapRepo(raw)
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          return undefined
        }
        throw err
      }
    },

    listRepos: async (orgName: string): Promise<ReadonlyArray<TForgejoRepo>> => {
      const raw = await request<TForgejoRepoRaw[]>("GET", `/orgs/${orgName}/repos`)
      return raw.map(mapRepo)
    },

    deleteRepo: async (orgName: string, repoName: string): Promise<void> =>
      request("DELETE", `/repos/${orgName}/${repoName}`),

    createWebhook: async (
      orgName: string,
      repoName: string,
      webhookUrl: string,
      events: ReadonlyArray<string>,
    ): Promise<TForgejoWebhook> =>
      request("POST", `/repos/${orgName}/${repoName}/hooks`, {
        type: "gitea",
        config: {
          url: webhookUrl,
          content_type: "json",
        },
        events,
        active: true,
      }),

    listWebhooks: async (
      orgName: string,
      repoName: string,
    ): Promise<ReadonlyArray<TForgejoWebhook>> =>
      request("GET", `/repos/${orgName}/${repoName}/hooks`),

    migrateRepo: async (input: {
      readonly orgName: string
      readonly repoName: string
      readonly cloneUrl: string
      readonly authToken: string
      readonly isPrivate: boolean
      readonly description?: string
    }): Promise<TForgejoRepo> => {
      const raw = await request<TForgejoRepoRaw>("POST", "/repos/migrate", {
        clone_addr: input.cloneUrl,
        auth_token: input.authToken,
        repo_name: input.repoName,
        repo_owner: input.orgName,
        service: "github",
        mirror: false,
        private: input.isPrivate,
        description: input.description ?? "",
      })
      return mapRepo(raw)
    },

    getOrgStorageBytes: async (orgName: string): Promise<number> => {
      const repos = await request<TForgejoRepoRaw[]>("GET", `/orgs/${orgName}/repos?limit=50`)
      const repoBytes = repos.reduce((sum, r) => sum + (r.size ?? 0) * 1024, 0)

      let packageBytes = 0
      try {
        const packages = await request<ReadonlyArray<{ size: number }>>("GET", `/orgs/${orgName}/packages?limit=50`)
        packageBytes = packages.reduce((sum, p) => sum + (p.size ?? 0), 0)
      } catch {
        // packages feature may be disabled
      }

      return repoBytes + packageBytes
    },

    getFileContent: async (
      orgName: string,
      repoName: string,
      filePath: string,
      ref = "main",
    ): Promise<string | undefined> => {
      try {
        const raw = await request<{ content: string; encoding: string }>(
          "GET",
          `/repos/${orgName}/${repoName}/contents/${filePath}?ref=${ref}`,
        )
        if (raw.encoding === "base64") {
          return Buffer.from(raw.content, "base64").toString("utf-8")
        }
        return raw.content
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) return undefined
        throw err
      }
    },

    listDirectory: async (
      orgName: string,
      repoName: string,
      dirPath: string,
      ref = "main",
    ): Promise<ReadonlyArray<{ name: string; type: string }>> => {
      try {
        return await request<ReadonlyArray<{ name: string; type: string }>>(
          "GET",
          `/repos/${orgName}/${repoName}/contents/${dirPath}?ref=${ref}`,
        )
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) return []
        throw err
      }
    },

    createFileCommit: async (
      orgName: string,
      repoName: string,
      filePath: string,
      content: string,
      message: string,
    ): Promise<void> => {
      const encoded = Buffer.from(content, "utf-8").toString("base64")
      await request("POST", `/repos/${orgName}/${repoName}/contents/${filePath}`, {
        content: encoded,
        message,
      })
    },

    updateFileCommit: async (
      orgName: string,
      repoName: string,
      filePath: string,
      content: string,
      sha: string,
      message: string,
    ): Promise<void> => {
      const encoded = Buffer.from(content, "utf-8").toString("base64")
      await request("PUT", `/repos/${orgName}/${repoName}/contents/${filePath}`, {
        content: encoded,
        sha,
        message,
      })
    },

    deleteFile: async (
      orgName: string,
      repoName: string,
      filePath: string,
      sha: string,
      message: string,
    ): Promise<void> => {
      await request("DELETE", `/repos/${orgName}/${repoName}/contents/${filePath}`, {
        sha,
        message,
      })
    },

    getFileSha: async (
      orgName: string,
      repoName: string,
      filePath: string,
    ): Promise<string | undefined> => {
      try {
        const raw = await request<{ sha: string }>(
          "GET",
          `/repos/${orgName}/${repoName}/contents/${filePath}`,
        )
        return raw.sha
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) return undefined
        throw err
      }
    },

    healthy: async (): Promise<boolean> => {
      try {
        await request("GET", "/version")
        return true
      } catch {
        return false
      }
    },
  }
}

export type TForgejoClient = ReturnType<typeof createForgejoClient>
