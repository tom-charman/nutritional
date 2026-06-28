import Link from "next/link";
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
      <p>
        Use this form to ask for a copy of your data, export or correct it,
        request deletion, withdraw consent, or make a complaint. We may need to
        verify your identity before acting, and we&rsquo;ll respond within one
        month. See the <Link href="/privacy">privacy notice</Link> for detail on
        your rights.
      </p>
      <ContactForm />
    </article>
  );
}
