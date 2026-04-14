export type ApiCategory = {
  id: number
  name: string
  description: string | null
}

export type ApiProduct = {
  id: number
  name: string
  description: string | null
  imageUrl: string | null
  price: number
  stockQuantity: number
  active: boolean
  category: ApiCategory
}

export type BasicAuthCredentials = {
  username: string
  password: string
}

export type ProductWriteRequest = {
  name: string
  description: string | null
  imageUrl: string | null
  price: number
  stockQuantity: number
  categoryId: number
  active: boolean
}

export type ProductQueryParams = {
  search?: string
  categoryId?: number
  active?: boolean
  cursor?: string | null
  snapshot?: string | null
  limit?: number
  sortBy?: 'NEWEST' | 'PRICE' | 'NAME'
  sortDirection?: 'ASC' | 'DESC'
}

export type ProductCountSummary = {
  total: number
  active: number
  inactive: number
  cacheKey: string
}

export type ApiProductsPage = {
  items: ApiProduct[]
  nextCursor: string | null
  snapshotToken: string
  snapshotVersion: string
  snapshotIssuedAtEpochMs: number
  snapshotExpiresAtEpochMs: number
  snapshotActive: boolean
  hasNext: boolean
  limit: number
  sortBy: 'NEWEST' | 'PRICE' | 'NAME'
  sortDirection: 'ASC' | 'DESC'
}

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

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '')

const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? '')
const productsEndpoint = `${apiBaseUrl}/api/products`
const productsCursorEndpoint = `${productsEndpoint}/cursor`
const categoriesEndpoint = `${apiBaseUrl}/api/categories`

const toNumber = (value: number | string): number =>
  typeof value === 'number' ? value : Number.parseFloat(value)

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

const mapProduct = (item: Omit<ApiProduct, 'price'> & { price: number | string }): ApiProduct => ({
  ...item,
  price: toNumber(item.price),
})

const getAuthHeader = (credentials: BasicAuthCredentials): string => {
  const raw = `${credentials.username}:${credentials.password}`
  return `Basic ${btoa(raw)}`
}

const buildQueryString = (params: ProductQueryParams): string => {
  const query = new URLSearchParams()

  if (params.search && params.search.trim() !== '') {
    query.set('search', params.search.trim())
  }

  if (typeof params.categoryId === 'number') {
    query.set('categoryId', String(params.categoryId))
  }

  if (typeof params.active === 'boolean') {
    query.set('active', String(params.active))
  }

  if (params.cursor && params.cursor.trim() !== '') {
    query.set('cursor', params.cursor)
  }

  if (params.snapshot && params.snapshot.trim() !== '') {
    query.set('snapshot', params.snapshot)
  }

  query.set('limit', String(params.limit ?? 8))
  query.set('sortBy', params.sortBy ?? 'NEWEST')
  query.set('sortDirection', params.sortDirection ?? 'DESC')

  return query.toString()
}

export const fetchProducts = async (params: ProductQueryParams): Promise<ApiProductsPage> => {
  const response = await fetch(`${productsCursorEndpoint}?${buildQueryString(params)}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  const payload = (await response.json()) as {
    items: Array<Omit<ApiProduct, 'price'> & { price: number | string }>
    nextCursor: string | null
    snapshotToken: string
    snapshotVersion: string
    snapshotIssuedAtEpochMs: number
    snapshotExpiresAtEpochMs: number
    snapshotActive: boolean
    hasNext: boolean
    limit: number
    sortBy: 'NEWEST' | 'PRICE' | 'NAME'
    sortDirection: 'ASC' | 'DESC'
  }

  return {
    items: payload.items.map(mapProduct),
    nextCursor: payload.nextCursor,
    snapshotToken: payload.snapshotToken,
    snapshotVersion: payload.snapshotVersion,
    snapshotIssuedAtEpochMs: payload.snapshotIssuedAtEpochMs,
    snapshotExpiresAtEpochMs: payload.snapshotExpiresAtEpochMs,
    snapshotActive: payload.snapshotActive,
    hasNext: payload.hasNext,
    limit: payload.limit,
    sortBy: payload.sortBy,
    sortDirection: payload.sortDirection,
  }
}

export const fetchProductCounts = async (params: {
  search?: string
  categoryId?: number
}): Promise<ProductCountSummary> => {
  const query = new URLSearchParams()

  if (params.search && params.search.trim() !== '') {
    query.set('search', params.search.trim())
  }

  if (typeof params.categoryId === 'number') {
    query.set('categoryId', String(params.categoryId))
  }

  const response = await fetch(`${productsEndpoint}/counts?${query.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  return (await response.json()) as ProductCountSummary
}

export const fetchCategories = async (): Promise<ApiCategory[]> => {
  const response = await fetch(categoriesEndpoint, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  return (await response.json()) as ApiCategory[]
}

export const createProduct = async (
  product: ProductWriteRequest,
  credentials: BasicAuthCredentials,
): Promise<ApiProduct> => {
  const response = await fetch(productsEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(credentials),
    },
    body: JSON.stringify(product),
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  const payload = (await response.json()) as Omit<ApiProduct, 'price'> & { price: number | string }

  return mapProduct(payload)
}

export const updateProduct = async (
  id: number,
  product: ProductWriteRequest,
  credentials: BasicAuthCredentials,
): Promise<ApiProduct> => {
  const response = await fetch(`${productsEndpoint}/${id}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(credentials),
    },
    body: JSON.stringify(product),
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  const payload = (await response.json()) as Omit<ApiProduct, 'price'> & { price: number | string }

  return mapProduct(payload)
}

export const deleteProduct = async (
  id: number,
  credentials: BasicAuthCredentials,
): Promise<void> => {
  const response = await fetch(`${productsEndpoint}/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: getAuthHeader(credentials),
    },
  })

  if (!response.ok) {
    throw await parseError(response)
  }
}
