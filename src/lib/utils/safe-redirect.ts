/**
 * Guards server-action redirect targets against open-redirect attacks.
 *
 * Only same-origin, absolute-path destinations are allowed (e.g. "/pengaturan").
 * Anything that could navigate off-site — absolute URLs, protocol-relative
 * "//evil.tld", backslash tricks, or control characters — is rejected and the
 * caller falls back to a known-safe internal path.
 */
export function isSafeInternalPath(target: unknown): target is string {
  if (typeof target !== "string") return false
  const value = target.trim()
  if (value === "") return false

  // Must be an absolute path rooted at the app origin.
  if (!value.startsWith("/")) return false

  // Reject protocol-relative ("//host") and backslash-normalised ("/\host") forms.
  if (value.startsWith("//") || value.startsWith("/\\")) return false

  // Reject control characters and whitespace that browsers may strip to smuggle
  // a scheme (e.g. "/\tjavascript:...").
  if (/[\u0000-\u001f\u007f]/.test(value)) return false

  // Reject anything that smells like an embedded scheme.
  if (/^\/[^/]*:/.test(value)) return false

  return true
}

/**
 * Returns `target` when it is a safe internal path, otherwise `fallback`.
 */
export function safeInternalPath(target: unknown, fallback: string): string {
  return isSafeInternalPath(target) ? target : fallback
}
