export const operation = {
  summary: "List organizations for the authenticated user",
  tags: ["User"],
  security: [{ bearerToken: [] }],
  responses: {
    200: {
      description: "List of organizations",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: { $ref: "#/components/schemas/Org" },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
  },
}
