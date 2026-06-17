export const operation = {
  summary: "Get repository contents",
  description: "Proxies file/directory listing from Forgejo. Use the `path` query parameter for subdirectories.",
  tags: ["Code Proxy"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "owner", in: "path", required: true, schema: { type: "string" } },
    { name: "repo", in: "path", required: true, schema: { type: "string" } },
    { name: "path", in: "query", required: false, schema: { type: "string" }, description: "File or directory path within the repository" },
    { name: "ref", in: "query", required: false, schema: { type: "string", default: "main" } },
  ],
  responses: {
    200: {
      description: "File content or directory listing",
      content: { "application/json": { schema: { type: "object" } } },
    },
    401: { $ref: "#/components/responses/NotAuthenticated" },
    404: { $ref: "#/components/responses/NotFound" },
  },
}
