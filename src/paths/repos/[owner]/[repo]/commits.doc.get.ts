export const operation = {
  summary: "List repository commits",
  tags: ["Code Proxy"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "owner", in: "path", required: true, schema: { type: "string" } },
    { name: "repo", in: "path", required: true, schema: { type: "string" } },
    { name: "ref", in: "query", required: false, schema: { type: "string", default: "main" } },
    { name: "limit", in: "query", required: false, schema: { type: "string", default: "20" } },
  ],
  responses: {
    200: {
      description: "List of commits",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
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
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
