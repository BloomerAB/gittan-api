export const operation = {
  summary: "Get organization usage",
  tags: ["Usage & Billing"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "month", in: "query", required: false, schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" } },
  ],
  responses: {
    200: {
      description: "Usage data for the specified month",
      content: { "application/json": { schema: { $ref: "#/components/schemas/OrgUsage" } } },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
