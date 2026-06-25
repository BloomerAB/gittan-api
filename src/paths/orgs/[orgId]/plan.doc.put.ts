export const operation = {
  summary: "Update organization plan",
  tags: ["Usage & Billing"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["plan"],
          properties: {
            plan: { type: "string", enum: ["starter", "team"] },
            spendingCapEur: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated plan",
      content: { "application/json": { schema: { $ref: "#/components/schemas/OrgPlan" } } },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
