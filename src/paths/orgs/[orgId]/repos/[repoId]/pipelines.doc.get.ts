export const operation = {
  summary: "List pipeline runs for a repository",
  tags: ["Pipelines"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "repoId", in: "path", required: true, schema: { type: "string" } },
    { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, maximum: 100 } },
  ],
  responses: {
    200: {
      description: "List of pipeline runs",
      content: { "application/json": { schema: { type: "array", items: { type: "object" } } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
