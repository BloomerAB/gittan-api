export const operation = {
  summary: "Accept an invite",
  tags: ["Invites"],
  security: [{ bearerToken: [] }],
  parameters: [
    { name: "token", in: "path", required: true, schema: { type: "string" } },
  ],
  responses: {
    200: { description: "Invite accepted, user joined org" },
    404: { description: "Invite not found or expired" },
    409: { description: "Already a member" },
  },
}
