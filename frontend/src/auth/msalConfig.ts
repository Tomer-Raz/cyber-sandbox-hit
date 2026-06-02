import type { Configuration, PopupRequest } from '@azure/msal-browser'

// Real Microsoft Entra ID configuration. Only consumed when
// VITE_AUTH_MODE=msal. With the demo defaults this is never instantiated.
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI,
    postLogoutRedirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
}

/** Scopes requested at interactive login. */
export const loginRequest: PopupRequest = {
  scopes: ['openid', 'profile', 'email', import.meta.env.VITE_API_SCOPE].filter(Boolean),
}
