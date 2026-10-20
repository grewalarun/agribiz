// HTML email building blocks. Email clients ignore <style> blocks and external CSS,
// so everything is inline. Any user-provided text must go through escapeHtml.

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

// Branded wrapper: green header with the FarmPaisa wordmark, white card, small footer
export function layout({ heading, bodyHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf9f5;font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ecebe4;">
          <tr><td style="background:#166534;padding:20px 24px;">
            <span style="font-size:22px;font-weight:800;color:#ffffff;">Farm</span><span style="font-size:22px;font-weight:800;color:#fde047;">Paisa</span>
            <div style="font-size:12px;color:#bbf7d0;margin-top:2px;">Farm expenses &amp; profit</div>
          </td></tr>
          <tr><td style="padding:24px;color:#1f2937;font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 12px;font-size:18px;color:#14532d;">${heading}</h1>
            ${bodyHtml}
          </td></tr>
          <tr><td style="padding:16px 24px;border-top:1px solid #f0efe9;color:#9ca3af;font-size:12px;">
            Sent by FarmPaisa · Made for Indian farmers 🇮🇳
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function testEmailTemplate({ subject, message, senderName, senderEmail }) {
  const safeMessage = message ? escapeHtml(message).replace(/\n/g, '<br>') : '';
  const bodyHtml = `
    <p style="margin:0 0 12px;">This is a test email from FarmPaisa. If you can read it, email sending works. ✅</p>
    ${safeMessage ? `<div style="margin:16px 0;padding:12px 14px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;">${safeMessage}</div>` : ''}
    <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">Sent by ${escapeHtml(senderName)} (${escapeHtml(senderEmail)}) from the FarmPaisa settings page.</p>`;

  const text = [
    'This is a test email from FarmPaisa. If you can read it, email sending works.',
    message ? `\n${message}\n` : '',
    `Sent by ${senderName} (${senderEmail}) from the FarmPaisa settings page.`
  ].join('\n');

  return { subject, html: layout({ heading: escapeHtml(subject), bodyHtml }), text };
}
