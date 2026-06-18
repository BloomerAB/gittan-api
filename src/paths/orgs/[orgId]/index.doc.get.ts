export const operation = {
  summary: "Get organization by ID",
  tags: ["Organizations"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "Organization details",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Org" },
        },
      },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
