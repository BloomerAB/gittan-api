export const operation = {
  summary: "Create repository",
  tags: ["Repositories"],
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
          required: ["name", "teamId"],
          properties: {
            name: { type: "string", pattern: "^[a-z0-9-]+$" },
            teamId: { type: "string", format: "uuid" },
            description: { type: "string", maxLength: 256 },
            private: { type: "boolean", default: true },
            gatedBranches: { type: "array", items: { type: "string" }, default: ["main"] },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Repository created",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Repo" } } },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
