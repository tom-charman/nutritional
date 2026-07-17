import ContactForm from "@/components/ContactForm";

/**
 * Public privacy-request / contact page. Reachable without authentication
 * (allowlisted in proxy.ts) so anyone can make a data-subject request or
 * complaint — including people who can't sign in.
 */
export const metadata = {
  title: "Contact & privacy requests — Nutritional",
};

export default function ContactPage() {
  return (
    <article className="legal-page">
      <h1>Contact &amp; privacy requests</h1>
      {/* The intro lives inside ContactForm so it's replaced by the confirmation
          on success (no stale "use this form to…" above the thank-you). */}
      <ContactForm />
    </article>
  );
}
