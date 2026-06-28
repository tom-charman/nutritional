import Link from "next/link";
import { giveConsentAction } from "@/app/actions/consent";
import { signOutAction } from "@/app/actions/auth";

/**
 * Full-screen explicit-consent gate (GDPR Article 9). Rendered by the root
 * layout in place of the app whenever the signed-in user has not consented to
 * the current privacy notice. The app stores health-revealing data (weights,
 * food logs, macro targets, meal plans), so consent is collected before any of
 * it is shown or accepted. Declining signs the user out — nothing is processed
 * without consent.
 */
export default function ConsentGate() {
  return (
    <div className="page-header" style={{ maxWidth: 620, margin: "80px auto" }}>
      <div className="card">
        <div className="card-body">
          <h1>Before you start</h1>
          <p>
            Nutritional records information that can reveal your health — your
            body weight, the food you log, your calorie and nutrient targets, and
            your meal plans. Under UK GDPR this is treated as{" "}
            <strong>special category (health) data</strong>, and we ask for your
            explicit consent before processing it.
          </p>
          <p>
            We use this data only to provide the tracking features you ask for.
            We do not sell it or use it for profiling. You can export or delete
            your data at any time — see the{" "}
            <Link href="/privacy">privacy notice</Link> for the full detail,
            including how to contact us and the lawful bases we rely on.
          </p>
          <div className="denied-actions">
            <form action={giveConsentAction}>
              <button type="submit" className="btn-primary btn">
                I consent — continue
              </button>
            </form>
            <form action={signOutAction}>
              <button type="submit" className="btn-secondary">
                Decline &amp; sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
