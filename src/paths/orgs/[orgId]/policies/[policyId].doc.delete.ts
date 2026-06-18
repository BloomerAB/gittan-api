export const operation = {
  summary: "Delete a policy",
  tags: ["Policies"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "orgId", in: "path", required: true, schema: { type: "string" } },
    { name: "policyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
  ],
  responses: {
    204: { description: "Policy deleted" },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    403: { $ref: "#/components/responses/Forbidden" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
