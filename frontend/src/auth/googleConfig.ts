// Real Google OAuth configuration. Only consumed when VITE_AUTH_MODE=google.
// With the demo defaults this is never instantiated.

/** OAuth 2.0 Web client ID from the Google Cloud console. */
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

/** Scopes requested at interactive login. */
export const googleScopes = 'openid email profile'
