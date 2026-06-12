import type { Router } from "express"

import type { TConfig } from "../config/index.js"

export const registerCodeProxyRoutes = (
  router: Router,
  config: TConfig,
): void => {
  const forgejoGet = async (path: string): Promise<Response> =>
    fetch(`${config.forgejoUrl}/api/v1${path}`, {
      headers: config.forgejoAdminToken
        ? { Authorization: `token ${config.forgejoAdminToken}` }
        : {},
    })

  const handleContents = async (
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
    res: import("express").Response,
  ) => {
    const forgejoRes = await forgejoGet(
      `/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
    )

    if (!forgejoRes.ok) {
      res.status(forgejoRes.status).json({ error: "Not found" })
      return
    }

    const data = await forgejoRes.json()
    res.json(data)
  }

  router.get("/repos/:owner/:repo/contents", async (req, res) => {
    const { owner, repo } = req.params
    const ref = (req.query.ref as string) ?? "main"
    await handleContents(owner, repo, "", ref, res)
  })

  router.get("/repos/:owner/:repo/contents/*path", async (req, res) => {
    const { owner, repo } = req.params
    const rawPath = req.params.path
    const filePath = Array.isArray(rawPath) ? rawPath.join("/") : (rawPath ?? "")
    const ref = (req.query.ref as string) ?? "main"
    await handleContents(owner, repo, filePath, ref, res)
  })

  router.get("/repos/:owner/:repo/branches", async (req, res) => {
    const { owner, repo } = req.params
    const forgejoRes = await forgejoGet(`/repos/${owner}/${repo}/branches`)

    if (!forgejoRes.ok) {
      res.status(forgejoRes.status).json({ error: "Failed to fetch branches" })
      return
    }

    const branches = (await forgejoRes.json()) as Array<{ name: string }>
    res.json(branches.map((b) => ({ name: b.name })))
  })

  router.get("/repos/:owner/:repo/commits", async (req, res) => {
    const { owner, repo } = req.params
    const ref = (req.query.ref as string) ?? "main"
    const limit = (req.query.limit as string) ?? "20"

    const forgejoRes = await forgejoGet(
      `/repos/${owner}/${repo}/commits?sha=${ref}&limit=${limit}`,
    )

    if (!forgejoRes.ok) {
      res.status(forgejoRes.status).json({ error: "Failed to fetch commits" })
      return
    }

    const commits = (await forgejoRes.json()) as Array<{
      sha: string
      commit: {
        message: string
        author: { name: string; date: string }
      }
    }>

    res.json(
      commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        timestamp: c.commit.author.date,
      })),
    )
  })
}
