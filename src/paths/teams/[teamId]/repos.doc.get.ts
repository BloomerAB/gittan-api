export const operation = {
  summary: "List repositories for team",
  tags: ["Repositories"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    200: {
      description: "List of repositories",
      content: {
        "application/json": {
          schema: { type: "array", items: { $ref: "#/components/schemas/Repo" } },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
