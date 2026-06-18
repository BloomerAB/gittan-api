export const operation = {
  summary: "Add member to team",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["userId"],
          properties: {
            userId: { type: "string" },
          },
        },
      },
    },
  },
  responses: {
    201: { description: "Member added" },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
