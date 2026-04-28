export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function corsPreflight(): Response {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export function jsonWithCors(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export async function methodNotAllowed(): Promise<Response> {
  return jsonWithCors({ error: "Method not allowed" }, 405);
}
