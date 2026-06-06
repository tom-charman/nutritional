import { auth, isAuthorizedEmail } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Protect everything except auth endpoints, the denied page, and static
 * assets. Unauthenticated → Google sign-in; authenticated but not
 * allowlisted → /denied.
 */
/**
 * Local-only auth bypass for development and e2e testing (AUTH_DISABLED=true).
 * Refuses to activate in production builds.
 */
const AUTH_DISABLED =
  process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

export default auth((req) => {
  if (AUTH_DISABLED) return NextResponse.next();
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/denied" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/textures") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const email = req.auth?.user?.email;
  if (!req.auth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }
  if (!isAuthorizedEmail(email)) {
    return NextResponse.redirect(new URL("/denied", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
