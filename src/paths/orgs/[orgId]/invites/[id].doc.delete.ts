export const operation = {
  summary: "Revoke an invite",
  tags: ["Invites"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "id", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    204: { description: "Invite revoked" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
