export const operation = {
  summary: "List receipts for an organization",
  tags: ["Usage & Billing"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "List of receipts",
      content: { "application/json": { schema: { type: "array" } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
