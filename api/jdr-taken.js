// GRWN — JD-R taakextractie. Haalt taken/situaties uit een werkbeschrijving. Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 30;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een JD-R-analist. Je krijgt een beschrijving van iemands werkdag en werksituatie. Haal hier de belangrijkste TAKEN, WERKZAAMHEDEN en terugkerende SITUATIES uit die de persoon noemt of duidelijk impliceert.

Wees RUIMHARTIG: liever een paar taken te veel dan te weinig — de gebruiker kan er zelf verwijderen. Pak dus ook taken die maar kort genoemd worden. Als de beschrijving heel kort of vaag is, maak dan een korte, redelijke inschatting van de taken die er logisch bij horen.

Formuleer elke taak kort en concreet (2 tot 6 woorden), in de taal van de gebruiker. Geef er 3 tot 8. Verzin geen totaal andere dingen; blijf dicht bij de beschrijving.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const tekst = (b && b.werksituatie) || "";
    if (!String(tekst).trim()) return res.status(400).json({ error: "Vul eerst je werkdag in, dan haal ik de taken eruit." });

    const payload = {
      contents: [{ role: "user", parts: [{ text: "Werkbeschrijving:\n" + String(tekst).slice(0, 6000) }] }],
      generationConfig: {
        maxOutputTokens: 700,
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { taken: { type: "array", items: { type: "string" } } },
          required: ["taken"],
        },
      },
      system_instruction: { parts: [{ text: SYSTEM }] },
    };
    const isBusy = (o) => /503|429|overload|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(JSON.stringify(o || ""));
    let lastErr = "AI niet bereikbaar";

    function parseTaken(text) {
      if (!text) return [];
      let obj;
      try { obj = JSON.parse(text); } catch (e) {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
      }
      let arr = obj && Array.isArray(obj.taken) ? obj.taken : (Array.isArray(obj) ? obj : null);
      if (!arr) {
        // laatste redmiddel: regels/bullets uit platte tekst halen
        arr = text.split(/\n+/).map((l) => l.replace(/^["'\-\*\d\.\)\s]+/, "").replace(/["',]+$/, "").trim()).filter((l) => l && l.length < 80);
      }
      return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
    }

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
          const taken = parseTaken(text);
          if (taken.length) return res.status(200).json({ taken });
          lastErr = "geen taken gevonden";
          break; // volgende model proberen
        }
        lastErr = d.error?.message || ("server " + r.status);
        if (!isBusy(d)) break;
        await sleep(500);
      }
    }
    return res.status(200).json({ taken: [], note: lastErr });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
