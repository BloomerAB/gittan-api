const GITTAN_IMAGES = "gittan/*"

export const isImageAllowed = (
  image: string,
  allowlist: ReadonlyArray<string>,
): boolean => {
  const patterns = [GITTAN_IMAGES, ...allowlist]

  return patterns.some((pattern) => matchPattern(pattern, image))
}

const matchPattern = (pattern: string, image: string): boolean => {
  if (pattern === image) return true

  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1)
    return image.startsWith(prefix)
  }

  if (pattern.endsWith(":*")) {
    const base = pattern.slice(0, -2)
    const imageBase = image.split(":")[0]
    return imageBase === base
  }

  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\//g, "\\/") + "$",
    )
    return regex.test(image)
  }

  return false
}

export const validatePipelineImages = (
  steps: ReadonlyArray<{ readonly name: string; readonly image?: string }>,
  allowlist: ReadonlyArray<string>,
): ReadonlyArray<{ step: string; image: string; reason: string }> => {
  const violations: Array<{ step: string; image: string; reason: string }> = []

  for (const step of steps) {
    if (!step.image) continue

    if (!isImageAllowed(step.image, allowlist)) {
      violations.push({
        step: step.name,
        image: step.image,
        reason: `Image "${step.image}" is not in the allowed list. Use gittan/* images or ask your org admin to allowlist it.`,
      })
    }
  }

  return violations
}
