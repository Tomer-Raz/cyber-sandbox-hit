// Real Google OAuth configuration. Only consumed when VITE_AUTH_MODE=google.
// With the demo defaults this is never instantiated.

/**
 * OAuth 2.0 Web client ID from the Google Cloud console.
 *
 * The same value must be the audience the FastAPI backend checks when it
 * verifies incoming ID tokens, and the client's "Authorized JavaScript origins"
 * must list every origin the SPA is served from (Cloud Run URL, localhost).
 */
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
