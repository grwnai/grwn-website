// GRWN — "De weg naar een fijne werkdag": feedback op de flow (score 1-5 + toelichting).
// Nu: logt naar de Vercel-functielogs. Voor structurele opslag kan hier later een
// database (bv. Supabase) of e-mail worden aangesloten.
export const maxDuration = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const score = Number(b && b.score) || null;
    const rec = {
      at: new Date().toISOString(),
      score,
      waarom: String((b && b.waarom) || "").slice(0, 2000),
      tekst: String((b && b.tekst) || "").slice(0, 4000),
      naam: String((b && b.naam) || "").slice(0, 120),
    };
    // Zichtbaar in de Vercel-logs van deze functie.
    console.log("GRWN-FEEDBACK", JSON.stringify(rec));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
