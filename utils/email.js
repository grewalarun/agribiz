import { Resend } from 'resend';

// Sender for all FarmPaisa emails. Set RESEND_FROM to override (must be on a domain
// verified in Resend).
const DEFAULT_FROM = 'FarmPaisa <noreply@farmpaisa.com>';

export class EmailError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'EmailError';
    this.status = status;
  }
}

let client = null;

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function getClient() {
  if (!isEmailConfigured()) {
    throw new EmailError(503, 'Email is not configured on the server (RESEND_API_KEY missing)');
  }
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Sends one email through Resend. Returns { id }; throws EmailError (503 when not
// configured, 502 when Resend rejects or can't be reached).
export async function sendEmail({ to, subject, html, text, replyTo }) {
  const resend = getClient();
  let result;
  try {
    result = await resend.emails.send({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to,
      subject,
      html,
      text,
      ...(replyTo && { replyTo })
    });
  } catch (error) {
    throw new EmailError(502, `Could not reach the email service: ${error.message}`);
  }
  if (result.error) {
    throw new EmailError(502, result.error.message || 'The email service rejected the email');
  }
  return { id: result.data?.id };
}
