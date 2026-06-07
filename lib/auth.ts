import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth — Google OIDC with an email allowlist, replicating the dash-auth
 * behavior (auth_utils.py): emails compared lowercased/trimmed; an empty or
 * missing allowlist denies everyone.
 *
 * JWT sessions only — no database adapter, the existing schema is untouched.
 */
export function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && !e.startsWith("#")),
  );
}

export function isAuthorizedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = parseAllowlist(process.env.AUTHORIZED_EMAILS);
  return allowlist.has(email.trim().toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    error: "/denied",
  },
  callbacks: {
    authorized({ auth: session }) {
      // Used by middleware: require a session AND an allowlisted email.
      return isAuthorizedEmail(session?.user?.email);
    },
  },
});
