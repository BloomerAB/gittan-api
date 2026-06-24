export const operation = {
  summary: "List organization members",
  tags: ["Members"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "List of members with user details",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                userId: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
                role: { type: "string" },
                joinedAt: { type: "string" },
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
