export const operation = {
  summary: "Update team",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            displayName: { type: "string", minLength: 1, maxLength: 128 },
            slackChannel: { type: "string", nullable: true },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated team",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Team" },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
