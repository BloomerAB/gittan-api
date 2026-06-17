export const operation = {
  summary: "Get organization plan",
  tags: ["Usage & Billing"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "Plan details with effective limits",
      content: { "application/json": { schema: { $ref: "#/components/schemas/OrgPlan" } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
