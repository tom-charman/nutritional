/**
 * Server-only outbound email via Gmail SMTP (nodemailer).
 *
 * The only thing the app emails is a notification when someone submits a
 * privacy request through the contact form — delivered to PRIVACY_CONTACT_TO,
 * an address that is NEVER exposed to the site. Google is already a
 * sub-processor (SSO), so SMTP via Gmail adds no new vendor.
 *
 * Configuration is read lazily so `next build` and tests never need the
 * credentials. If SMTP is not configured, sendPrivacyRequestEmail throws and
 * the caller treats the request as stored-but-not-notified (the DB row is the
 * source of truth — see app/actions/privacy.ts).
 */
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("SMTP is not configured (SMTP_USER / SMTP_PASS unset)");
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user, pass },
  });
  return transporter;
}

export interface PrivacyRequestEmail {
  requestType: string;
  requesterEmail: string;
  message: string;
}

/** Notify the controller of a new privacy request. Throws if SMTP is unset/fails. */
export async function sendPrivacyRequestEmail(
  req: PrivacyRequestEmail,
): Promise<void> {
  const to = process.env.PRIVACY_CONTACT_TO;
  if (!to) throw new Error("PRIVACY_CONTACT_TO is not configured");

  const from = process.env.SMTP_USER as string; // present — getTransport validated it
  const subject = `[Nutritional] Privacy request: ${req.requestType}`;
  const text = [
    `Type:    ${req.requestType}`,
    `From:    ${req.requesterEmail}`,
    "",
    req.message,
  ].join("\n");

  await getTransport().sendMail({
    from,
    to,
    replyTo: req.requesterEmail,
    subject,
    text,
  });
}
