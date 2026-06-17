export const operation = {
  summary: "List repository branches",
  tags: ["Code Proxy"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "owner", in: "path", required: true, schema: { type: "string" } },
    { name: "repo", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "List of branches",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
