export const operation = {
  summary: "Remove member from organization",
  tags: ["Members"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "userId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    204: { description: "Member removed" },
    400: { description: "Cannot remove owner" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { description: "Member not found" },
  },
}
