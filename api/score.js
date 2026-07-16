// LVL UP score-backend — leaderboard + doorlopende AI-score.
// Slaat scores op in Supabase (Postgres) en levert de leaderboard.
// Env (zet in Vercel): SUPABASE_URL, SUPABASE_KEY (service_role key).
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

  // Geen database geconfigureerd: vriendelijk leeg antwoord, niets crasht.
  if (!DB_URL || !DB_KEY) {
    return res.status(200).json({ ok: false, reason: "no-db", leaderboard: [], me: null });
  }

  const h = { apikey: DB_KEY, Authorization: "Bearer " + DB_KEY, "Content-Type": "application/json" };

  try {
    if (req.method === "GET") {
      const top = Math.min(parseInt(req.query.top || "10", 10) || 10, 50);
      const r = await fetch(`${DB_URL}/rest/v1/leaderboard_v?select=*&order=total.desc&limit=${top}`, { headers: h });
      const rows = await r.json();
      let me = null;
      if (req.query.player) {
        const pr = await fetch(
          `${DB_URL}/rest/v1/leaderboard_v?select=*&player_id=eq.${encodeURIComponent(req.query.player)}`,
          { headers: h }
        );
        const pd = await pr.json();
        me = Array.isArray(pd) && pd[0] ? pd[0] : null;
      }
      return res.status(200).json({ ok: true, leaderboard: Array.isArray(rows) ? rows : [], me });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!b.playerId) return res.status(400).json({ ok: false, reason: "no-player" });
      const row = {
        player_id: String(b.playerId).slice(0, 64),
        game: String(b.game || "lvlup").slice(0, 32),
        name: String(b.name || "Speler").slice(0, 60),
        team: String(b.team || "").slice(0, 60),
        score: Math.max(0, Math.min(1000000, parseInt(b.score, 10) || 0)),
        level: Math.max(1, Math.min(10, parseInt(b.level, 10) || 1)),
        updated_at: new Date().toISOString(),
      };
      const r = await fetch(`${DB_URL}/rest/v1/scores?on_conflict=player_id,game`, {
        method: "POST",
        headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(200).json({ ok: false, reason: "db", detail: t.slice(0, 200) });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, reason: "method" });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "err", detail: String(e).slice(0, 200) });
  }
}
