export const operation = {
  summary: "Receive Forgejo push webhook",
  description: "Handles push events from Forgejo and publishes to NATS for pipeline processing.",
  tags: ["Webhooks"],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["ref", "before", "after", "commits", "pusher", "repository"],
          properties: {
            ref: { type: "string" },
            before: { type: "string" },
            after: { type: "string" },
            commits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  message: { type: "string" },
                  timestamp: { type: "string" },
                  author: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      email: { type: "string" },
                    },
                  },
                },
              },
            },
            pusher: {
              type: "object",
              properties: { login: { type: "string" } },
            },
            repository: {
              type: "object",
              properties: {
                name: { type: "string" },
                full_name: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Push event received",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              received: { type: "boolean" },
              branch: { type: "string" },
              gated: { type: "boolean" },
              eventId: { type: "string" },
            },
          },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
  },
}
