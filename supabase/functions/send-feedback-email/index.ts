import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const TO_EMAIL = 'moudiotis.meng@gmail.com';
const FROM_EMAIL = 'onboarding@resend.dev'; // Resend shared domain, works without verification
const ALLOWED_ORIGIN = 'https://www.vivon.top';
const MAX_MESSAGE_LEN = 5000;

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Require valid anon-key bearer token
  const auth = req.headers.get('authorization') ?? '';
  if (!SUPABASE_ANON_KEY || auth !== `Bearer ${SUPABASE_ANON_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    const body = await req.json();
    const { type, message, user_email, lang, app } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'No message provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LEN) {
      return new Response(JSON.stringify({ error: 'Message too long' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const typeLabel = type === 'bug' ? 'Πρόβλημα / Bug' : type === 'idea' ? 'Ιδέα / Idea' : 'Γενικό / General';

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">New Feedback — ${esc(String(app ?? 'VIVON'))}</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Type</td><td style="padding:8px;border:1px solid #e5e7eb">${esc(typeLabel)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">From</td><td style="padding:8px;border:1px solid #e5e7eb">${esc(String(user_email ?? 'anonymous'))}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Language</td><td style="padding:8px;border:1px solid #e5e7eb">${esc(String(lang ?? '—'))}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Message</td><td style="padding:8px;border:1px solid #e5e7eb;white-space:pre-wrap">${esc(message)}</td></tr>
        </table>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject: `[VIVON Feedback] ${typeLabel} from ${user_email ?? 'anonymous'}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
