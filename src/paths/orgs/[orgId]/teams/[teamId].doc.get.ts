export const operation = {
  summary: "Get team by ID",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
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
