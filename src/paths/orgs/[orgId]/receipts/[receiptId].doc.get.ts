export const operation = {
  summary: "Download receipt as PDF",
  tags: ["Usage & Billing"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "receiptId", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "Receipt PDF file",
      content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
    },
    404: { description: "Receipt not found" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
  },
}
