/** Accept only same-origin application paths, including after URL normalization. */
export function safeReturnPath(value: string | string[] | undefined, fallback = "/mypage") {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next?.startsWith("/")) return fallback;
  const base = "https://aura.invalid";
  try {
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
