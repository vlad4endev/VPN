/** Собрать стабильный отпечаток в браузере (не FingerprintJS; хватает для грубого антифрода). */
export async function computeDeviceFingerprintHex(): Promise<string> {
  const payload = [
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    typeof screen !== "undefined"
      ? `${screen.width}x${screen.height}x${screen.colorDepth}`
      : "",
    typeof navigator !== "undefined" ? navigator.language : "",
  ].join("|");

  const enc = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
