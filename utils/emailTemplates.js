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

const OTP_TEXTS = {
  en: {
    subject: (code) => `${code} is your FarmPaisa verification code`,
    heading: 'Verify your email',
    greeting: (name) => `Hi ${name},`,
    intro: 'Enter this code in FarmPaisa to verify your email address:',
    expiry: 'The code is valid for 10 minutes.',
    ignore: "If you didn't create a FarmPaisa account, you can ignore this email."
  },
  hi: {
    subject: (code) => `${code} आपका FarmPaisa सत्यापन कोड है`,
    heading: 'अपना ईमेल सत्यापित करें',
    greeting: (name) => `नमस्ते ${name},`,
    intro: 'अपना ईमेल पता सत्यापित करने के लिए FarmPaisa में यह कोड डालें:',
    expiry: 'यह कोड 10 मिनट तक मान्य है।',
    ignore: 'अगर आपने FarmPaisa खाता नहीं बनाया है, तो इस ईमेल को अनदेखा करें।'
  },
  pa: {
    subject: (code) => `${code} ਤੁਹਾਡਾ FarmPaisa ਪੁਸ਼ਟੀ ਕੋਡ ਹੈ`,
    heading: 'ਆਪਣੀ ਈਮੇਲ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ',
    greeting: (name) => `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${name},`,
    intro: 'ਆਪਣੇ ਈਮੇਲ ਪਤੇ ਦੀ ਪੁਸ਼ਟੀ ਲਈ FarmPaisa ਵਿੱਚ ਇਹ ਕੋਡ ਭਰੋ:',
    expiry: 'ਇਹ ਕੋਡ 10 ਮਿੰਟ ਲਈ ਵੈਧ ਹੈ।',
    ignore: 'ਜੇ ਤੁਸੀਂ FarmPaisa ਖਾਤਾ ਨਹੀਂ ਬਣਾਇਆ, ਤਾਂ ਇਸ ਈਮੇਲ ਨੂੰ ਅਣਡਿੱਠਾ ਕਰੋ।'
  }
};

// The email verification code, in the user's language
export function otpEmailTemplate({ code, name, language }) {
  const t = OTP_TEXTS[language] ?? OTP_TEXTS.en;
  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(t.greeting(name))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(t.intro)}</p>
    <div style="margin:0 0 16px;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#14532d;font-family:Menlo,Consolas,monospace;">${code}</div>
    <p style="margin:0 0 8px;">${escapeHtml(t.expiry)}</p>
    <p style="margin:0;color:#6b7280;font-size:13px;">${escapeHtml(t.ignore)}</p>`;
  const text = [t.greeting(name), '', t.intro, '', code, '', t.expiry, t.ignore].join('\n');
  return { subject: t.subject(code), html: layout({ heading: escapeHtml(t.heading), bodyHtml }), text };
}

const ANNOUNCEMENT_TEXTS = {
  en: { greeting: (name) => `Hi ${name},`, unsubscribe: 'Unsubscribe from announcement emails', unsubscribeNote: "You're receiving this because you have a FarmPaisa account." },
  hi: { greeting: (name) => `नमस्ते ${name},`, unsubscribe: 'घोषणा वाले ईमेल बंद करें', unsubscribeNote: 'आपको यह ईमेल इसलिए मिला है क्योंकि आपका FarmPaisa खाता है।' },
  pa: { greeting: (name) => `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${name},`, unsubscribe: 'ਘੋਸ਼ਣਾ ਵਾਲੀਆਂ ਈਮੇਲਾਂ ਬੰਦ ਕਰੋ', unsubscribeNote: 'ਤੁਹਾਨੂੰ ਇਹ ਈਮੇਲ ਇਸ ਲਈ ਮਿਲੀ ਹੈ ਕਿਉਂਕਿ ਤੁਹਾਡਾ FarmPaisa ਖਾਤਾ ਹੈ।' }
};

// {{name}} in the admin's text becomes the user's name
export function fillName(text, name) {
  return String(text).replace(/\{\{\s*name\s*\}\}/gi, name);
}

// An admin announcement: the admin's subject and message plus a greeting and an
// unsubscribe link in the user's language. Text is escaped; newlines become <br>.
export function announcementEmailTemplate({ subject, body, name, language, unsubscribeUrl }) {
  const t = ANNOUNCEMENT_TEXTS[language] ?? ANNOUNCEMENT_TEXTS.en;
  const finalSubject = fillName(subject, name);
  const finalBody = fillName(body, name);
  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(t.greeting(name))}</p>
    <div style="margin:0 0 20px;">${escapeHtml(finalBody).replace(/\n/g, '<br>')}</div>
    <p style="margin:0;color:#9ca3af;font-size:12px;">${escapeHtml(t.unsubscribeNote)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;">${escapeHtml(t.unsubscribe)}</a></p>`;
  const text = [t.greeting(name), '', finalBody, '', '--', t.unsubscribeNote, `${t.unsubscribe}: ${unsubscribeUrl}`].join('\n');
  return { subject: finalSubject, html: layout({ heading: escapeHtml(finalSubject), bodyHtml }), text };
}
