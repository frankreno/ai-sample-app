import { NextRequest, NextResponse } from "next/server";

// Allow ChatGPT's widget sandbox and any other cross-origin callers to reach
// the REST API. The sandbox origin looks like:
//   https://connector_<hash>.web-sandbox.oaiusercontent.com
export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Pass through and attach CORS headers to the real response
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export const config = {
  matcher: "/api/:path*",
};
