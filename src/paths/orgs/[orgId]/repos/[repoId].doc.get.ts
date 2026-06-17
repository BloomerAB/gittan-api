export const operation = {
  summary: "Get repository by ID",
  tags: ["Repositories"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "repoId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    200: {
      description: "Repository details",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Repo" } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
