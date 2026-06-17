export const operation = {
  summary: "Get user by email",
  tags: ["Users"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "email", in: "path", required: true, schema: { type: "string", format: "email" } },
  ],
  responses: {
    200: { description: "User details" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
