// GRWN — JD-R prioritering: welke taak raakt het werkgeluk het meest? Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 30;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een JD-R-coach die werkt vanuit de positieve psychologie. Je krijgt iemands werkbeschrijving en een lijst taken (elk met een label: uitdagend = geeft energie, hinderlijk = kost energie).

Je helpt de persoon SAMEN kiezen welke ene taak hij het beste als eerste kan aanpakken om zijn WERKGELUK het meest te vergroten. De persoon weet dit zelf vaak niet goed, dus jij denkt mee — maar als een gelijkwaardige sparringpartner, niet als een baas. De uiteindelijke keuze is aan de persoon.

Weeg per taak drie dingen af:
1. HOE VAAK komt de taak voor (vaker = meer impact op de dag).
2. HOEVEEL energie kost of geeft de taak (hinderlijke taken die veel energie kosten, of uitdagende taken die veel energie kunnen geven).
3. HOEVEEL INVLOED de persoon er waarschijnlijk zelf op heeft (iets waar je iets aan kunt doen levert sneller resultaat op).

Kies de taak met de hoogste verwachte winst voor het werkgeluk. Wees concreet, warm en eerlijk — niet overdreven positief.

Onderbouwing-eisen (belangrijk):
- "advies": 2 tot 4 zinnen, in een warme, uitnodigende TOON. Formuleer het als een gezamenlijk voorstel om samen te wegen, niet als een bevel. Gebruik zinnen als "samen met jou zou ik kijken naar…" of "dit lijkt de meeste impact te hebben, maar jij kent je werk het best". Vermijd gebiedende taal als "Begin met…", "Je moet…" of "Kies…". Noem de voorgestelde taak en leg concreet uit WAAROM juist die het meeste lijkt op te leveren, met verwijzing naar frequentie, energie én beïnvloedbaarheid. Vermijd holle taal ("dit geeft energie"); maak het specifiek voor deze taak.
- "reden" per taak: 1 tot 2 zinnen die de drie factoren (hoe vaak / energie / invloed) benoemen voor díe taak, en waarom hij hoger of lager scoort dan de aanbevolen taak. Elke reden moet echt onderscheidend zijn — geen twee taken met bijna dezelfde tekst.
- Sorteer "ranking" van meest naar minst impact op werkgeluk.

Antwoord in het Nederlands. Gebruik in "ranking.taak" en in "aanbevolen" EXACT de taakteksten zoals aangeleverd.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    const werk = (b && b.werk) || "";
    const taken = (b && Array.isArray(b.taken)) ? b.taken : [];
    if (!taken.length) return res.status(400).json({ error: "Geen taken meegegeven" });

    const lijst = taken.map((t, i) => (i + 1) + ". " + (t.tekst || "") + (t.label ? " [" + t.label + "]" : " [nog geen label]")).join("\n");
    const userText = "Werkbeschrijving:\n" + String(werk).slice(0, 4000) + "\n\nTaken:\n" + lijst;

    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: 900,
        temperature: 0.5,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            aanbevolen: { type: "string" },
            advies: { type: "string" },
            ranking: {
              type: "array",
              items: {
                type: "object",
                properties: { taak: { type: "string" }, reden: { type: "string" } },
                required: ["taak", "reden"],
              },
            },
          },
          required: ["aanbevolen", "advies", "ranking"],
        },
      },
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
          let obj;
          try { obj = JSON.parse(text); } catch (e) { const m = text.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} } }
          if (obj && Array.isArray(obj.ranking) && obj.ranking.length) {
            return res.status(200).json({ aanbevolen: String(obj.aanbevolen || ""), advies: String(obj.advies || ""), ranking: obj.ranking.slice(0, 12) });
          }
          lastErr = "geen advies";
          break;
        }
        lastErr = d.error?.message || ("server " + r.status);
        if (!isBusy(d)) break;
        await sleep(500);
      }
    }
    return res.status(503).json({ error: "Advies ophalen lukte niet: " + lastErr });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
