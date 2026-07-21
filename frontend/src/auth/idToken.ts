/**
 * Google ID token (JWT) helpers.
 *
 * These decode the payload WITHOUT verifying the signature, which is fine here
 * because the result is only used to render a name and avatar. Every request
 * carries the raw token, and the FastAPI backend is what actually verifies the
 * signature, issuer and audience (= the OAuth client ID). Never trust anything
 * decoded here for an authorization decision.
 */

export interface GoogleIdTokenClaims {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  aud?: string
  iss?: string
  /** Expiry, seconds since epoch. */
  exp?: number
}

/** Decodes a JWT payload. Returns null if the token is malformed. */
export function decodeIdToken(token: string): GoogleIdTokenClaims | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null

    // base64url -> base64, then rebuild UTF-8 from the raw bytes so non-ASCII
    // names survive the round trip.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
    return JSON.parse(json) as GoogleIdTokenClaims
  } catch {
    return null
  }
}

/** Milliseconds until the token expires. 0 if already expired or unknown. */
export function millisUntilExpiry(claims: GoogleIdTokenClaims | null): number {
  if (!claims?.exp) return 0
  return Math.max(0, claims.exp * 1000 - Date.now())
}
