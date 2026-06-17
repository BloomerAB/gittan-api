export const operation = {
  summary: "Create a new organization",
  tags: ["Organizations"],
  security: [{ bearerToken: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["name", "displayName"],
          properties: {
            name: {
              type: "string",
              pattern: "^[a-z0-9-]+$",
              minLength: 1,
              maxLength: 64,
            },
            displayName: {
              type: "string",
              minLength: 1,
              maxLength: 128,
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      description: "Organization created",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Org" },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    409: {
      description: "Organization name already exists",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Error" },
        },
      },
    },
  },
}
