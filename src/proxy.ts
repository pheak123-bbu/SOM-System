import { NextResponse, type NextRequest } from "next/server";

// Malicious attack signatures commonly found in fake API probes and scanners
const SUSPICIOUS_PATTERNS = [
  /\.\./,                  // Directory traversal
  /<script/i,              // XSS probe
  /%3cscript/i,            // URL-encoded XSS
  /etc\/passwd/i,          // Linux file probe
  /\.env/i,                // Env file probe
  /wp-admin|wp-login/i,    // WordPress scanner probe
  /\.php$/i,               // PHP probe on Node.js
  /\.git/i,                // Git repository probe
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Block suspicious scanner probes and fake requests immediately
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(pathname) || pattern.test(request.url)) {
      return new NextResponse(
        JSON.stringify({ error: "សំណើនេះត្រូវបានរារាំងដោយប្រព័ន្ធសុវត្ថិភាព (Suspicious request blocked)." }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
  }

  // 2. Prepare response with strict security headers
  const response = NextResponse.next();

  // Protect against MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Protect against clickjacking, but permit framing for OBS overlays
  if (!pathname.startsWith("/live-overlay")) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  // Modern referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Cross-site scripting filter
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Enforce HTTPS in production
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}

// Backward compatibility export
export const middleware = proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (som-mark.png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
