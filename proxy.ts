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
  const { pathname } = req.nextUrl;

  // Expose the path to server components (the consent gate in app/layout.tsx
  // reads x-pathname to stay off /privacy and /contact). Set on every pass-through.
  const pass = () => {
    const headers = new Headers(req.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  };

  if (AUTH_DISABLED) return pass();

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/denied" ||
    pathname === "/signin" ||
    pathname === "/privacy" ||
    pathname === "/contact" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/textures") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/apple-icon.png"
  ) {
    return pass();
  }

  const email = req.auth?.user?.email;
  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }
  if (!isAuthorizedEmail(email)) {
    return NextResponse.redirect(new URL("/denied", req.nextUrl.origin));
  }
  return pass();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
