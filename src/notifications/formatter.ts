export type TPipelineNotification = {
  readonly repoName: string
  readonly branch: string
  readonly commitSha: string
  readonly pusher: string
  readonly status: "passed" | "failed"
  readonly steps: ReadonlyArray<{
    readonly name: string
    readonly status: "passed" | "failed" | "skipped"
    readonly durationMs?: number
    readonly error?: string
    readonly source: "repo" | "policy" | "template"
  }>
  readonly durationMs: number
  readonly isCascade: boolean
  readonly sourceRepo?: string
  readonly pipelineUrl?: string
}

export type TReviewNotification = {
  readonly repoName: string
  readonly branch: string
  readonly commitSha: string
  readonly pusher: string
  readonly filesChanged: number
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly summary: string
  readonly suggestedReviewer?: string
  readonly suggestedReviewerReason?: string
  readonly reviewUrl?: string
}

export const formatFailureCompact = (n: TPipelineNotification): string => {
  const failedStep = n.steps.find((s) => s.status === "failed")
  const sha = n.commitSha.slice(0, 7)

  const lines = [`✗ ${n.repoName} / ${n.branch} @ ${sha} — ${failedStep?.name ?? "unknown"} failed`]

  if (failedStep?.error) {
    const errorLine = failedStep.error.split("\n")[0].slice(0, 120)
    lines.push(`  ↳ ${errorLine}`)
  }

  const ago = formatDuration(n.durationMs)
  const cascade = n.isCascade ? ` · cascade from ${n.sourceRepo}` : ""
  lines.push(`  ↳ ${ago} · pushed by ${n.pusher}${cascade}`)

  if (n.pipelineUrl) {
    lines.push(`  ↳ ${n.pipelineUrl}`)
  }

  return lines.join("\n")
}

export const formatFailureDetailed = (n: TPipelineNotification): string => {
  const sha = n.commitSha.slice(0, 7)
  const lines = [
    `✗ Pipeline failed: ${n.repoName} / ${n.branch} @ ${sha}`,
    "",
  ]

  for (const step of n.steps) {
    const icon = step.status === "passed" ? "✓" : step.status === "failed" ? "✗" : "⊘"
    const duration = step.durationMs ? ` ${formatDuration(step.durationMs)}` : ""
    const source = step.source !== "repo" ? ` (${step.source})` : ""
    lines.push(`  ${icon} ${step.name}${source}${duration}`)

    if (step.error) {
      for (const errorLine of step.error.split("\n").slice(0, 3)) {
        lines.push(`    ${errorLine.slice(0, 120)}`)
      }
    }
  }

  lines.push("")
  const cascade = n.isCascade ? ` · cascade from ${n.sourceRepo}` : ""
  lines.push(`Pushed by ${n.pusher}${cascade} · total ${formatDuration(n.durationMs)}`)

  return lines.join("\n")
}

export const formatReviewNeeded = (n: TReviewNotification): string => {
  const sha = n.commitSha.slice(0, 7)
  const lines = [
    `⟐ ${n.repoName} / ${n.branch} @ ${sha} — review needed`,
    `  ↳ ${n.filesChanged} files · +${n.linesAdded} -${n.linesRemoved} · "${n.summary}"`,
  ]

  if (n.suggestedReviewer) {
    lines.push(
      `  ↳ suggested: @${n.suggestedReviewer} (${n.suggestedReviewerReason ?? "recent changes"})`,
    )
  }

  if (n.reviewUrl) {
    lines.push(`  ↳ ${n.reviewUrl}`)
  }

  return lines.join("\n")
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
}
