import * as z from "zod"

export const MAX_FILENAME_LENGTH = 255
export const MAX_EXTENSION_LENGTH = 32

export interface SanitizedFileName {
  name: string
  extension: string | null
}

export const filenameSchema = z
  .string()
  .trim()
  .min(1, "Filename cannot be empty")
  .max(MAX_FILENAME_LENGTH, `Filename cannot exceed ${MAX_FILENAME_LENGTH} characters`)

export const contentTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, {
    message: "Content type must be a valid MIME type",
  })

export const acceptedContentTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/(?:[a-z0-9][a-z0-9!#$&^_.+-]*|\*)$/, {
    message: "Accepted content type must be a valid MIME type or top-level wildcard",
  })

export const extensionSchema = z
  .string()
  .trim()
  .max(MAX_EXTENSION_LENGTH, `Extension cannot exceed ${MAX_EXTENSION_LENGTH} characters`)
  .regex(/^[a-zA-Z0-9]+$/, "Extension contains invalid characters")

export const acceptedExtensionSchema = z
  .string()
  .trim()
  .transform((extension) => extension.replace(/^\./, "").toLowerCase())
  .pipe(extensionSchema)

export const fileSizeSchema = z
  .number()
  .int("File size must be an integer")
  .nonnegative("File size cannot be negative")

export const maxFileSizeBytesSchema = z
  .number()
  .int("Maximum file size must be an integer")
  .positive("Maximum file size must be greater than zero")

export const fileSizeLimitSchema = z.object({
  value: z.number().positive("Maximum file size must be greater than zero"),
  unit: z.enum(["KB", "MB", "GB", "TB"]),
})

export const durationSchema = z.object({
  value: z.number().positive("Duration must be greater than zero"),
  unit: z.enum(["seconds", "minutes", "hours"]),
})

export const keyPrefixSegmentSchema = z
  .string()
  .min(1, "Key prefix segments cannot be empty")
  .regex(/^[a-zA-Z0-9_-]+$/, "Key prefix contains invalid characters")
