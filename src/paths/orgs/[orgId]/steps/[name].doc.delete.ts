export const operation = {
  summary: "Delete a step definition",
  tags: ["Steps"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "name", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    204: { description: "Step deleted" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
