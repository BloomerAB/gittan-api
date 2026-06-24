export const operation = {
  summary: "List pending invites",
  tags: ["Invites"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "List of pending invites",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                email: { type: "string" },
                role: { type: "string" },
                invitedBy: { type: "string" },
                createdAt: { type: "string" },
                expiresAt: { type: "string" },
              },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
