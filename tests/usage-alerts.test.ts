import { describe, it, expect, vi, beforeEach } from "vitest"
import { checkUsageAlerts } from "../src/lib/usage-alerts.js"

const mockAlertRepo = {
  hasBeenSent: vi.fn(),
  markSent: vi.fn(),
}

const mockEmail = {
  sendReceipt: vi.fn(),
  sendUsageWarning: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAlertRepo.hasBeenSent.mockResolvedValue(false)
  mockAlertRepo.markSent.mockResolvedValue(undefined)
  mockEmail.sendUsageWarning.mockResolvedValue(undefined)
})

const baseInput = {
  orgId: "org-1",
  orgName: "Test Org",
  plan: "starter" as const,
  spendingCapEur: 0,
  alertRepo: mockAlertRepo,
  email: mockEmail,
}

describe("checkUsageAlerts", () => {
  it("does nothing when no receipt email is configured", async () => {
    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: undefined,
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 1900, storageBytes: 0, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).not.toHaveBeenCalled()
  })

  it("sends 80% CI warning when threshold is crossed", async () => {
    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: "admin@test.com",
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 1700, storageBytes: 0, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).toHaveBeenCalledTimes(1)
    expect(mockEmail.sendUsageWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@test.com",
        threshold: 80,
        currentValue: 1700,
        limit: 2000,
      }),
    )
    expect(mockAlertRepo.markSent).toHaveBeenCalledWith("org-1", expect.any(String), "ci_minutes", 80)
  })

  it("sends both 80% and 95% CI warnings at 96%", async () => {
    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: "admin@test.com",
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 1920, storageBytes: 0, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).toHaveBeenCalledTimes(2)
    expect(mockEmail.sendUsageWarning).toHaveBeenCalledWith(expect.objectContaining({ threshold: 80 }))
    expect(mockEmail.sendUsageWarning).toHaveBeenCalledWith(expect.objectContaining({ threshold: 95 }))
  })

  it("does not re-send already sent alerts", async () => {
    mockAlertRepo.hasBeenSent.mockResolvedValue(true)

    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: "admin@test.com",
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 1920, storageBytes: 0, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).not.toHaveBeenCalled()
  })

  it("does not send when usage is below 80%", async () => {
    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: "admin@test.com",
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 1000, storageBytes: 0, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).not.toHaveBeenCalled()
  })

  it("sends storage warning at 80%", async () => {
    const storageBytes = 20 * 1024 * 1024 * 1024 * 0.85

    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: "admin@test.com",
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 0, storageBytes, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).toHaveBeenCalledTimes(1)
    expect(mockEmail.sendUsageWarning).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 80 }),
    )
    expect(mockAlertRepo.markSent).toHaveBeenCalledWith("org-1", expect.any(String), "storage", 80)
  })

  it("accounts for spending cap in limits", async () => {
    await checkUsageAlerts({
      ...baseInput,
      receiptEmail: "admin@test.com",
      spendingCapEur: 129,
      usage: { orgId: "org-1", month: "2026-06", ciMinutesUsed: 10000, storageBytes: 0, updatedAt: "" },
    })

    expect(mockEmail.sendUsageWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        threshold: 80,
        limit: 12000,
      }),
    )
  })
})
