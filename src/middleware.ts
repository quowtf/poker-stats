import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Admin UI routes require authenticated admin session
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!req.auth) {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const role = (req.auth.user as { role?: string })?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // API poker write routes (POST/PUT/DELETE) require API key or admin session
  if (pathname.startsWith("/api/poker") && req.method !== "GET") {
    const authHeader = req.headers.get("authorization");
    const apiKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    const hasValidApiKey = apiKey === process.env.ADMIN_API_KEY;
    const hasAdminSession =
      req.auth && (req.auth.user as { role?: string })?.role === "admin";

    if (!hasValidApiKey && !hasAdminSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/poker/:path*"],
};
