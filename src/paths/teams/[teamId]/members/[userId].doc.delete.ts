export const operation = {
  summary: "Remove member from team",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    { name: "userId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    204: { description: "Member removed" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
