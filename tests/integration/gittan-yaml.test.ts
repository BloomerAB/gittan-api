import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config/index.js"
import { createForgejoClient, type TForgejoClient } from "../../src/integrations/forgejo.js"
import { createGittanYamlLoader, type TGittanYamlLoader } from "../../src/integrations/gittan-yaml.js"

const TEST_ORG = "yaml-test-org"
const TEST_REPO = "yaml-test-repo"
const TOKEN = "ade423c36770237493edd2ff0eb7dd26ee909138"

describe("gittan yaml loader", () => {
  let forgejo: TForgejoClient
  let loader: TGittanYamlLoader

  beforeAll(async () => {
    const config = loadConfig()
    const configWithToken = { ...config, forgejoAdminToken: TOKEN }
    forgejo = createForgejoClient(configWithToken)
    loader = createGittanYamlLoader(configWithToken)

    let org = await forgejo.getOrg(TEST_ORG)
    if (!org) {
      org = await forgejo.createOrg(TEST_ORG)
    }

    let repo = await forgejo.getRepo(TEST_ORG, TEST_REPO)
    if (!repo) {
      repo = await forgejo.createRepo(TEST_ORG, {
        name: TEST_REPO,
        description: "YAML loader test",
      })
    }

    const gittanYaml = [
      "steps:",
      "  - name: lint",
      '    image: node:22-slim',
      '    run: npm run lint',
      "  - name: test",
      '    image: node:22-slim',
      '    run: npm test',
      "    needs: [lint]",
      "  - name: deploy",
      '    image: gittan/deploy:1',
      '    run: ./deploy.sh',
      "    needs: [test]",
      "    only: main",
      "    secrets: [DEPLOY_TOKEN]",
      "",
      "gated:",
      "  - main",
      "  - release/*",
      "",
      "depends:",
      "  - repo: shared-types",
      "    cascade: true",
      "",
      "notify:",
      "  onFailure:",
      "    - channel: team-slack",
      "      template: compact",
    ].join("\n")

    await createOrUpdateFile(
      configWithToken.forgejoUrl,
      TOKEN,
      TEST_ORG,
      TEST_REPO,
      ".gittan.yaml",
      gittanYaml,
    )
  })

  afterAll(async () => {
    try {
      await forgejo.deleteRepo(TEST_ORG, TEST_REPO)
    } catch {
      // ignore
    }
  })

  it("loads and parses .gittan.yaml from repo", async () => {
    const config = await loader.load(TEST_ORG, TEST_REPO)
    expect(config).toBeDefined()
    expect(config!.steps).toHaveLength(3)
    expect(config!.steps[0].name).toBe("lint")
    expect(config!.steps[2].name).toBe("deploy")
  })

  it("parses gated branches", async () => {
    const config = await loader.load(TEST_ORG, TEST_REPO)
    expect(config!.gated).toEqual(["main", "release/*"])
  })

  it("parses dependencies", async () => {
    const config = await loader.load(TEST_ORG, TEST_REPO)
    expect(config!.depends).toHaveLength(1)
    expect(config!.depends![0].repo).toBe("shared-types")
    expect(config!.depends![0].cascade).toBe(true)
  })

  it("parses notify config", async () => {
    const config = await loader.load(TEST_ORG, TEST_REPO)
    expect(config!.notify!.onFailure).toHaveLength(1)
    expect(config!.notify!.onFailure![0].channel).toBe("team-slack")
  })

  it("returns undefined for repo without .gittan.yaml", async () => {
    const config = await loader.load(TEST_ORG, "nonexistent-repo")
    expect(config).toBeUndefined()
  })

  it("lists root files in repo", async () => {
    const files = await loader.listRootFiles(TEST_ORG, TEST_REPO)
    expect(files).toContain(".gittan.yaml")
  })
})

async function createOrUpdateFile(
  forgejoUrl: string,
  token: string,
  org: string,
  repo: string,
  path: string,
  content: string,
): Promise<void> {
  const existing = await fetch(
    `${forgejoUrl}/api/v1/repos/${org}/${repo}/contents/${path}`,
    { headers: { Authorization: `token ${token}` } },
  )

  const body: Record<string, unknown> = {
    content: Buffer.from(content).toString("base64"),
    message: `update ${path}`,
  }

  if (existing.ok) {
    const data = await existing.json() as { sha: string }
    body.sha = data.sha

    await fetch(
      `${forgejoUrl}/api/v1/repos/${org}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )
  } else {
    await fetch(
      `${forgejoUrl}/api/v1/repos/${org}/${repo}/contents/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    )
  }
}
