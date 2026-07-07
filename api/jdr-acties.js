// GRWN — JD-R: stel concrete acties voor op basis van eerdere input. Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 25;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een JD-R-coach die werkt vanuit job crafting (Tims & Bakker) en positieve psychologie. Je krijgt iemands gekozen taak en wat hij eerder heeft ingevuld over hulp vanuit zichzelf, hulp vanuit het werk en andere opties.

Stel 3 tot 4 CONCRETE, haalbare acties voor die direct voortbouwen op wat de persoon zelf heeft aangegeven. Elke actie is klein en uitvoerbaar (geen vage voornemens). Geef bij elke actie ook één "eerste_stap": de állerkleinste eerste stap die je vandaag of deze week kunt zetten.

Schrijf in het Nederlands, in de tweede persoon (je/jij), warm en concreet. Verwijs waar mogelijk naar wat de persoon zelf noemde. Geen jargon.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const veld = (n, v) => (v && String(v).trim() ? n + ": " + String(v).trim() + "\n" : "");
    const userText =
      veld("Gekozen taak", b.taak) + veld("Label", b.label) +
      veld("Hulp vanuit jezelf", b.hulp_zelf) + veld("Hulp vanuit werk", b.hulp_org) +
      veld("Om te versterken", b.ud_nodig) + veld("Andere opties", b.andere) +
      veld("Lange termijn", b.effect);
    if (!userText.trim()) return res.status(400).json({ error: "Te weinig input om acties voor te stellen" });

    const payload = {
      contents: [{ role: "user", parts: [{ text: userText.slice(0, 4000) }] }],
      generationConfig: {
        maxOutputTokens: 800, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: { acties: { type: "array", items: { type: "object", properties: { actie: { type: "string" }, eerste_stap: { type: "string" } }, required: ["actie", "eerste_stap"] } } },
          required: ["acties"],
        },
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
          const arr = obj && Array.isArray(obj.acties) ? obj.acties.filter((x) => x && x.actie).slice(0, 4) : [];
          if (arr.length) return res.status(200).json({ acties: arr });
          break;
        }
        if (!isBusy(d)) break;
        await sleep(400);
      }
    }
    return res.status(503).json({ error: "Kon geen acties ophalen" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
