import { ErrorResponses } from "@bloomerab/npm-api-essentials"
import type { OpenAPIV3 } from "openapi-types"

const apiDoc: OpenAPIV3.Document = {
  openapi: "3.0.0",
  info: {
    title: "Gittan API",
    version: "1.0.0",
    description:
      "Team-centric Git hosting API. Manages organizations, teams, repositories, pipelines, and usage billing.",
  },
  servers: [
    { url: "http://localhost:4000", description: "Local development" },
  ],
  paths: {},
  components: {
    securitySchemes: {},
    responses: ErrorResponses as unknown as Record<
      string,
      OpenAPIV3.ResponseObject
    >,
    schemas: {
      Team: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string" },
          name: { type: "string" },
          displayName: { type: "string" },
          topology: {
            type: "string",
            enum: [
              "stream-aligned",
              "platform",
              "enabling",
              "complicated-subsystem",
            ],
          },
          slackChannel: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Repo: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orgId: { type: "string" },
          teamId: { type: "string", format: "uuid" },
          name: { type: "string" },
          forgejoFullName: { type: "string" },
          cloneUrl: { type: "string" },
          sshUrl: { type: "string" },
          gatedBranches: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      OrgPlan: {
        type: "object",
        properties: {
          orgId: { type: "string" },
          plan: { type: "string", enum: ["starter", "team"] },
          ciBlocks: { type: "integer" },
          ciMinutesLimit: { type: "integer" },
          storageLimitGb: { type: "integer" },
          userLimit: { type: "integer" },
          teamLimit: { type: "integer" },
          repoLimit: { type: "integer" },
        },
      },
      OrgUsage: {
        type: "object",
        properties: {
          orgId: { type: "string" },
          month: { type: "string" },
          ciMinutesUsed: { type: "integer" },
          ciMinutesLimit: { type: "integer" },
          storageBytes: { type: "integer" },
          userCount: { type: "integer" },
          teamCount: { type: "integer" },
          repoCount: { type: "integer" },
        },
      },
      Org: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["owner", "admin", "member"] },
          plan: { type: "string", enum: ["starter", "team"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
}

export default apiDoc
