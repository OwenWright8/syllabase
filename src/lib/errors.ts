const FALLBACK = "Something went wrong";

/**
 * A message a person can act on, from anything that was thrown or returned as an
 * error. supabase-js hands back database errors as plain objects ({ message,
 * details, hint, code }), not `Error`s, so checking only `instanceof Error`
 * turned every failed request into "Something went wrong" and hid the reason.
 */
export function errorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";
  const message = raw.trim();
  if (!message) return FALLBACK;
  // A reverse proxy or gateway error page (413, 502, 504...) arrives as HTML.
  if (/^<(!doctype|html|head|body|\?xml)/i.test(message)) {
    const title = message.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    return `The server answered with an error page${title ? ` (${title})` : ""} instead of data. If Syllabase is behind a reverse proxy, check its logs and limits.`;
  }
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}
