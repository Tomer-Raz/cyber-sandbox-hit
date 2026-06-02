import axios, { AxiosError } from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

// Decoupled hooks so the client never imports the auth/UI stores directly
// (avoids circular deps). Providers register these on mount.
let tokenGetter: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function registerTokenGetter(fn: () => string | null) {
  tokenGetter = fn
}
export function registerUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export const http = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the bearer token to every outgoing request.
http.interceptors.request.use((config) => {
  const token = tokenGetter()
  if (token) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Normalise errors and react to auth failures.
http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ detail?: string; message?: string }>) => {
    if (error.response?.status === 401) onUnauthorized()
    const message =
      error.response?.data?.detail ??
      error.response?.data?.message ??
      error.message ??
      'Request failed'
    return Promise.reject(new Error(message))
  },
)
