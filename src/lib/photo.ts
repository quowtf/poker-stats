/**
 * Normalizes a player photo URL so it can be rendered by an <img>.
 *
 * The common footgun is pasting a GitHub *blob* page URL
 * (github.com/<user>/<repo>/blob/<ref>/<path>), which returns an HTML page,
 * not the file bytes — so the image silently breaks. This rewrites it to the
 * raw host (raw.githubusercontent.com), which serves the actual image with the
 * right content type (SVG included).
 *
 * Any other URL is returned trimmed as-is.
 */
export function normalizePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const gh = trimmed.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/
  );
  if (gh) {
    return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
  }

  return trimmed;
}
