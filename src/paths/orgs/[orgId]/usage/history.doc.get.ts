export const operation = {
  summary: "Get organization usage history",
  tags: ["Usage & Billing"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "months", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 24, default: 6 } },
  ],
  responses: {
    200: {
      description: "Monthly usage history",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/OrgUsage" },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
