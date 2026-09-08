export type MetadataValue = string | number | boolean

// TODO(metadata): consider provider-specific metadata types so shared SDK
// metadata does not force unsupported fields or shapes onto every provider.
export type UploadMetadata = Record<string, MetadataValue>

export type FileSizeUnit = "KB" | "MB" | "GB" | "TB"

export type FileSizeLimit = {
  value: number
  unit: FileSizeUnit
}

export type DurationUnit = "seconds" | "minutes" | "hours"

export type Duration = {
  value: number
  unit: DurationUnit
}

export type ProviderPrepareUploadInput = {
  key: string
  contentType: string
  expiresInSeconds?: number
  metadata?: UploadMetadata
  accept?: {
    mimeTypes?: readonly string[]
    extensions?: readonly string[]
  }
  limits?: {
    maxFileSizeBytes?: number
  }
}

export type ProviderCreateMultipartUploadInput = ProviderPrepareUploadInput

export type ProviderCreateMultipartUploadOutput = {
  strategy: "multipart-parts"
  key: string
  uploadId: string
}

export type CreateMultipartUploadOutput = ProviderCreateMultipartUploadOutput & {
  storageProfile: string
}

export type ProviderPrepareMultipartUploadPartsInput = {
  key: string
  uploadId: string
  partNumbers: readonly number[]
  expiresInSeconds?: number
}

export type MultipartUploadPart = {
  partNumber: number
  url: string
  method: "PUT"
  headers: Record<string, string>
  expiresAt: string
}

export type ProviderPrepareMultipartUploadPartsOutput = {
  strategy: "multipart-parts"
  key: string
  uploadId: string
  parts: MultipartUploadPart[]
}

export type PrepareMultipartUploadPartsOutput = ProviderPrepareMultipartUploadPartsOutput & {
  storageProfile: string
}

export type CompletedMultipartUploadPart = {
  partNumber: number
  etag: string
}

export type ProviderCompleteMultipartUploadInput = {
  key: string
  uploadId: string
  parts: readonly CompletedMultipartUploadPart[]
}

export type CompleteMultipartUploadOutput = {
  key: string
  location?: string
  bucket?: string
  etag?: string
}

export type ProviderAbortMultipartUploadInput = {
  key: string
  uploadId: string
}

export type PrepareUploadOutput = {
  strategy: "multipart"
  url: string
  method: "POST"
  headers: Record<string, string>
  fields: Record<string, string>
  key: string
  expiresAt: string
}

export type StorageProvider = {
  prepareUpload(input: ProviderPrepareUploadInput): Promise<PrepareUploadOutput>
  createMultipartUpload?(
    input: ProviderCreateMultipartUploadInput,
  ): Promise<ProviderCreateMultipartUploadOutput>
  prepareMultipartUploadParts?(
    input: ProviderPrepareMultipartUploadPartsInput,
  ): Promise<ProviderPrepareMultipartUploadPartsOutput>
  completeMultipartUpload?(
    input: ProviderCompleteMultipartUploadInput,
  ): Promise<CompleteMultipartUploadOutput>
  abortMultipartUpload?(input: ProviderAbortMultipartUploadInput): Promise<void>
}

export type AssetUploadConfig<TStorageProfileName extends string = string> = {
  storageProfile?: TStorageProfileName
  keyPrefix: string
  expiresIn?: Duration

  limits?: {
    maxFileSize?: FileSizeLimit
    maxFiles?: number
    concurrency?: number
  }

  accept?: {
    mimeTypes?: readonly string[]
    extensions?: readonly string[]
  }

  metadata?: UploadMetadata
}

export function defineStorageProfiles<
  const TStorageProfiles extends Record<string, StorageProvider>,
>(storageProfiles: TStorageProfiles): TStorageProfiles {
  return storageProfiles
}

export function defineAssets<
  const TStorageProfiles extends Record<string, StorageProvider>,
  const TAssets extends Record<string, AssetUploadConfig<Extract<keyof TStorageProfiles, string>>>,
>(_storageProfiles: TStorageProfiles, assets: TAssets): TAssets {
  return assets
}

export function defineUploadConfig<
  const TStorageProfiles extends Record<string, StorageProvider>,
  const TAssets extends Record<string, AssetUploadConfig<Extract<keyof TStorageProfiles, string>>>,
>(config: {
  storageProfiles: TStorageProfiles
  defaultStorageProfile: Extract<keyof TStorageProfiles, string>
  assets: TAssets
}) {
  return config
}
