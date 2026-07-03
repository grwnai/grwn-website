// GRWN — JD-R taakextractie. Haalt terugkerende taken/situaties uit een werkbeschrijving. Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 30;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een JD-R-analist. Je krijgt een beschrijving van iemands werkdag en werksituatie. Haal hieruit de belangrijkste TERUGKERENDE, repetitieve taken of situaties (niet eenmalige dingen). Formuleer ze kort en concreet (max ~8 woorden), in de taal van de gebruiker.

Antwoord UITSLUITEND met geldige JSON, exact:
{"taken":["korte taak 1","korte taak 2","..."]}

Geef 3 tot 7 taken. Verzin niets wat er niet staat; blijf dicht bij de beschrijving. Geen extra tekst buiten de JSON.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const tekst = (b && b.werksituatie) || "";
    if (!String(tekst).trim()) return res.status(400).json({ error: "Lege werkbeschrijving" });

    const payload = {
      contents: [{ role: "user", parts: [{ text: String(tekst).slice(0, 6000) }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      system_instruction: { parts: [{ text: SYSTEM }] },
    };
    const isBusy = (o) => /503|429|overload|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(JSON.stringify(o || ""));
    let lastErr = "AI niet bereikbaar";
    for (const model of MODELS) {
      for (let a = 0; a < 2; a++) {
        let r, d;
        try {
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          d = await r.json();
        } catch (e) { lastErr = e.message; await sleep(500); continue; }
        if (r.ok) {
          const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("");
          let obj; const m = text.match(/\{[\s\S]*\}/);
          try { obj = JSON.parse(m ? m[0] : text); } catch (e) {}
          const taken = (obj && Array.isArray(obj.taken)) ? obj.taken.map((s) => String(s).trim()).filter(Boolean).slice(0, 8) : [];
          return res.status(200).json({ taken });
        }
        lastErr = d.error?.message || ("server " + r.status);
        if (!isBusy(d)) break;
        await sleep(500);
      }
    }
    return res.status(503).json({ error: "Taken ophalen lukte niet: " + lastErr });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
