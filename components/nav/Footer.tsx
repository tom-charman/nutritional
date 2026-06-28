import Link from "next/link";

/**
 * Site-wide footer. Carries the privacy + contact links required by the privacy
 * notice, on every page (including under the consent gate and on the public
 * sign-in / denied screens).
 */
export default function Footer() {
  return (
    <footer className="site-footer">
      <Link href="/privacy">Privacy</Link>
      <span aria-hidden="true">·</span>
      <Link href="/contact">Contact</Link>
    </footer>
  );
}
