/**
 * NextResponse.json() sends `application/json` with no charset. The bytes
 * are UTF-8 either way, but a browser opening the endpoint directly may
 * fall back to a legacy encoding to display it — which renders Turkish
 * text as mojibake ("İtalya" → "Ä°talya") and looks like corrupted data
 * when it isn't. Declaring the charset removes the ambiguity.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
