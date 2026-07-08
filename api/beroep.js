// LVL UP — bepaalt met zekerheid het EXACTE beroep van de gebruiker, zodat de
// coach specifieke content kan aanbieden. Gemini, sleutel server-side (GEMINI_API_KEY).
export const maxDuration = 20;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je helpt een leerplatform het EXACTE beroep van de gebruiker vaststellen, zodat AI-content precies past bij zijn werk. Je krijgt een vrij ingevulde functie/rol en (optioneel) een sector.

Bepaal het meest specifieke, realistische beroep.
- Is de invoer al eenduidig en specifiek (bijv. "tandarts", "wijkverpleegkundige", "front-end developer"), zet "zeker" op true, en laat "vraag" en "opties" leeg.
- Is de invoer te breed of dubbelzinnig (bijv. "docent", "manager", "consultant", "monteur", "adviseur", "medewerker"), zet "zeker" op false, geef ÉÉN korte, concrete verduidelijkingsvraag ("vraag"), en 2 tot 4 concrete beroepsopties ("opties") die het meest waarschijnlijk zijn gezien de sector.
- "beroep" = jouw beste, meest specifieke inschatting van de functietitel (bijv. "Docent biologie in het voortgezet onderwijs"). Vul dit altijd in.
- "context" = 2 tot 4 zinnen met de typische dagelijkse taken en werkzaamheden van dit beroep, concreet genoeg zodat een AI-coach herkenbare voorbeelden en opdrachten kan maken.

Antwoord in het Nederlands. Wees concreet en realistisch.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const functie = (b && b.functie) || "";
    const sector = (b && b.sector) || "";
    if (!String(functie).trim()) return res.status(400).json({ error: "Geen functie meegegeven" });

    const userText = "Ingevulde functie/rol: " + String(functie).slice(0, 300) + "\nSector/organisatie: " + (String(sector).slice(0, 300) || "(niet ingevuld)");
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 500, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            beroep: { type: "string" },
            zeker: { type: "boolean" },
            vraag: { type: "string" },
            opties: { type: "array", items: { type: "string" } },
            context: { type: "string" },
          },
          required: ["beroep", "zeker", "context"],
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
          if (obj && obj.beroep) {
            return res.status(200).json({
              beroep: String(obj.beroep || ""),
              zeker: !!obj.zeker,
              vraag: String(obj.vraag || ""),
              opties: Array.isArray(obj.opties) ? obj.opties.map((s) => String(s)).filter(Boolean).slice(0, 4) : [],
              context: String(obj.context || ""),
            });
          }
          break;
        }
        if (!isBusy(d)) break;
        await sleep(400);
      }
    }
    return res.status(503).json({ error: "Beroep bepalen lukte niet" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
