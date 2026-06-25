import PDFDocument from "pdfkit"

import type { TReceiptRow } from "../db/receipt-repo.js"

export const generateReceiptPdf = (receipt: TReceiptRow, orgName: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    doc.fontSize(24).text("gittan", { align: "right" })
    doc.moveDown(0.5)
    doc.fontSize(10).fillColor("#666").text("gittan.eu", { align: "right" })
    doc.fillColor("#000")

    doc.moveDown(2)
    doc.fontSize(18).text("Receipt")
    doc.moveDown(0.5)

    doc.fontSize(10)
    doc.text(`Receipt #: ${receipt.id}`)
    doc.text(`Date: ${new Date(receipt.createdAt).toLocaleDateString("en-SE")}`)
    doc.text(`Period: ${receipt.month}`)
    doc.text(`Organization: ${orgName}`)
    doc.text(`Plan: ${receipt.plan}`)

    doc.moveDown(2)

    const tableTop = doc.y
    const col1 = 50
    const col2 = 400

    doc.fontSize(10).font("Helvetica-Bold")
    doc.text("Description", col1, tableTop)
    doc.text("Amount", col2, tableTop, { align: "right", width: 100 })

    doc.moveTo(col1, tableTop + 15).lineTo(col2 + 100, tableTop + 15).stroke("#ccc")

    doc.font("Helvetica")
    let y = tableTop + 25

    for (const item of receipt.items) {
      doc.text(item.label, col1, y)
      doc.text(`€${item.amount.toFixed(2)}`, col2, y, { align: "right", width: 100 })
      y += 20
    }

    doc.moveTo(col1, y + 5).lineTo(col2 + 100, y + 5).stroke("#ccc")
    y += 15

    doc.font("Helvetica-Bold")
    doc.text("Total", col1, y)
    doc.text(`€${receipt.amountEur.toFixed(2)}`, col2, y, { align: "right", width: 100 })

    doc.moveDown(4)
    doc.font("Helvetica").fontSize(8).fillColor("#999")
    doc.text("This is a receipt, not a VAT invoice. Bloomer AB, Sweden.", col1)

    doc.end()
  })
