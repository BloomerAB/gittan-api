import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export const verifyPassword = (password: string, stored: string): boolean => {
  const [salt, hash] = stored.split(":")
  const hashBuffer = Buffer.from(hash, "hex")
  const derivedBuffer = scryptSync(password, salt, 64)
  return timingSafeEqual(hashBuffer, derivedBuffer)
}
