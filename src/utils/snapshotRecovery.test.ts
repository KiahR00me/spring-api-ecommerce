import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/productsApi'
import { classifySnapshotRecoveryError } from './snapshotRecovery'

describe('classifySnapshotRecoveryError', () => {
  it('returns null for non-ApiError values', () => {
    const result = classifySnapshotRecoveryError(new Error('nope'))

    expect(result).toBeNull()
  })

  it('returns null for ApiError values that are not status 400', () => {
    const result = classifySnapshotRecoveryError(
      new ApiError('snapshot token expired', 500),
    )

    expect(result).toBeNull()
  })

  it('classifies snapshot version mismatch errors', () => {
    const result = classifySnapshotRecoveryError(
      new ApiError('Snapshot Token Version Mismatch: expected=v2 actual=v1', 400),
    )

    expect(result).toEqual({
      type: 'versionMismatch',
      toastMessage: 'Snapshot version changed, switched back to live results.',
    })
  })

  it('classifies snapshot expiry errors', () => {
    const result = classifySnapshotRecoveryError(
      new ApiError('snapshot token expired at 2026-04-14T08:00:00Z', 400),
    )

    expect(result).toEqual({
      type: 'expired',
      toastMessage: 'Snapshot expired, switched back to live results.',
    })
  })

  it('returns null for other bad-request errors', () => {
    const result = classifySnapshotRecoveryError(
      new ApiError('validation failed for field sortDirection', 400),
    )

    expect(result).toBeNull()
  })
})
