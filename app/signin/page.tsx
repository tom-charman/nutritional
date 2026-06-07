import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

/**
 * Branded sign-in page (replaces the default Auth.js one). A bare unbranded
 * page with a lone "Sign in with Google" button on a personal domain reads
 * as a lookalike-login to Chrome's client-side phishing classifier; giving
 * the page real identity (title, copy, app chrome) removes that signal.
 */
export const metadata = {
  title: "Sign in — Nutritional Tracker",
};

/** Only same-origin paths; anything absolute falls back to home. */
function safeCallbackUrl(raw: string | string[] | undefined): string {
  const url = Array.isArray(raw) ? raw[0] : raw;
  if (url && url.startsWith("/") && !url.startsWith("//")) return url;
  return "/";
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
    <div className="page-header" style={{ maxWidth: 560, margin: "80px auto" }}>
      <div className="card">
        <div className="card-body">
          <h1>Nutritional Tracker</h1>
          <p>
            A personal nutrition log — food entries, daily targets, and weight
            tracking. This is a private instance: access is limited to
            authorized accounts.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl });
            }}
          >
            <button type="submit" className="btn-primary btn">
              Continue with Google
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
