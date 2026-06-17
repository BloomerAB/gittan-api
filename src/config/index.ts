import { z } from "zod"

const ConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(4000),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  scyllaHosts: z
    .string()
    .transform((s) => s.split(","))
    .default("localhost:9043"),
  scyllaKeyspace: z.string().default("gittan"),

  natsUrl: z.string().default("nats://localhost:4222"),

  forgejoUrl: z.string().url().default("http://localhost:3333"),
  forgejoAdminToken: z.string().min(1).optional(),

  oauth2Issuer: z.string().url(),
  oauth2ClientId: z.string().min(1),
  oauth2ClientSecret: z.string().min(1),
})

export type TConfig = z.infer<typeof ConfigSchema>

const env = (key: string): string | undefined => {
  const value = process.env[key]
  return value === "" || value === undefined ? undefined : value
}

export const loadConfig = (): TConfig => {
  const result = ConfigSchema.safeParse({
    port: env("PORT"),
    host: env("HOST"),
    nodeEnv: env("NODE_ENV"),
    scyllaHosts: env("SCYLLA_HOSTS"),
    scyllaKeyspace: env("SCYLLA_KEYSPACE"),
    natsUrl: env("NATS_URL"),
    forgejoUrl: env("FORGEJO_URL"),
    forgejoAdminToken: env("FORGEJO_ADMIN_TOKEN"),
    oauth2Issuer: env("OAUTH2_ISSUER"),
    oauth2ClientId: env("OAUTH2_CLIENT_ID"),
    oauth2ClientSecret: env("OAUTH2_CLIENT_SECRET"),
  })

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    throw new Error(`Invalid configuration:\n${errors}`)
  }

  return result.data
}
