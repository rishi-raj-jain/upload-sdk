const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function encodeBase64(value: string): string {
  return encodeBase64Bytes(new TextEncoder().encode(value))
}

export function encodeBase64Url(value: string): string {
  return encodeBase64UrlBytes(new TextEncoder().encode(value))
}

export function encodeBase64UrlBytes(bytes: Uint8Array): string {
  return encodeBase64Bytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function hmacSha256(key: string | ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? new TextEncoder().encode(key) : key,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  )

  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value))
}

export async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let output = ""

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]

    output += BASE64_ALPHABET[first >> 2]
    output += BASE64_ALPHABET[((first & 0b00000011) << 4) | ((second ?? 0) >> 4)]
    output +=
      second === undefined
        ? "="
        : BASE64_ALPHABET[((second & 0b00001111) << 2) | ((third ?? 0) >> 6)]
    output += third === undefined ? "=" : BASE64_ALPHABET[third & 0b00111111]
  }

  return output
}
