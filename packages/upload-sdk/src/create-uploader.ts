import { toUploadSDKError, UploadSDKError } from "./error"
import type { AssetUploadConfig, CompletedMultipartUploadPart, StorageProvider } from "./types"
import { resolveDurationSeconds } from "./validation/duration"
import { generateFileName, sanitizeFileName } from "./validation/file"
import { resolveFileSizeLimitBytes } from "./validation/file-size"
import { sanitizeKeyPrefix } from "./validation/key-prefix"
import { validateUploadInput } from "./validation/upload-input"

type PrepareUploadInput = {
  filename: string
  contentType: string
  size: number
}

type PrepareMultipartUploadPartsInput = {
  storageProfile: string
  key: string
  uploadId: string
  partNumbers: readonly number[]
  expiresIn?: {
    value: number
    unit: "seconds" | "minutes" | "hours"
  }
}

type CompleteMultipartUploadInput = {
  storageProfile: string
  key: string
  uploadId: string
  parts: readonly CompletedMultipartUploadPart[]
}

type AbortMultipartUploadInput = {
  storageProfile: string
  key: string
  uploadId: string
}

export function createUploader<
  const TStorageProfiles extends Record<string, StorageProvider>,
  const TAssets extends Record<string, AssetUploadConfig<Extract<keyof TStorageProfiles, string>>>,
>(config: {
  storageProfiles: TStorageProfiles
  defaultStorageProfile: Extract<keyof TStorageProfiles, string>
  assets: TAssets
}) {
  async function prepareUpload<TAssetName extends Extract<keyof TAssets, string>>(
    assetName: TAssetName,
    input: PrepareUploadInput,
  ) {
    try {
      const asset = config.assets[assetName]

      const storageProfileName = asset.storageProfile ?? config.defaultStorageProfile
      const storageProfile = config.storageProfiles[storageProfileName]

      if (!storageProfile.prepareUpload) {
        throw new UploadSDKError(
          `Storage profile "${storageProfileName}" does not support prepareUpload`,
          {
            code: "UNSUPPORTED_UPLOAD_OPERATION",
          },
        )
      }

      const sanitizedFileName = sanitizeFileName(input.filename)
      const expiresInSeconds = resolveDurationSeconds(asset.expiresIn)
      const maxFileSizeBytes = resolveFileSizeLimitBytes(asset.limits?.maxFileSize)

      const contentType = validateUploadInput({
        asset,
        contentType: input.contentType,
        fileExtension: sanitizedFileName.extension,
        size: input.size,
      })

      const key = `${sanitizeKeyPrefix(asset.keyPrefix)}/${generateFileName(input.filename)}`

      const preparedUpload = await storageProfile.prepareUpload({
        key,
        contentType,
        expiresInSeconds,
        accept: asset.accept,
        metadata: asset.metadata,
        limits: {
          maxFileSizeBytes,
        },
      })

      return preparedUpload
    } catch (error) {
      throw toUploadSDKError(error, {
        code: "UPLOAD_PROVIDER_ERROR",
        message: "Upload could not be prepared.",
      })
    }
  }

  async function createMultipartUpload<TAssetName extends Extract<keyof TAssets, string>>(
    assetName: TAssetName,
    input: PrepareUploadInput,
  ) {
    try {
      const asset = config.assets[assetName]
      const storageProfileName = asset.storageProfile ?? config.defaultStorageProfile
      const storageProfile = config.storageProfiles[storageProfileName]

      if (!storageProfile.createMultipartUpload) {
        throw new UploadSDKError(
          `Storage profile "${storageProfileName}" does not support createMultipartUpload`,
          {
            code: "UNSUPPORTED_UPLOAD_OPERATION",
          },
        )
      }

      const sanitizedFileName = sanitizeFileName(input.filename)
      const expiresInSeconds = resolveDurationSeconds(asset.expiresIn)
      const maxFileSizeBytes = resolveFileSizeLimitBytes(asset.limits?.maxFileSize)
      const contentType = validateUploadInput({
        asset,
        contentType: input.contentType,
        fileExtension: sanitizedFileName.extension,
        size: input.size,
      })
      const key = `${sanitizeKeyPrefix(asset.keyPrefix)}/${generateFileName(input.filename)}`

      const multipartUpload = await storageProfile.createMultipartUpload({
        key,
        contentType,
        expiresInSeconds,
        accept: asset.accept,
        metadata: asset.metadata,
        limits: {
          maxFileSizeBytes,
        },
      })

      return {
        ...multipartUpload,
        storageProfile: storageProfileName,
      }
    } catch (error) {
      throw toUploadSDKError(error, {
        code: "UPLOAD_PROVIDER_ERROR",
        message: "Multipart upload could not be created.",
      })
    }
  }

  function getStorageProfile(storageProfileName: string): StorageProvider {
    const storageProfile =
      config.storageProfiles[storageProfileName as Extract<keyof TStorageProfiles, string>]

    if (!storageProfile) {
      throw new UploadSDKError(`Storage profile "${storageProfileName}" does not exist`, {
        code: "INVALID_UPLOAD_CONFIG",
      })
    }

    return storageProfile
  }

  async function prepareMultipartUploadParts(input: PrepareMultipartUploadPartsInput) {
    const storageProfile = getStorageProfile(input.storageProfile)

    if (!storageProfile.prepareMultipartUploadParts) {
      throw new UploadSDKError(
        `Storage profile "${input.storageProfile}" does not support prepareMultipartUploadParts`,
        {
          code: "UNSUPPORTED_UPLOAD_OPERATION",
        },
      )
    }

    const preparedParts = await storageProfile.prepareMultipartUploadParts({
      key: input.key,
      uploadId: input.uploadId,
      partNumbers: input.partNumbers,
      expiresInSeconds: resolveDurationSeconds(input.expiresIn),
    })

    return {
      ...preparedParts,
      storageProfile: input.storageProfile,
    }
  }

  async function completeMultipartUpload(input: CompleteMultipartUploadInput) {
    const storageProfile = getStorageProfile(input.storageProfile)

    if (!storageProfile.completeMultipartUpload) {
      throw new UploadSDKError(
        `Storage profile "${input.storageProfile}" does not support completeMultipartUpload`,
        {
          code: "UNSUPPORTED_UPLOAD_OPERATION",
        },
      )
    }

    return storageProfile.completeMultipartUpload(input)
  }

  async function abortMultipartUpload(input: AbortMultipartUploadInput) {
    const storageProfile = getStorageProfile(input.storageProfile)

    if (!storageProfile.abortMultipartUpload) {
      throw new UploadSDKError(
        `Storage profile "${input.storageProfile}" does not support abortMultipartUpload`,
        {
          code: "UNSUPPORTED_UPLOAD_OPERATION",
        },
      )
    }

    await storageProfile.abortMultipartUpload(input)
  }

  return {
    abortMultipartUpload,
    completeMultipartUpload,
    createMultipartUpload,
    prepareUpload,
    prepareMultipartUploadParts,
  }
}
