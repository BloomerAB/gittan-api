export const operation = {
  summary: "Create or get user",
  description: "Creates a new user or returns existing user if email already registered.",
  tags: ["Users"],
  security: [{ bearerToken: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["email", "name"],
          properties: {
            email: { type: "string", format: "email" },
            name: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
  },
  responses: {
    200: { description: "Existing user returned" },
    201: { description: "User created" },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
