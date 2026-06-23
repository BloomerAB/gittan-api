import type { OpenAPIV3 } from "openapi-types"

export const operation: OpenAPIV3.OperationObject = {
  summary: "Look up organization by name",
  tags: ["Organizations"],
  parameters: [
    { name: "name", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    "200": { description: "Organization found" },
    "404": { description: "Organization not found" },
  },
}
