// GRWN — JD-R: concrete eisen/belemmeringen van een taak (voor de afweging-stap). Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 20;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een JD-R-analist. Je krijgt één hinderlijke taak en wat context over iemands werk. Benoem de belangrijkste TAAKEISEN / BELEMMERINGEN (job demands) die deze taak concreet aan de persoon stelt — dus wat de taak lastig, zwaar of energievretend maakt.

Geef 3 tot 5 concrete, korte punten (elk 3 tot 9 woorden), in het Nederlands, in de taal van de gebruiker. Denk aan zaken als: tijdsdruk, onderbrekingen, emotionele belasting, onduidelijke verwachtingen, afhankelijkheid van anderen, gebrek aan overzicht, hoge foutgevoeligheid. Blijf concreet en dicht bij de taak; verzin geen oplossingen, alleen de eisen zelf.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const taak = (b && b.taak) || "";
    const werk = (b && b.werk) || "";
    if (!String(taak).trim()) return res.status(400).json({ error: "Geen taak meegegeven" });

    const userText = "Taak:\n" + String(taak).slice(0, 400) + "\n\nContext (werk):\n" + String(werk).slice(0, 2500);
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 400, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: { type: "object", properties: { eisen: { type: "array", items: { type: "string" } } }, required: ["eisen"] },
      },
      system_instruction: { parts: [{ text: SYSTEM }] },
    };
    const isBusy = (o) => /503|429|overload|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(JSON.stringify(o || ""));

    for (const model of MODELS) {
      for (let a = 0; a < 2; a++) {
        let r, d;
        try {
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
          d = await r.json();
        } catch (e) { await sleep(400); continue; }
        if (r.ok) {
          const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("");
          let obj; try { obj = JSON.parse(text); } catch (e) { const m = text.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} } }
          const arr = obj && Array.isArray(obj.eisen) ? obj.eisen.map((s) => String(s).trim()).filter(Boolean).slice(0, 5) : [];
          if (arr.length) return res.status(200).json({ eisen: arr });
          break;
        }
        if (!isBusy(d)) break;
        await sleep(400);
      }
    }
    return res.status(200).json({ eisen: [] });
  } catch (e) {
    return res.status(200).json({ eisen: [] });
  }
}
