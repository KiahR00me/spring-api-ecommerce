// Shared domain types used across the entire frontend application.

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
  createdAt?: string
  updatedAt?: string
}

export type BasicAuthCredentials = {
  username: string
  password: string
}

export type AuthLoginSession = {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  expiresAtEpochMs: number
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
  sortBy?: SortBy
  sortDirection?: SortDirection
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
  sortBy: SortBy
  sortDirection: SortDirection
}

export type SortBy = 'NEWEST' | 'PRICE' | 'NAME'
export type SortDirection = 'ASC' | 'DESC'

export type CartItemView = {
  id: number
  productId: number
  productName: string
  productImageUrl: string | null
  unitPrice: number
  quantity: number
  subtotal: number
}

export type CartView = {
  id: number
  customerId: number
  items: CartItemView[]
  totalItems: number
  totalPrice: number
  updatedAt: string
}

export type OrderItemView = {
  id: number
  productId: number
  productName: string
  quantity: number
  unitPrice: number
}

export type OrderView = {
  id: number
  customerId: number
  totalAmount: number
  status: string
  paymentStatus: string
  paymentMethod: string | null
  createdAt: string
  items: OrderItemView[]
}

export type ProductFormState = {
  name: string
  description: string
  imageUrl: string
  price: string
  stockQuantity: string
  categoryId: string
  active: boolean
}

export const emptyFormState: ProductFormState = {
  name: '',
  description: '',
  imageUrl: '',
  price: '',
  stockQuantity: '',
  categoryId: '',
  active: true,
}
