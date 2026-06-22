export const operation = {
  summary: "Update organization settings",
  tags: ["Organizations"],
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
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 128 },
            oidcIssuer: { type: "string", format: "uri", nullable: true },
            oidcClientId: { type: "string", nullable: true },
            oidcClientSecret: { type: "string", nullable: true },
            slackClientId: { type: "string", nullable: true },
            slackClientSecret: { type: "string", nullable: true },
            slackBotToken: { type: "string", nullable: true },
            slackTeamName: { type: "string", nullable: true },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated organization",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Org" },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
