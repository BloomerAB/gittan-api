export const operation = {
  summary: "List team members",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "teamId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    200: {
      description: "List of team members",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                userId: { type: "string" },
                teamId: { type: "string" },
                role: { type: "string", enum: ["team-admin", "writer", "reader"] },
                addedBy: { type: "string" },
                addedAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
