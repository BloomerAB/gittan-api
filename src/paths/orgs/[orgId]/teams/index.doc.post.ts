export const operation = {
  summary: "Create team in organization",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    {
      name: "orgId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["name", "displayName"],
          properties: {
            name: { type: "string", pattern: "^[a-z0-9-]+$", minLength: 1, maxLength: 64 },
            displayName: { type: "string", minLength: 1, maxLength: 128 },
            slackChannel: { type: "string" },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Team created",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Team" },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    409: { $ref: "#/components/responses/Conflict" },
  },
}
