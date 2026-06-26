export const operation = {
  summary: "Migrate a repository from GitHub",
  tags: ["Repositories"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["githubUrl", "githubToken", "teamId"],
          properties: {
            githubUrl: { type: "string", description: "GitHub repository URL (e.g. https://github.com/owner/repo)" },
            githubToken: { type: "string", description: "GitHub personal access token" },
            teamId: { type: "string" },
            private: { type: "boolean", default: true },
            gatedBranches: { type: "array", items: { type: "string" }, default: ["main"] },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Repository migrated successfully",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Repo" } } },
    },
    400: { description: "Invalid input" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    409: { description: "Repository already exists" },
  },
}
