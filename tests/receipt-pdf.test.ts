import { describe, it, expect } from "vitest"
import { generateReceiptPdf } from "../src/lib/receipt-pdf.js"
import type { TReceiptRow } from "../src/db/receipt-repo.js"

describe("generateReceiptPdf", () => {
  const receipt: TReceiptRow = {
    orgId: "org-1",
    id: "REC-2026-06-001",
    month: "2026-06",
    amountEur: 199,
    plan: "team",
    description: "Team plan — June 2026",
    items: [
      { label: "Team plan (monthly)", amount: 199 },
    ],
    createdAt: "2026-06-01T00:00:00.000Z",
  }

  it("returns a valid PDF buffer", async () => {
    const pdf = await generateReceiptPdf(receipt, "Bloomer AB")

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.length).toBeGreaterThan(0)
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
  })

  it("includes receipt with multiple items", async () => {
    const multiItemReceipt: TReceiptRow = {
      ...receipt,
      amountEur: 328,
      items: [
        { label: "Team plan (monthly)", amount: 199 },
        { label: "Spending cap — 1 block", amount: 129 },
      ],
    }

    const pdf = await generateReceiptPdf(multiItemReceipt, "Test Org")

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
  })
})
