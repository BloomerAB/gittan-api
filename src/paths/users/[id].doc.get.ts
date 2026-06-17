export const operation = {
  summary: "Get user by ID",
  tags: ["Users"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    200: { description: "User details" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
