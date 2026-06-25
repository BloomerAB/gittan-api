import type { Request, Response } from "express"

import { assertOrgAccess, param } from "../../../../auth/helpers.js"
import { deps } from "../../../../deps.js"
import { generateReceiptPdf } from "../../../../lib/receipt-pdf.js"

export const GET = async (req: Request, res: Response): Promise<void> => {
  if (!(await assertOrgAccess(req, res))) return

  const orgId = param(req, "orgId")
  const receiptId = param(req, "receiptId")

  const { receiptRepo, orgRepo } = deps()
  const receipt = await receiptRepo.getById(orgId, receiptId)

  if (!receipt) {
    res.status(404).json({ error: "Receipt not found" })
    return
  }

  const org = await orgRepo.getById(orgId)
  const orgName = org?.displayName ?? org?.name ?? orgId

  const pdf = await generateReceiptPdf(receipt, orgName)

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="gittan-receipt-${receipt.id}.pdf"`)
  res.send(pdf)
}
