// Cart API module — connects the frontend to the backend cart endpoints.

import { apiFetch } from './client'
import type { CartView } from '../types'

export const fetchCart = async (customerId: number): Promise<CartView> => {
  return apiFetch<CartView>(`/api/carts/${customerId}`)
}

export const addCartItem = async (
  customerId: number,
  productId: number,
  quantity: number,
): Promise<CartView> => {
  return apiFetch<CartView>(`/api/carts/${customerId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity }),
  })
}

export const removeCartItem = async (
  customerId: number,
  productId: number,
): Promise<CartView> => {
  return apiFetch<CartView>(`/api/carts/${customerId}/items/${productId}`, {
    method: 'DELETE',
  })
}

export const clearCart = async (customerId: number): Promise<void> => {
  return apiFetch<void>(`/api/carts/${customerId}`, {
    method: 'DELETE',
  })
}
