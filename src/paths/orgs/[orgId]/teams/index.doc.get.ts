export const operation = {
  summary: "List teams in organization",
  tags: ["Teams"],
  security: [{ bearerToken: [] }],
  parameters: [
    {
      name: "orgId",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
  ],
  responses: {
    200: {
      description: "List of teams",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/Team" },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
