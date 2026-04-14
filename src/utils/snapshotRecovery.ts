import { ApiError } from '../api/productsApi'

export type SnapshotRecoveryType = 'expired' | 'versionMismatch'

export type SnapshotRecoveryClassification = {
  type: SnapshotRecoveryType
  toastMessage: string
}

const SNAPSHOT_VERSION_MISMATCH_PATTERN = /snapshot token version mismatch/i
const SNAPSHOT_EXPIRED_PATTERN = /snapshot token expired/i

const SNAPSHOT_RECOVERY_TOAST_MESSAGES: Record<SnapshotRecoveryType, string> = {
  versionMismatch: 'Snapshot version changed, switched back to live results.',
  expired: 'Snapshot expired, switched back to live results.',
}

export const classifySnapshotRecoveryError = (
  error: unknown,
): SnapshotRecoveryClassification | null => {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null
  }

  if (SNAPSHOT_VERSION_MISMATCH_PATTERN.test(error.message)) {
    return {
      type: 'versionMismatch',
      toastMessage: SNAPSHOT_RECOVERY_TOAST_MESSAGES.versionMismatch,
    }
  }

  if (SNAPSHOT_EXPIRED_PATTERN.test(error.message)) {
    return {
      type: 'expired',
      toastMessage: SNAPSHOT_RECOVERY_TOAST_MESSAGES.expired,
    }
  }

  return null
}
