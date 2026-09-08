import { UploadSDKError } from "./error"
import type {
  CompletedMultipartUploadPart,
  MultipartUploadPart,
  PrepareMultipartUploadPartsOutput,
  PrepareUploadOutput,
} from "./types"

const S3_MIN_MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024
const S3_MAX_MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024 * 1024
const S3_MAX_MULTIPART_PARTS = 10_000

export type UploadFileProgress = {
  loaded: number
  total?: number
  percent?: number
}

export type UploadFileOptions = {
  fieldName?: string
  filename?: string
  signal?: AbortSignal
  onProgress?: (progress: UploadFileProgress) => void
}

export type UploadFileResult = {
  key: string
  status: number
  responseText: string
}

export type UploadMultipartPartsOptions = {
  chunkSize?: number
  concurrency?: number
  signal?: AbortSignal
  onProgress?: (progress: UploadFileProgress) => void
}

export type UploadMultipartPartsResult = {
  key: string
  uploadId: string
  storageProfile: string
  parts: CompletedMultipartUploadPart[]
}

export function uploadFile(
  preparedUpload: PrepareUploadOutput,
  file: Blob,
  options: UploadFileOptions = {},
): Promise<UploadFileResult> {
  if (preparedUpload.strategy !== "multipart") {
    throw new UploadSDKError(`Upload strategy "${preparedUpload.strategy}" is not supported`, {
      code: "UNSUPPORTED_UPLOAD_OPERATION",
    })
  }

  if (preparedUpload.method !== "POST") {
    throw new UploadSDKError(`Upload method "${preparedUpload.method}" is not supported`, {
      code: "UNSUPPORTED_UPLOAD_OPERATION",
    })
  }

  if (typeof XMLHttpRequest === "undefined" || typeof FormData === "undefined") {
    throw new UploadSDKError("uploadFile() must run in a browser-like environment", {
      code: "UNSUPPORTED_UPLOAD_OPERATION",
    })
  }

  if (options.signal?.aborted) {
    throw createAbortError()
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const cleanup = () => options.signal?.removeEventListener("abort", abortUpload)

    function abortUpload() {
      request.abort()
      cleanup()
      reject(createAbortError())
    }

    options.signal?.addEventListener("abort", abortUpload, { once: true })

    request.upload.addEventListener("progress", (event) => {
      options.onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : undefined,
        percent: event.lengthComputable
          ? resolveUploadPercent(event.loaded, event.total)
          : undefined,
      })
    })

    request.addEventListener("load", () => {
      cleanup()

      if (request.status >= 200 && request.status < 300) {
        resolve({
          key: preparedUpload.key,
          status: request.status,
          responseText: request.responseText,
        })

        return
      }

      reject(
        new UploadSDKError(request.responseText || "The provider rejected the upload.", {
          code: "UPLOAD_PROVIDER_ERROR",
          statusCode: request.status || 500,
        }),
      )
    })

    request.addEventListener("error", () => {
      cleanup()
      reject(
        new UploadSDKError("The upload request failed.", {
          code: "UPLOAD_PROVIDER_ERROR",
        }),
      )
    })

    request.addEventListener("timeout", () => {
      cleanup()
      reject(
        new UploadSDKError("The upload request timed out.", {
          code: "UPLOAD_PROVIDER_ERROR",
        }),
      )
    })

    request.addEventListener("abort", cleanup)

    const formData = new FormData()

    for (const [name, value] of Object.entries(preparedUpload.fields)) {
      formData.append(name, value)
    }

    if (options.filename) {
      formData.append(options.fieldName ?? "file", file, options.filename)
    } else {
      formData.append(options.fieldName ?? "file", file)
    }

    request.open(preparedUpload.method, preparedUpload.url)

    for (const [name, value] of Object.entries(preparedUpload.headers)) {
      request.setRequestHeader(name, value)
    }

    request.send(formData)
  })
}

export async function uploadMultipartParts(
  preparedUpload: PrepareMultipartUploadPartsOutput,
  file: Blob,
  options: UploadMultipartPartsOptions = {},
): Promise<UploadMultipartPartsResult> {
  if (preparedUpload.strategy !== "multipart-parts") {
    throw new UploadSDKError(`Upload strategy "${preparedUpload.strategy}" is not supported`, {
      code: "UNSUPPORTED_UPLOAD_OPERATION",
    })
  }

  if (typeof XMLHttpRequest === "undefined") {
    throw new UploadSDKError("uploadMultipartParts() must run in a browser-like environment", {
      code: "UNSUPPORTED_UPLOAD_OPERATION",
    })
  }

  const parts = [...preparedUpload.parts].sort((left, right) => left.partNumber - right.partNumber)
  validateMultipartParts(parts)

  const chunkSize = resolveChunkSize(file.size, parts.length, options.chunkSize)
  const completedParts: CompletedMultipartUploadPart[] = []
  const loadedByPartNumber = new Map<number, number>()
  const concurrency = Math.min(Math.max(options.concurrency ?? 3, 1), parts.length)
  let nextPartIndex = 0

  if (options.signal?.aborted) {
    throw createAbortError()
  }

  function emitProgress() {
    const loaded = Array.from(loadedByPartNumber.values()).reduce(
      (total, value) => total + value,
      0,
    )

    options.onProgress?.({
      loaded,
      total: file.size,
      percent: resolveUploadPercent(loaded, file.size),
    })
  }

  async function worker() {
    while (nextPartIndex < parts.length) {
      const part = parts[nextPartIndex]
      nextPartIndex += 1

      const start = (part.partNumber - 1) * chunkSize
      const end =
        part.partNumber === parts.length ? file.size : Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)

      const completedPart = await uploadMultipartPart(part, chunk, {
        signal: options.signal,
        onProgress: (loaded) => {
          loadedByPartNumber.set(part.partNumber, loaded)
          emitProgress()
        },
      })

      loadedByPartNumber.set(part.partNumber, chunk.size)
      completedParts.push(completedPart)
      emitProgress()
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return {
    key: preparedUpload.key,
    uploadId: preparedUpload.uploadId,
    storageProfile: preparedUpload.storageProfile,
    parts: completedParts.sort((left, right) => left.partNumber - right.partNumber),
  }
}

function createAbortError(): UploadSDKError {
  return new UploadSDKError("The upload request was aborted.", {
    code: "UPLOAD_PROVIDER_ERROR",
  })
}

function resolveUploadPercent(loaded: number, total: number): number {
  return total > 0 ? Math.round((loaded / total) * 100) : 100
}

type UploadMultipartPartOptions = {
  signal?: AbortSignal
  onProgress?: (loaded: number) => void
}

function uploadMultipartPart(
  part: MultipartUploadPart,
  chunk: Blob,
  options: UploadMultipartPartOptions,
): Promise<CompletedMultipartUploadPart> {
  if (part.method !== "PUT") {
    throw new UploadSDKError(`Upload part method "${part.method}" is not supported`, {
      code: "UNSUPPORTED_UPLOAD_OPERATION",
    })
  }

  if (options.signal?.aborted) {
    throw createAbortError()
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const cleanup = () => options.signal?.removeEventListener("abort", abortUpload)

    function abortUpload() {
      request.abort()
      cleanup()
      reject(createAbortError())
    }

    options.signal?.addEventListener("abort", abortUpload, { once: true })

    request.upload.addEventListener("progress", (event) => {
      options.onProgress?.(event.loaded)
    })

    request.addEventListener("load", () => {
      cleanup()

      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader("ETag")

        if (!etag) {
          reject(
            new UploadSDKError("The provider did not return an ETag for the uploaded part.", {
              code: "UPLOAD_PROVIDER_ERROR",
            }),
          )

          return
        }

        resolve({
          partNumber: part.partNumber,
          etag,
        })

        return
      }

      reject(
        new UploadSDKError(request.responseText || "The provider rejected an upload part.", {
          code: "UPLOAD_PROVIDER_ERROR",
          statusCode: request.status || 500,
        }),
      )
    })

    request.addEventListener("error", () => {
      cleanup()
      reject(
        new UploadSDKError("The upload part request failed.", {
          code: "UPLOAD_PROVIDER_ERROR",
        }),
      )
    })

    request.addEventListener("timeout", () => {
      cleanup()
      reject(
        new UploadSDKError("The upload part request timed out.", {
          code: "UPLOAD_PROVIDER_ERROR",
        }),
      )
    })

    request.addEventListener("abort", cleanup)
    request.open(part.method, part.url)

    for (const [name, value] of Object.entries(part.headers)) {
      request.setRequestHeader(name, value)
    }

    request.send(chunk)
  })
}

function resolveChunkSize(
  fileSize: number,
  partCount: number,
  chunkSize: number | undefined,
): number {
  const resolvedChunkSize = chunkSize ?? Math.ceil(fileSize / partCount)

  if (!Number.isInteger(resolvedChunkSize) || resolvedChunkSize < 1) {
    throw new UploadSDKError("Multipart upload chunk size must be a positive integer", {
      code: "INVALID_UPLOAD_INPUT",
    })
  }

  if (resolvedChunkSize > S3_MAX_MULTIPART_CHUNK_SIZE) {
    throw new UploadSDKError("Multipart upload chunk size cannot exceed 5 GiB", {
      code: "INVALID_UPLOAD_INPUT",
    })
  }

  if (partCount > 1 && resolvedChunkSize < S3_MIN_MULTIPART_CHUNK_SIZE) {
    throw new UploadSDKError(
      "Multipart upload chunk size must be at least 5 MiB when uploading more than one part",
      {
        code: "INVALID_UPLOAD_INPUT",
      },
    )
  }

  if (Math.ceil(fileSize / resolvedChunkSize) !== partCount) {
    throw new UploadSDKError("Multipart upload chunk size does not match the prepared part count", {
      code: "INVALID_UPLOAD_INPUT",
    })
  }

  return resolvedChunkSize
}

function validateMultipartParts(parts: readonly MultipartUploadPart[]) {
  if (!parts.length) {
    throw new UploadSDKError("At least one multipart upload part is required", {
      code: "INVALID_UPLOAD_INPUT",
    })
  }

  if (parts.length > S3_MAX_MULTIPART_PARTS) {
    throw new UploadSDKError("Multipart uploads cannot exceed 10000 parts", {
      code: "INVALID_UPLOAD_INPUT",
    })
  }

  for (const [index, part] of parts.entries()) {
    const expectedPartNumber = index + 1

    if (part.partNumber !== expectedPartNumber) {
      throw new UploadSDKError("Multipart upload parts must be numbered sequentially from 1", {
        code: "INVALID_UPLOAD_INPUT",
      })
    }
  }
}
