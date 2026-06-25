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
          plan: { type: "string", enum: ["personal", "starter", "team"] },
          blocks: { type: "integer" },
          ciMinutesLimit: { type: "integer" },
          storageLimitGb: { type: "integer" },
          aiEnabled: { type: "boolean" },
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
        },
      },
      Org: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["owner", "member"] },
          plan: { type: "string", enum: ["starter", "team"] },
          oidcIssuer: { type: "string" },
          oidcClientId: { type: "string" },
          oidcClientSecret: { type: "string" },
          slackClientId: { type: "string" },
          slackClientSecret: { type: "string" },
          slackBotToken: { type: "string" },
          slackTeamName: { type: "string" },
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
      StepDefinition: {
        type: "object",
        properties: {
          orgId: { type: "string" },
          name: { type: "string" },
          image: { type: "string" },
          run: { type: "string" },
          defaults: { type: "object", additionalProperties: { type: "string" } },
          cache: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Policy: {
        type: "object",
        properties: {
          orgId: { type: "string" },
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: "string" },
          matchFiles: { type: "string" },
          matchTeam: { type: "string" },
          matchName: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                position: { type: "string", enum: ["before", "after"] },
                name: { type: "string" },
                use: { type: "string" },
              },
            },
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AuditEvent: {
        type: "object",
        properties: {
          orgId: { type: "string" },
          id: { type: "string" },
          actorId: { type: "string" },
          actorEmail: { type: "string" },
          action: { type: "string" },
          resourceType: { type: "string" },
          resourceId: { type: "string" },
          detail: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
}

export default apiDoc
