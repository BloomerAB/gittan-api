export const operation = {
  summary: "Create a policy",
  tags: ["Policies"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            description: { type: "string" },
            matchFiles: { type: "string" },
            matchTeam: { type: "string" },
            matchName: { type: "string" },
            steps: {
              type: "array",
              items: {
                type: "object",
                required: ["position", "name", "use"],
                properties: {
                  position: { type: "string", enum: ["before", "after"] },
                  name: { type: "string" },
                  use: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Policy created",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Policy" },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
