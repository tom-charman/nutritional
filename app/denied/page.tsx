import { auth, signOut } from "@/lib/auth";
import WaitlistButton from "@/components/WaitlistButton";

export default async function DeniedPage() {
  const session = await auth();
  const email = session?.user?.email;

  return (
    <div className="page-header" style={{ maxWidth: 560, margin: "80px auto" }}>
      <div className="card">
        <div className="card-body">
          <h1>Access Denied</h1>
          <p>
            {email
              ? `The account ${email} is not authorized to use this application.`
              : "You are not signed in."}
          </p>
          {email ? (
            <div className="denied-actions">
              <WaitlistButton />
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/signin" });
                }}
              >
                <button type="submit" className="btn-secondary">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <a href="/signin" className="btn-primary btn">
              Sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
