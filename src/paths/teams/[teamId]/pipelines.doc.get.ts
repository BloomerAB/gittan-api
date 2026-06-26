export const operation = {
  summary: "List recent pipeline runs for a team",
  tags: ["Pipelines"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string" } },
    { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50, maximum: 200 } },
  ],
  responses: {
    200: {
      description: "List of pipeline run summaries",
      content: { "application/json": { schema: { type: "array", items: { type: "object" } } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
