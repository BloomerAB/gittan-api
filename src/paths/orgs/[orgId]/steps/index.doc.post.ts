export const operation = {
  summary: "Register a step definition",
  tags: ["Steps"],
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
          required: ["name", "image", "run"],
          properties: {
            name: { type: "string", pattern: "^[a-z0-9-]+$", minLength: 1, maxLength: 64 },
            image: { type: "string", minLength: 1 },
            run: { type: "string", minLength: 1 },
            defaults: { type: "object", additionalProperties: { type: "string" } },
            cache: { type: "array", items: { type: "string" } },
            description: { type: "string" },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Step registered",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/StepDefinition" },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
