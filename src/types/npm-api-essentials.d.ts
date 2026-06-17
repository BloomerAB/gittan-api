declare module "@bloomerab/npm-api-essentials" {
  import type { Application } from "express"
  import type { OpenAPIV3 } from "openapi-types"

  export function setupApp(params: {
    apiDoc: OpenAPIV3.Document
    operations?: Record<string, unknown>
    pathPrefix: string
    paths?: string
    corsString?: string
  }): Promise<Application>

  export const ErrorResponses: {
    NotAuthenticated: OpenAPIV3.ResponseObject
    Forbidden: OpenAPIV3.ResponseObject
    NotFound: OpenAPIV3.ResponseObject
    BadRequest: OpenAPIV3.ResponseObject
    InternalServerError: OpenAPIV3.ResponseObject
    Conflict: OpenAPIV3.ResponseObject
    MethodNotAllowed: OpenAPIV3.ResponseObject
  }
}
