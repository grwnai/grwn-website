// LVL UP feedback-backend — verzamelt feedback van spelers tijdens het spelen.
// Slaat op in Supabase. Env (al gezet via de integratie): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
export const config = { maxDuration: 10 };

const DB_URL = process.env.SUPABASE_URL;
const DB_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!DB_URL || !DB_KEY) {
    return res.status(200).json({ ok: false, reason: "no-db", feedback: [] });
  }
  const h = { apikey: DB_KEY, Authorization: "Bearer " + DB_KEY, "Content-Type": "application/json" };

  try {
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const msg = (b.message || "").toString().trim();
      if (!msg) return res.status(400).json({ ok: false, reason: "empty" });
      const row = {
        player_id: (b.playerId || "anon").toString().slice(0, 64),
        name: (b.name || "Speler").toString().slice(0, 60),
        level: Math.max(1, Math.min(10, parseInt(b.level, 10) || 1)),
        message: msg.slice(0, 2000),
        created_at: new Date().toISOString(),
      };
      const r = await fetch(`${DB_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(200).json({ ok: false, reason: "db", detail: t.slice(0, 200) });
      }

      // Stuur ook een e-mail (graceful: slaat over als er geen Resend-sleutel is).
      try {
        const RESEND_KEY = process.env.RESEND_API_KEY;
        if (RESEND_KEY) {
          const TO = process.env.FEEDBACK_EMAIL || "dennisgloudemans@gmail.com";
          const FROM = process.env.FROM_EMAIL || "LVL UP <onboarding@resend.dev>";
          const esc = (x) => String(x).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: FROM,
              to: [TO],
              subject: "Nieuwe LVL UP-feedback van " + row.name,
              html:
                "<h2>Nieuwe feedback in LVL UP</h2>" +
                "<p><b>Speler:</b> " + esc(row.name) + " &middot; <b>Level:</b> " + row.level + "</p>" +
                "<p style=\"font-size:16px;border-left:3px solid #ff4fa3;padding-left:12px\">" + esc(row.message) + "</p>" +
                "<p style=\"color:#888;font-size:12px\">" + new Date().toLocaleString("nl-NL") + "</p>",
            }),
          });
        }
      } catch (e) { /* mail mag falen zonder de feedback te blokkeren */ }

      return res.status(200).json({ ok: true });
    }

    if (req.method === "GET") {
      const top = Math.min(parseInt(req.query.top || "50", 10) || 50, 200);
      const r = await fetch(
        `${DB_URL}/rest/v1/feedback?select=*&order=created_at.desc&limit=${top}`,
        { headers: h }
      );
      const rows = await r.json();
      return res.status(200).json({ ok: true, feedback: Array.isArray(rows) ? rows : [] });
    }

    return res.status(405).json({ ok: false, reason: "method" });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "err", detail: String(e).slice(0, 200) });
  }
}
