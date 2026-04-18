import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  createProduct,
  deleteProduct,
  fetchCategories,
  fetchProductCounts,
  fetchProducts,
  login,
  updateProduct,
  type AuthLoginSession,
  type ApiProductsPage,
  type ApiProduct,
  type BasicAuthCredentials,
  type ProductWriteRequest,
} from './api/productsApi'
import { classifySnapshotRecoveryError } from './utils/snapshotRecovery'
import './App.css'

const PAGE_SIZE_OPTIONS = [4, 8, 12]
const SORT_OPTIONS = [
  { value: 'NEWEST', label: 'Newest' },
  { value: 'PRICE', label: 'Price' },
  { value: 'NAME', label: 'Name' },
] as const

type SortBy = 'NEWEST' | 'PRICE' | 'NAME'
type SortDirection = 'ASC' | 'DESC'

type ProductFormState = {
  name: string
  description: string
  imageUrl: string
  price: string
  stockQuantity: string
  categoryId: string
  active: boolean
}

const emptyFormState: ProductFormState = {
  name: '',
  description: '',
  imageUrl: '',
  price: '',
  stockQuantity: '',
  categoryId: '',
  active: true,
}

const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const parsePortFromUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value)
    if (parsed.port && parsed.port.trim() !== '') {
      return parsed.port
    }

    if (parsed.protocol === 'http:') {
      return '80'
    }

    if (parsed.protocol === 'https:') {
      return '443'
    }

    return null
  } catch {
    return null
  }
}

type RuntimeBackendTarget = {
  label: string
  port: string | null
  targetUrl: string
}

const resolveRuntimeBackendTarget = (): RuntimeBackendTarget => {
  const directApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (directApiBaseUrl !== '') {
    return {
      label: `direct ${directApiBaseUrl}`,
      port: parsePortFromUrl(directApiBaseUrl),
      targetUrl: directApiBaseUrl,
    }
  }

  const proxiedBackendUrl = (import.meta.env.VITE_BACKEND_URL ?? '').trim()
  if (proxiedBackendUrl !== '') {
    return {
      label: `proxy ${proxiedBackendUrl}`,
      port: parsePortFromUrl(proxiedBackendUrl),
      targetUrl: proxiedBackendUrl,
    }
  }

  return {
    label: 'proxy http://localhost:8080 (config default)',
    port: '8080',
    targetUrl: 'http://localhost:8080',
  }
}

const writeTextToClipboard = async (value: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

function App() {
  const queryClient = useQueryClient()

  const runtimeBackendTarget = useMemo(() => resolveRuntimeBackendTarget(), [])
  const runtimeBadgeClassName =
    runtimeBackendTarget.port === '8081'
      ? 'runtime-target-badge port-8081'
      : runtimeBackendTarget.port === '8080'
        ? 'runtime-target-badge port-8080'
        : 'runtime-target-badge'

  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [pageSize, setPageSize] = useState(8)
  const [sortBy, setSortBy] = useState<SortBy>('NEWEST')
  const [sortDirection, setSortDirection] = useState<SortDirection>('DESC')
  const [cursorTrail, setCursorTrail] = useState<Array<string | null>>([null])
  const [cursorIndex, setCursorIndex] = useState(0)
  const [snapshotToken, setSnapshotToken] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [lastRecoveredSnapshotToken, setLastRecoveredSnapshotToken] = useState<string | null>(null)
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const normalizedSearchTerm = deferredSearchTerm.trim()
  const normalizedSearchKeyword = normalizedSearchTerm.toLowerCase()
  const isSearchSyncing = searchTerm.trim() !== normalizedSearchTerm

  const handleCopyRuntimeTarget = useCallback(async (): Promise<void> => {
    try {
      const copied = await writeTextToClipboard(runtimeBackendTarget.targetUrl)
      if (copied) {
        setToastMessage(`Copied API target URL: ${runtimeBackendTarget.targetUrl}`)
        return
      }
    } catch {
      // Ignore and fall through to shared fallback message.
    }

    setToastMessage('Could not copy target URL. Clipboard access may be blocked in this browser.')
  }, [runtimeBackendTarget.targetUrl])

  const [credentials, setCredentials] = useState<BasicAuthCredentials>({
    username: '',
    password: '',
  })
  const [authSession, setAuthSession] = useState<AuthLoginSession | null>(null)
  const [formState, setFormState] = useState<ProductFormState>(emptyFormState)
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const currentCursor = cursorTrail[cursorIndex] ?? null

  const resetCursorNavigation = useCallback((): void => {
    setCursorTrail([null])
    setCursorIndex(0)
    setSnapshotToken(null)
  }, [])

  const ensureAccessToken = useCallback(async (): Promise<string> => {
    const now = Date.now()
    if (authSession && authSession.expiresAtEpochMs > now + 10_000) {
      return authSession.accessToken
    }

    const username = credentials.username.trim()
    const password = credentials.password.trim()
    if (!username || !password) {
      throw new Error('Admin username and password are required for write operations.')
    }

    const nextSession = await login({ username, password })
    setAuthSession(nextSession)
    return nextSession.accessToken
  }, [authSession, credentials.password, credentials.username])

  const productsQueryKey = useMemo(
    () =>
      [
        'products',
        {
          search: normalizedSearchTerm,
          categoryId: categoryFilter === 'all' ? null : Number(categoryFilter),
          cursor: currentCursor,
          snapshot: snapshotToken,
          limit: pageSize,
          sortBy,
          sortDirection,
        },
      ] as const,
    [normalizedSearchTerm, categoryFilter, currentCursor, snapshotToken, pageSize, sortBy, sortDirection],
  )

  const {
    data: productsPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: productsQueryKey,
    queryFn: ({ queryKey }) => {
      const params = queryKey[1]
      return fetchProducts({
        search: params.search,
        categoryId: params.categoryId ?? undefined,
        cursor: params.cursor,
        snapshot: params.snapshot,
        limit: params.limit,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      })
    },
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  })

  const {
    data: categories,
    isLoading: isCategoriesLoading,
    isError: isCategoriesError,
    error: categoriesError,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 120_000,
  })

  const { data: productCounts } = useQuery({
    queryKey: [
      'product-counts',
      {
        search: normalizedSearchTerm,
        categoryId: categoryFilter === 'all' ? null : Number(categoryFilter),
      },
    ],
    queryFn: ({ queryKey }) => {
      const params = queryKey[1] as {
        search: string
        categoryId: number | null
      }

      return fetchProductCounts({
        search: params.search,
        categoryId: params.categoryId ?? undefined,
      })
    },
    staleTime: 120_000,
  })

  const effectiveCategoryId = formState.categoryId || String(categories?.[0]?.id ?? '')
  const categoryById = useMemo(() => {
    const next = new Map<number, { id: number; name: string; description: string | null }>()
    for (const category of categories ?? []) {
      next.set(category.id, category)
    }
    return next
  }, [categories])

  const products = productsPage?.items ?? []

  const compareProducts = (left: ApiProduct, right: ApiProduct): number => {
    const base = (() => {
      if (sortBy === 'PRICE') {
        return left.price - right.price
      }

      if (sortBy === 'NAME') {
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      }

      return left.id - right.id
    })()

    if (base !== 0) {
      return sortDirection === 'ASC' ? base : -base
    }

    return sortDirection === 'ASC' ? left.id - right.id : right.id - left.id
  }

  const matchesCurrentFilters = (product: ApiProduct): boolean => {
    if (categoryFilter !== 'all' && String(product.category.id) !== categoryFilter) {
      return false
    }

    if (normalizedSearchKeyword === '') {
      return true
    }

    const searchableText = `${product.name} ${product.description ?? ''} ${product.category.name}`
      .toLowerCase()

    return searchableText.includes(normalizedSearchKeyword)
  }

  const createProductMutation = useMutation({
    mutationFn: async (newProduct: ProductWriteRequest) => {
      const accessToken = await ensureAccessToken()
      return createProduct(newProduct, accessToken)
    },
    onMutate: async (newProduct: ProductWriteRequest) => {
      await queryClient.cancelQueries({ queryKey: ['products'] })

      const previousPage = queryClient.getQueryData<ApiProductsPage>(productsQueryKey)

      if (previousPage && cursorIndex === 0) {
        const category = categoryById.get(newProduct.categoryId) ?? {
          id: newProduct.categoryId,
          name: `Category #${newProduct.categoryId}`,
          description: null,
        }

        const optimisticProduct: ApiProduct = {
          id: -Date.now(),
          name: newProduct.name,
          description: newProduct.description,
          imageUrl: newProduct.imageUrl,
          price: newProduct.price,
          stockQuantity: newProduct.stockQuantity,
          active: newProduct.active,
          category,
        }

        if (matchesCurrentFilters(optimisticProduct)) {
          const nextItems = [...previousPage.items, optimisticProduct]
            .sort(compareProducts)
            .slice(0, pageSize)

          queryClient.setQueryData<ApiProductsPage>(productsQueryKey, {
            ...previousPage,
            items: nextItems,
            hasNext: previousPage.hasNext || previousPage.items.length >= pageSize,
          })
        }
      }

      return { previousPage }
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previousPage) {
        queryClient.setQueryData(productsQueryKey, context.previousPage)
      }
      if (mutationError instanceof ApiError && mutationError.status === 401) {
        setAuthSession(null)
      }
    },
    onSuccess: () => {
      setFormState((current) => ({
        ...emptyFormState,
        categoryId: current.categoryId,
      }))
      setFormError(null)
      resetCursorNavigation()
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['product-counts'] })
    },
  })

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, product }: { id: number; product: ProductWriteRequest }) => {
      const accessToken = await ensureAccessToken()
      return updateProduct(id, product, accessToken)
    },
    onMutate: async ({ id, product }: { id: number; product: ProductWriteRequest }) => {
      await queryClient.cancelQueries({ queryKey: ['products'] })

      const previousPage = queryClient.getQueryData<ApiProductsPage>(productsQueryKey)

      if (previousPage) {
        const nextItems = previousPage.items
          .flatMap((item) => {
            if (item.id !== id) {
              return [item]
            }

            const category = categoryById.get(product.categoryId) ?? {
              id: product.categoryId,
              name: `Category #${product.categoryId}`,
              description: null,
            }

            const optimisticProduct: ApiProduct = {
              ...item,
              name: product.name,
              description: product.description,
              imageUrl: product.imageUrl,
              price: product.price,
              stockQuantity: product.stockQuantity,
              active: product.active,
              category,
            }

            if (!matchesCurrentFilters(optimisticProduct)) {
              return []
            }

            return [optimisticProduct]
          })
          .sort(compareProducts)
          .slice(0, pageSize)

        queryClient.setQueryData<ApiProductsPage>(productsQueryKey, {
          ...previousPage,
          items: nextItems,
        })
      }

      return { previousPage }
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previousPage) {
        queryClient.setQueryData(productsQueryKey, context.previousPage)
      }
      if (mutationError instanceof ApiError && mutationError.status === 401) {
        setAuthSession(null)
      }
    },
    onSuccess: () => {
      setEditingProductId(null)
      setFormState((current) => ({
        ...emptyFormState,
        categoryId: current.categoryId,
      }))
      setFormError(null)
      resetCursorNavigation()
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['product-counts'] })
    },
  })

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      const accessToken = await ensureAccessToken()
      return deleteProduct(id, accessToken)
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['products'] })

      const previousPage = queryClient.getQueryData<ApiProductsPage>(productsQueryKey)

      if (previousPage) {
        queryClient.setQueryData<ApiProductsPage>(productsQueryKey, {
          ...previousPage,
          items: previousPage.items.filter((item) => item.id !== id),
        })
      }

      return { previousPage }
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previousPage) {
        queryClient.setQueryData(productsQueryKey, context.previousPage)
      }
      if (mutationError instanceof ApiError && mutationError.status === 401) {
        setAuthSession(null)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['product-counts'] })
      resetCursorNavigation()
    },
  })

  const productCountLabel = useMemo(() => {
    if (isSearchSyncing) {
      return 'Updating search results...'
    }

    if (!productsPage) {
      return 'Loading products...'
    }

    return `Cursor page ${cursorIndex + 1} • ${productsPage.items.length} item(s) • sorted by ${sortBy.toLowerCase()}`
  }, [productsPage, cursorIndex, sortBy, isSearchSyncing])

  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
      }),
    [],
  )

  const formatPrice = (price: number): string => priceFormatter.format(price)

  const getStockLabel = (product: ApiProduct): string => {
    if (product.stockQuantity <= 10) {
      return 'Low stock'
    }

    return 'In stock'
  }

  const buildProductPayload = (): ProductWriteRequest | null => {
    const parsedPrice = Number.parseFloat(formState.price)
    const parsedStock = Number.parseInt(formState.stockQuantity, 10)
    const parsedCategoryId = Number.parseInt(effectiveCategoryId, 10)

    if (!formState.name.trim()) {
      setFormError('Product name is required.')
      return null
    }

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setFormError('Price must be a number equal to or above 0.')
      return null
    }

    if (Number.isNaN(parsedStock) || parsedStock <= 0) {
      setFormError('Stock quantity must be a positive whole number.')
      return null
    }

    if (Number.isNaN(parsedCategoryId)) {
      setFormError('Please choose a valid category.')
      return null
    }

    const normalizedImageUrl = formState.imageUrl.trim()

    if (normalizedImageUrl !== '' && !isValidHttpUrl(normalizedImageUrl)) {
      setFormError('Image URL must be a valid http/https URL.')
      return null
    }

    setFormError(null)
    return {
      name: formState.name.trim(),
      description: formState.description.trim() || null,
      imageUrl: normalizedImageUrl || null,
      price: parsedPrice,
      stockQuantity: parsedStock,
      categoryId: parsedCategoryId,
      active: formState.active,
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    if (!credentials.username.trim() || !credentials.password.trim()) {
      setFormError('Admin username and password are required for write operations.')
      return
    }

    const payload = buildProductPayload()
    if (!payload) {
      return
    }

    if (editingProductId !== null) {
      updateProductMutation.mutate({ id: editingProductId, product: payload })
      return
    }

    createProductMutation.mutate(payload)
  }

  const startEditing = (product: ApiProduct): void => {
    setEditingProductId(product.id)
    setFormError(null)
    setFormState({
      name: product.name,
      description: product.description ?? '',
      imageUrl: product.imageUrl ?? '',
      price: String(product.price),
      stockQuantity: String(product.stockQuantity),
      categoryId: String(product.category.id),
      active: product.active,
    })
  }

  const resetForm = (): void => {
    setEditingProductId(null)
    setFormError(null)
    setFormState((current) => ({
      ...emptyFormState,
      categoryId: current.categoryId,
    }))
  }

  const handleDelete = (product: ApiProduct): void => {
    const confirmed = window.confirm(`Delete ${product.name}? This action cannot be undone.`)
    if (!confirmed) {
      return
    }
    deleteProductMutation.mutate(product.id)
  }

  const goNext = (): void => {
    if (!productsPage?.hasNext || !productsPage.nextCursor) {
      return
    }

    if (snapshotToken === null) {
      setSnapshotToken(productsPage.snapshotToken)
    }

    setCursorTrail((current) => [...current.slice(0, cursorIndex + 1), productsPage.nextCursor])
    setCursorIndex((current) => current + 1)
  }

  const goPrevious = (): void => {
    if (cursorIndex <= 0) {
      return
    }
    setCursorIndex((current) => current - 1)
  }

  const mutationError =
    createProductMutation.error ?? updateProductMutation.error ?? deleteProductMutation.error
  const isSaving = createProductMutation.isPending || updateProductMutation.isPending
  const imagePreviewUrl = formState.imageUrl.trim()
  const hasValidPreview = imagePreviewUrl !== '' && isValidHttpUrl(imagePreviewUrl)
  const isFrozenSnapshot = snapshotToken !== null

  const snapshotWindowLabel = useMemo(() => {
    if (!productsPage || !isFrozenSnapshot) {
      return null
    }

    const windowMs = productsPage.snapshotExpiresAtEpochMs - productsPage.snapshotIssuedAtEpochMs
    const windowMinutes = Math.max(1, Math.ceil(windowMs / 60_000))
    return `${windowMinutes}m window`
  }, [productsPage, isFrozenSnapshot])

  useEffect(() => {
    const snapshotRecovery = isError ? classifySnapshotRecoveryError(error) : null

    if (
      !snapshotRecovery
      || snapshotToken === null
      || snapshotToken === lastRecoveredSnapshotToken
    ) {
      return
    }

    const timerId = window.setTimeout(() => {
      setLastRecoveredSnapshotToken(snapshotToken)
      resetCursorNavigation()
      setToastMessage(snapshotRecovery.toastMessage)
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [error, isError, lastRecoveredSnapshotToken, resetCursorNavigation, snapshotToken])

  useEffect(() => {
    if (!toastMessage) {
      return
    }

    const timerId = window.setTimeout(() => {
      setToastMessage(null)
    }, 3500)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [toastMessage])

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <div className="header-top-row">
          <p className="eyebrow">Portfolio Build</p>
          <button
            type="button"
            className={runtimeBadgeClassName}
            aria-label="Copy active frontend backend target URL"
            title={`Copy active target URL: ${runtimeBackendTarget.targetUrl}`}
            onClick={() => {
              void handleCopyRuntimeTarget()
            }}
          >
            API target: {runtimeBackendTarget.port ?? 'custom'} ({runtimeBackendTarget.label})
          </button>
        </div>
        <h1>Spring + React Product Catalog</h1>
        <p className="subtitle">
          This page uses cursor pagination and sortable server-side filters from <code>/api/products/cursor</code>.
        </p>
        <div className="status-row">
          <span>{productCountLabel}</span>
          <button
            className="refresh-button"
            onClick={() => {
              void refetch()
            }}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {productsPage && (
          <div className={`snapshot-indicator ${isFrozenSnapshot ? 'frozen' : 'live'}`}>
            {isFrozenSnapshot
              ? `Frozen snapshot ${productsPage.snapshotVersion} active (${snapshotWindowLabel ?? '...'})`
              : 'Live mode: next page will lock a snapshot window for deterministic results.'}
          </div>
        )}
        {productCounts && (
          <div className="badge-row" aria-label="Catalog count badges">
            <span className="badge-pill">Total: {productCounts.total}</span>
            <span className="badge-pill">Active: {productCounts.active}</span>
            <span className="badge-pill">Inactive: {productCounts.inactive}</span>
          </div>
        )}
      </header>

      <section className="toolbox" aria-label="Catalog controls">
        <div className="control-group">
          <label htmlFor="search-input">Search products</label>
          <input
            id="search-input"
            type="search"
            placeholder="Server-side search by name, description, or category"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              resetCursorNavigation()
            }}
          />
          {isSearchSyncing && <small className="control-hint">Updating search results...</small>}
        </div>

        <div className="control-group">
          <label htmlFor="category-filter">Category filter</label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value)
              resetCursorNavigation()
            }}
          >
            <option value="all">All categories</option>
            {categories?.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="sort-by">Sort by</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value as SortBy)
              resetCursorNavigation()
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="sort-direction">Direction</label>
          <select
            id="sort-direction"
            value={sortDirection}
            onChange={(event) => {
              setSortDirection(event.target.value as SortDirection)
              resetCursorNavigation()
            }}
          >
            <option value="DESC">Descending</option>
            <option value="ASC">Ascending</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="page-size">Page size</label>
          <select
            id="page-size"
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              resetCursorNavigation()
            }}
          >
            {PAGE_SIZE_OPTIONS.map((sizeOption) => (
              <option key={sizeOption} value={String(sizeOption)}>
                {sizeOption} per page
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="admin-panel" aria-label="Product management">
        <h2>{editingProductId === null ? 'Create Product' : `Update Product #${editingProductId}`}</h2>

        <p className="admin-note">
          Write endpoints now use token-based auth. Provide admin credentials and the app requests a short-lived
          access token for create, update, and delete operations.
        </p>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="form-row two-up">
            <label>
              Admin username
              <input
                type="text"
                autoComplete="username"
                placeholder="Enter admin username"
                value={credentials.username}
                onChange={(event) => {
                  setCredentials((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }}
              />
            </label>

            <label>
              Admin password
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Enter admin password"
                value={credentials.password}
                onChange={(event) => {
                  setCredentials((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }}
              />
            </label>
          </div>

          <div className="form-row two-up">
            <label>
              Name
              <input
                type="text"
                value={formState.name}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }}
                required
              />
            </label>

            <label>
              Category
              <select
                value={effectiveCategoryId}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }}
                required
              >
                {isCategoriesLoading && <option value="">Loading categories...</option>}
                {!isCategoriesLoading && categories?.length === 0 && (
                  <option value="">No categories available</option>
                )}
                {categories?.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Description
            <textarea
              rows={3}
              value={formState.description}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }}
            />
          </label>

          <label>
            Image URL
            <input
              type="url"
              placeholder="https://example.com/product-image.jpg"
              value={formState.imageUrl}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  imageUrl: event.target.value,
                }))
              }}
            />
          </label>

          <div className="preview-box">
            {hasValidPreview ? (
              <img src={imagePreviewUrl} alt="Product preview" className="preview-image" />
            ) : (
              <p className="preview-placeholder">Paste a valid image URL to preview the product image.</p>
            )}
          </div>

          <div className="form-row three-up">
            <label>
              Price
              <input
                type="number"
                step="0.01"
                min="0"
                value={formState.price}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }}
                required
              />
            </label>

            <label>
              Stock quantity
              <input
                type="number"
                min="1"
                value={formState.stockQuantity}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    stockQuantity: event.target.value,
                  }))
                }}
                required
              />
            </label>

            <label className="checkbox-field">
              Active
              <input
                type="checkbox"
                checked={formState.active}
                onChange={(event) => {
                  setFormState((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="refresh-button" disabled={isSaving || isCategoriesLoading}>
              {isSaving ? 'Saving...' : editingProductId === null ? 'Create product' : 'Update product'}
            </button>
            {editingProductId !== null && (
              <button type="button" className="ghost-button" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>

          {formError && <p className="error-text">{formError}</p>}
          {mutationError instanceof Error && <p className="error-text">{mutationError.message}</p>}
          {createProductMutation.isSuccess && editingProductId === null && (
            <p className="success-text">Product created successfully.</p>
          )}
          {updateProductMutation.isSuccess && <p className="success-text">Product updated successfully.</p>}
        </form>
      </section>

      {isLoading && <p className="info-state">Loading products from backend...</p>}

      {isError && (
        <section className="error-card">
          <h2>Could not load products</h2>
          <p>{error instanceof Error ? error.message : 'Unexpected API error'}</p>
          <p>Make sure Spring Boot is running for target {runtimeBackendTarget.targetUrl} and try again.</p>
        </section>
      )}

      {isCategoriesError && (
        <section className="error-card">
          <h2>Could not load categories</h2>
          <p>{categoriesError instanceof Error ? categoriesError.message : 'Unexpected API error'}</p>
        </section>
      )}

      {productsPage && products.length === 0 && (
        <section className="info-state">
          <p>
            No products match the current server-side filter. Try changing search, category, or sort
            options.
          </p>
        </section>
      )}

      {productsPage && products.length > 0 && (
        <section className="products-grid" aria-label="Products list">
          {products.map((product) => (
            <article key={product.id} className="product-card">
              <div className="card-image-wrap">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="product-image" loading="lazy" />
                ) : (
                  <div className="product-image-placeholder">No image</div>
                )}
              </div>
              <div className="card-head">
                <span className="category-pill">{product.category.name}</span>
                <span className={`stock-pill ${product.stockQuantity <= 10 ? 'low' : 'ok'}`}>
                  {getStockLabel(product)}
                </span>
              </div>
              <h2>{product.name}</h2>
              <p>{product.description ?? 'No description provided yet.'}</p>
              <div className="card-foot">
                <strong>{formatPrice(product.price)}</strong>
                <small>{product.stockQuantity} units</small>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    startEditing(product)
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    handleDelete(product)
                  }}
                  disabled={deleteProductMutation.isPending}
                >
                  {deleteProductMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {productsPage && (
        <section className="pagination-row" aria-label="Pagination controls">
          <button
            type="button"
            className="ghost-button"
            onClick={goPrevious}
            disabled={cursorIndex <= 0 || isFetching}
          >
            Previous
          </button>
          <span>Page {cursorIndex + 1}</span>
          <button
            type="button"
            className="ghost-button"
            onClick={goNext}
            disabled={!productsPage.hasNext || !productsPage.nextCursor || isFetching}
          >
            Next
          </button>
        </section>
      )}

      {toastMessage && (
        <div className="toast-message" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </main>
  )
}

export default App
