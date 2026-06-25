export const getQuotaStatus = (used: number, limit: number): "ok" | "warning" | "critical" | "blocked" => {
  if (limit === 0) return "ok"
  const ratio = used / limit
  if (ratio >= 1) return "blocked"
  if (ratio >= 0.95) return "critical"
  if (ratio >= 0.80) return "warning"
  return "ok"
}
