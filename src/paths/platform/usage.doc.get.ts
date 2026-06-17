export const operation = {
  summary: "Get platform-wide usage overview",
  description: "Platform admin only. Returns usage and billing summary across all organizations.",
  tags: ["Platform Admin"],
  security: [{ bearerToken: [] }],
  responses: {
    200: {
      description: "Platform usage summary with per-org breakdown",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              summary: {
                type: "object",
                properties: {
                  totalOrgs: { type: "integer" },
                  totalRevenue: { type: "number" },
                  totalCiMinutes: { type: "integer" },
                  blocked: { type: "integer" },
                  warning: { type: "integer" },
                },
              },
              orgs: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
