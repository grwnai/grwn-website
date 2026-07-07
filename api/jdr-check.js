// GRWN — JD-R antwoordcheck. Kijkt of een antwoord de gestelde vraag beantwoordt. Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 20;
const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je controleert kort of iemands antwoord daadwerkelijk ingaat op de gestelde vraag in een reflectie-instrument over werk.

Wees SOEPEL en bemoedigend — dit is geen examen. Zet "ok" op true zodra het antwoord redelijk op de vraag ingaat, ook als het kort of simpel is. Zet "ok" alleen op false als het antwoord duidelijk niet bij de vraag past, leeg/nietszeggend is (bijv. "weet niet", "nvt", willekeurige tekens), of zó vaag is dat er niets mee te doen valt.

Als ok=false: geef in "tip" één korte, warme zin (max 20 woorden, Nederlands) die concreet zegt wat nog mist of hoe de persoon zijn antwoord kan aanscherpen. Als ok=true: laat "tip" leeg.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const vraag = (b && b.vraag) || "";
    const antwoord = (b && b.antwoord) || "";
    if (!String(antwoord).trim()) return res.status(200).json({ ok: false, tip: "Er is nog niets ingevuld." });

    const userText = "Vraag:\n" + String(vraag).slice(0, 600) + "\n\nAntwoord van de persoon:\n" + String(antwoord).slice(0, 2500);
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 200, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: { type: "object", properties: { ok: { type: "boolean" }, tip: { type: "string" } }, required: ["ok", "tip"] },
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
          if (obj && typeof obj.ok === "boolean") return res.status(200).json({ ok: obj.ok, tip: String(obj.tip || "") });
          // kon niet parsen -> fail-open (niet blokkeren)
          return res.status(200).json({ ok: true, tip: "" });
        }
        if (!isBusy(d)) break;
        await sleep(400);
      }
    }
    // fail-open zodat de gebruiker nooit vastloopt
    return res.status(200).json({ ok: true, tip: "" });
  } catch (e) {
    return res.status(200).json({ ok: true, tip: "" });
  }
}
