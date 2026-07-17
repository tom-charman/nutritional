import Link from "next/link";

/**
 * Public privacy notice. Source copy is kept in compliance/privacy-notice.md;
 * keep the two in sync. Reachable without authentication (allowlisted in
 * proxy.ts) so anyone — including people who can't sign in — can read it and
 * reach the request route.
 */
export const metadata = {
  title: "Privacy Notice — Nutritional",
};

export default function PrivacyPage() {
  return (
    <article className="legal-page">
      <h1>Privacy Notice</h1>
      <p className="legal-meta">Last updated 28 June 2026.</p>

      <p>
        This notice explains what personal data Nutritional (&ldquo;the
        app&rdquo;) collects, why, how long it is kept, and the rights you have
        over it. The app is a private, invitation-only nutrition tracker.
      </p>

      <h2>Who is responsible for your data</h2>
      <p>
        The data controller is <strong>Thomas Charman</strong>, who operates
        this app as an individual. You can reach the controller for any privacy
        matter — including access, export, correction, deletion, or a
        complaint — through the <Link href="/contact">contact form</Link>. We
        do not publish a direct email address; the form delivers your message
        privately.
      </p>

      <h2>What data we collect and where it comes from</h2>
      <ul>
        <li>
          <strong>Your email address and name</strong>, provided by Google when
          you sign in with your Google account (Single Sign-On). We receive only
          your verified email and display name.
        </li>
        <li>
          <strong>Waitlist email address</strong>, if you ask to join the
          waitlist from the access-denied screen.
        </li>
        <li>
          <strong>The data you enter in the app</strong>: food logs, body
          weights, calorie and nutrient targets, saved meals, and meal plans.
          Some of this can reveal information about your health.
        </li>
        <li>
          <strong>Privacy requests</strong> you submit through the contact form
          (the email you give us and your message).
        </li>
      </ul>

      <h2>Why we use it, and our lawful bases</h2>
      <ul>
        <li>
          <strong>Letting the right people in (access control).</strong> We
          compare your Google-verified email against an authorised-user list to
          operate a private app and prevent unauthorised access. Lawful basis:
          our <em>legitimate interests</em> in securing the app.
        </li>
        <li>
          <strong>Providing the tracking features.</strong> We store the food,
          weight, target, meal and plan data you enter because that is the
          service you are asking the app to perform. Lawful basis:{" "}
          <em>performance of the service you request</em>.
        </li>
        <li>
          <strong>Health-related data.</strong> Your food logs, weights,
          targets and plans may reveal information about your health, so we
          treat them as <em>special category data</em>. We rely on your{" "}
          <em>explicit consent</em> (UK GDPR Article 9(2)(a)), which we ask for
          the first time you use the app. You can withdraw consent at any time
          by asking us to delete your data; withdrawal does not affect
          processing carried out before you withdrew.
        </li>
        <li>
          <strong>Waitlist.</strong> If you join the waitlist, we keep your
          email to consider you for access. Lawful basis: your{" "}
          <em>consent</em>, given by choosing to join.
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We do not sell your data or use it for advertising or profiling. The app
        relies on a small number of service providers acting on our behalf:
      </p>
      <ul>
        <li>
          <strong>Google</strong> — for sign-in (Single Sign-On) and for
          delivering contact-form messages to us by email.
        </li>
        <li>
          <strong>Our hosting and database</strong> — the app and its
          PostgreSQL database run on a private server we control.
        </li>
      </ul>
      <p>
        Where a provider processes data outside the UK, we rely on the
        provider&rsquo;s standard data-protection terms and safeguards.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>App data</strong> (food, weight, targets, meals, plans) — kept
          until you ask us to delete it or your account is closed.
        </li>
        <li>
          <strong>Account email and name</strong> — kept while your account is
          active; removed when the account is deleted.
        </li>
        <li>
          <strong>Waitlist email</strong> — kept until you are invited or your
          request is declined.
        </li>
        <li>
          <strong>Privacy requests</strong> — kept as a record of how we handled
          your request (accountability), separate from your account.
        </li>
        <li>
          <strong>Backups</strong> — encrypted database backups are kept on a
          short rolling cycle; deleted data ages out of that cycle and is not
          restored into live use.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>ask for a copy of the personal data we hold about you (access);</li>
        <li>
          export your data in a machine-readable format — signed-in users can
          download all of their data as JSON or CSV from the account menu
          (portability);
        </li>
        <li>have inaccurate data corrected;</li>
        <li>have your data deleted (erasure);</li>
        <li>withdraw consent for health-data processing at any time.</li>
      </ul>
      <p>
        To exercise any of these, use the{" "}
        <Link href="/contact">contact form</Link>. We may need to verify your
        identity first, and we will respond within one month.
      </p>

      <h2>Complaints</h2>
      <p>
        If you are unhappy with how we handle your data, please tell us first
        through the <Link href="/contact">contact form</Link>{" "}so we can put
        it right. You also have the right to complain to the UK Information
        Commissioner&rsquo;s Office (ICO) at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer">
          ico.org.uk/make-a-complaint
        </a>
        .
      </p>
    </article>
  );
}
