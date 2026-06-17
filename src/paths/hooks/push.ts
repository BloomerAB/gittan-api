import type { Request, Response } from "express"
import { StringCodec } from "nats"
import { z } from "zod"

import { deps } from "../../deps.js"

const ForgejoCommitSchema = z.object({
  id: z.string(),
  message: z.string(),
  timestamp: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
  }),
})

const ForgejoPushEventSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  commits: z.array(ForgejoCommitSchema),
  pusher: z.object({
    login: z.string(),
  }),
  repository: z.object({
    name: z.string(),
    full_name: z.string(),
  }),
})

export const POST = async (req: Request, res: Response): Promise<void> => {
  const { nats, repoMetadata } = deps()
  const sc = StringCodec()

  const parsed = ForgejoPushEventSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid push event" })
    return
  }

  const event = parsed.data
  const branch = event.ref.replace("refs/heads/", "")

  const repoMeta = await repoMetadata.getByForgejoName(
    event.repository.full_name,
  )

  const pushEvent = {
    id: `push-${event.after.slice(0, 8)}-${Date.now()}`,
    orgId: repoMeta?.orgId ?? "unknown",
    teamId: repoMeta?.teamId ?? "unknown",
    repoId: repoMeta?.id ?? "unknown",
    repoName: event.repository.name,
    branch,
    commits: event.commits.map((c) => ({
      sha: c.id,
      message: c.message,
      author: c.author.name,
      timestamp: c.timestamp,
    })),
    pusher: event.pusher.login,
    timestamp: new Date().toISOString(),
    isGated: repoMeta?.gatedBranches.includes(branch) ?? false,
  }

  const subject = pushEvent.isGated
    ? "gittan.push.gated"
    : "gittan.push.standard"

  nats.publish(subject, sc.encode(JSON.stringify(pushEvent)))

  res.status(200).json({
    received: true,
    branch,
    gated: pushEvent.isGated,
    eventId: pushEvent.id,
  })
}
