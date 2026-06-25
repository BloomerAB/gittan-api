import type { TConfig } from "../config/index.js"

export type TEmailClient = {
  readonly sendReceipt: (input: {
    readonly to: string
    readonly orgName: string
    readonly receiptId: string
    readonly amountEur: number
    readonly pdfBase64: string
  }) => Promise<void>
  readonly sendUsageWarning: (input: {
    readonly to: string
    readonly orgName: string
    readonly resource: string
    readonly currentValue: number
    readonly limit: number
    readonly plan: string
    readonly threshold: number
  }) => Promise<void>
}

export const createEmailClient = (config: TConfig): TEmailClient => {
  const emailApiUrl = config.emailApiUrl

  const post = async (path: string, body: unknown): Promise<void> => {
    if (!emailApiUrl) {
      console.log(`[email] skipped ${path} (no EMAIL_API_URL configured)`)
      return
    }

    const res = await fetch(`${emailApiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Email API ${path} failed (${res.status}): ${text}`)
    }
  }

  return {
    sendReceipt: async (input) => {
      await post("/send-invoice", {
        to: input.to,
        companyName: input.orgName,
        invoiceNumber: input.receiptId,
        amount: input.amountEur,
        currency: "EUR",
        pdfBase64: input.pdfBase64,
        senderDomain: "gittan.eu",
      })
    },

    sendUsageWarning: async (input) => {
      await post("/send-limit-alert", {
        to: input.to,
        adminName: input.orgName,
        companyName: input.orgName,
        currentCount: input.currentValue,
        limit: input.limit,
        plan: input.plan,
        attemptedCount: input.threshold,
        senderDomain: "gittan.eu",
      })
    },
  }
}
