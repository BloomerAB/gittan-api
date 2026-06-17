export const operation = {
  summary: "Get team by name",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "name", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "Team details",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Team" } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
