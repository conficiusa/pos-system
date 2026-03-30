const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function HEAD() {
  return new Response(null, {
    status: 204,
    headers: NO_STORE_HEADERS,
  });
}

export function GET() {
  return Response.json(
    { ok: true, timestamp: Date.now() },
    {
      status: 200,
      headers: NO_STORE_HEADERS,
    },
  );
}
