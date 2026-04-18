// Centralized API client with shared error handling and auth header injection.

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '')
const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? '')

type ApiErrorPayload = {
  status?: number
  error?: string
  message?: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const parseError = async (response: Response): Promise<ApiError> => {
  let payload: ApiErrorPayload | null = null
  let textMessage = ''

  try {
    payload = (await response.json()) as ApiErrorPayload
  } catch {
    payload = null
    try {
      textMessage = await response.text()
    } catch {
      textMessage = ''
    }
  }

  const message = (payload?.message ?? textMessage) || `Request failed with status ${response.status}`
  return new ApiError(message, response.status)
}

const AUTH_STORAGE_KEY = 'ecommerce_jwt'

export const storeToken = (token: string): void => {
  sessionStorage.setItem(AUTH_STORAGE_KEY, token)
}

export const getStoredToken = (): string | null => {
  return sessionStorage.getItem(AUTH_STORAGE_KEY)
}

export const clearStoredToken = (): void => {
  sessionStorage.removeItem(AUTH_STORAGE_KEY)
}

export const apiFetch = async <T>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean },
): Promise<T> => {
  const headers = new Headers(options?.headers)
  headers.set('Accept', 'application/json')

  if (!options?.skipAuth) {
    const token = getStoredToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  const contentType = response.headers.get('Content-Type')
  if (response.status === 204 || !contentType?.includes('application/json')) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const buildQueryString = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      query.set(key, String(value))
    }
  }
  return query.toString()
}

export { apiBaseUrl }
