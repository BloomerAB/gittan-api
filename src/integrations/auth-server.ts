import { loadConfig } from "../config/index.js"

type TSyncOidcProviderParams = {
  readonly id: string
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly displayName: string
}

export const syncOidcProvider = async (params: TSyncOidcProviderParams): Promise<void> => {
  const config = loadConfig()
  const url = `${config.oauth2Issuer}/admin/upsert-provider`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: params.id,
      issuer: params.issuer,
      clientId: params.clientId,
      clientSecret: params.clientSecret,
      displayName: params.displayName,
      scopes: "openid email profile",
    }),
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error(`Failed to sync OIDC provider to auth-server: ${res.status} ${body}`)
  }
}
