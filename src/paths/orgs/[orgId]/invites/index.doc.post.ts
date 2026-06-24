export const operation = {
  summary: "Create an invite",
  tags: ["Invites"],
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
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["owner", "member"], default: "member" },
          },
        },
      },
    },
  },
  responses: {
    201: { description: "Invite created" },
    400: { description: "Invalid input" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
