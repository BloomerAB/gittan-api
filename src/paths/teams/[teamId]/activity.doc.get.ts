export const operation = {
  summary: "Get team repository activity",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    200: {
      description: "Repository activity with last commit info",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                repoId: { type: "string" },
                repoName: { type: "string" },
                lastCommit: {
                  type: "object",
                  properties: {
                    sha: { type: "string" },
                    message: { type: "string" },
                    author: { type: "string" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
