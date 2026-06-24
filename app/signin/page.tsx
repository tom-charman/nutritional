import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

/**
 * Branded sign-in page (replaces the default Auth.js one). A bare unbranded
 * page with a lone "Sign in with Google" button on a personal domain reads
 * as a lookalike-login to Chrome's client-side phishing classifier; giving
 * the page real identity (title, copy, app chrome) removes that signal.
 */
export const metadata = {
  title: "Sign in — Nutritional",
};

/** Only same-origin paths; anything absolute falls back to home. */
function safeCallbackUrl(raw: string | string[] | undefined): string {
  const url = Array.isArray(raw) ? raw[0] : raw;
  if (url && url.startsWith("/") && !url.startsWith("//")) return url;
  return "/entry"; // Daily Entry is the landing surface
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  if (session?.user) redirect(callbackUrl);

  return (
    <div className="signin-screen">
      <div className="signin-card">
        <h1 className="signin-title">Nutritional</h1>
        <div className="signin-rule" />
        <p className="signin-tagline">For people who read the label.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button type="submit" className="signin-google">
            <svg className="signin-google-mark" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
              />
              <path
                fill="#FBBC05"
                d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
              />
            </svg>
            Continue with Google
          </button>
        </form>
        <p className="signin-note">By invitation only.</p>
      </div>
    </div>
  );
}
