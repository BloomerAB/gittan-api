export const operation = {
  summary: "Get team DORA metrics",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    200: {
      description: "Team metrics including push frequency, lead time, and failure rates",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              teamId: { type: "string" },
              period: { type: "string" },
              pushFrequency: { type: "number" },
              avgPipelineLeadTimeMs: { type: "number" },
              pushRejectionRate: { type: "number" },
              avgRecoveryTimeMs: { type: "number" },
              totalPushes: { type: "integer" },
              successfulPushes: { type: "integer" },
              failedPushes: { type: "integer" },
              repos: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
