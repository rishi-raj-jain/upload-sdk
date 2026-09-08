"use client"

import { type PrepareUploadOutput, uploadFile } from "@marinedotsh/upload-sdk"
import { type FormEvent, useRef, useState } from "react"
import { assets } from "@/server/asset-rules"

const uploadAsset = assets.avatar

type UploadErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

type Status =
  | { type: "idle"; message: "" }
  | { type: "uploading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string }

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>({
    type: "idle",
    message: "",
  })

  const isUploading = status.type === "uploading"

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setStatus({
        type: "error",
        message: "Choose a file first.",
      })

      return
    }

    try {
      setStatus({
        type: "uploading",
        message: "Uploading your file...",
      })

      const presignedUpload = await getPresignedUrl(file)

      await uploadFile(presignedUpload, file)

      setStatus({
        type: "success",
        message: "File uploaded successfully.",
      })
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      })
    }
  }

  function handleFiles(fileList: FileList | null) {
    setFile(fileList?.[0] ?? null)
    setStatus({ type: "idle", message: "" })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Upload a file</h1>

          <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Select a file and upload it securely to your storage provider.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept={createFileInputAccept(uploadAsset)}
            className="sr-only"
            onChange={(event) => handleFiles(event.target.files)}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center transition hover:border-zinc-400 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:focus-visible:ring-zinc-50 dark:focus-visible:ring-offset-zinc-900"
          >
            {file ? (
              <>
                <span className="max-w-full truncate text-sm font-medium">{file.name}</span>

                <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatSelectedFileMeta(file)}
                </span>

                <span className="mt-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Click to replace
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Choose a file</span>

                <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Click to browse your device
                </span>
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={isUploading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isUploading ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-zinc-950/30 dark:border-t-zinc-950" />
                Uploading...
              </>
            ) : (
              "Upload file"
            )}
          </button>
        </form>

        {status.message && (
          <div
            role="status"
            className={[
              "mt-4 flex items-start gap-2 rounded-xl border px-3 py-3 text-sm",
              status.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : status.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400",
            ].join(" ")}
          >
            {status.message}
          </div>
        )}
      </section>
    </main>
  )
}

async function getPresignedUrl(file: File): Promise<PrepareUploadOutput> {
  const contentType = file.type || "application/octet-stream"

  const presignedUrlResponse = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: file.name,
      contentType,
      size: file.size,
    }),
  })

  const presignedUpload = (await presignedUrlResponse.json()) as
    | PrepareUploadOutput
    | UploadErrorResponse

  if (!presignedUrlResponse.ok || !("url" in presignedUpload)) {
    throw new Error(
      "error" in presignedUpload && presignedUpload.error?.message
        ? presignedUpload.error.message
        : "Failed to prepare upload.",
    )
  }

  return presignedUpload
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 bytes"

  const units = ["bytes", "KB", "MB", "GB"]
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function createFileInputAccept(asset: typeof uploadAsset) {
  return [
    ...(asset.accept?.mimeTypes ?? []),
    ...(asset.accept?.extensions ?? []).map((extension) => `.${extension}`),
  ].join(",")
}

function formatSelectedFileMeta(file: File) {
  return `${file.type || "Unknown type"} - ${formatBytes(file.size)}`
}
