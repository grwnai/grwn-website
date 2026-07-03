// GRWN — "De weg naar een fijne werkdag" · JD-R analyse. Gemini, sleutel server-side.
// Env var in Vercel: GEMINI_API_KEY (zelfde sleutel als de andere GRWN-tools).
export const maxDuration = 30;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een scherpe, ervaren organisatiepsycholoog en HR-analist die werkt volgens het Job Demands-Resources (JD-R) model. Je analyseert een ingevulde gespreksrapportage van het instrument "De weg naar een fijne werkdag".

JD-R in het kort:
- Werk kent TAAKEISEN (job demands): werkdruk, emotionele belasting, hindernissen/knelpunten.
- En HULPBRONNEN: werk-hulpbronnen (autonomie, steun van collega's/leiding, feedback, ontwikkelmogelijkheden) én persoonlijke hulpbronnen (zelfvertrouwen, veerkracht).
- Twee processen: (1) UITPUTTING — hoge eisen + te weinig hulpbronnen → stress en energieverlies; (2) MOTIVATIE — voldoende hulpbronnen → bevlogenheid en groei.
- Onderscheid HINDERNISSEN (hindering demands, kosten energie) en UITDAGINGEN (challenge demands, kunnen motiveren mits er hulpbronnen tegenover staan).

Analyseer de rapportage door deze JD-R-bril. Wees CONCREET, KRITISCH en EERLIJK — niet overdreven positief en geen loze complimenten. Verwijs naar wat de persoon letterlijk heeft ingevuld. Benoem eisen versus hulpbronnen expliciet, en of er balans is of niet.

Antwoord in het Nederlands, bondig en zakelijk, met precies deze koppen (gebruik "#"):
# Samenvatting
(2-3 zinnen: staat deze persoon vooral in het uitputtings- of het motivatieproces, en waarom.)
# Taakeisen
(Welke eisen en hindernissen benoemt de persoon, en hoe zwaar wegen die.)
# Hulpbronnen
(Welke hulpbronnen — werk én persoonlijk — zijn aanwezig of ontbreken juist.)
# Balans & risico
(Staan eisen en hulpbronnen in verhouding? Benoem het grootste risico of de grootste kans, feitelijk onderbouwd met de antwoorden.)
# Concrete stappen & vervolgvragen
(3 tot 5 praktische, actiegerichte punten: verhoog hulpbronnen of verlaag/hanteer eisen; plus scherpe vervolgvragen bij wat vaag bleef.)

Verzin niets bij; werk uitsluitend met wat is ingevuld. Zijn er veel lege of vage velden, benoem dat kort en zeg welke aanvulling het meeste inzicht zou geven. Dit is een hulpmiddel, geen oordeel over de persoon.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });

  try {
    let body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) {} }
    const report = (body && body.report) || "";
    if (!String(report).trim()) return res.status(400).json({ error: "Lege rapportage" });

    const payload = {
      contents: [{ role: "user", parts: [{ text: String(report).slice(0, 12000) }] }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.5 },
      system_instruction: { parts: [{ text: SYSTEM }] },
    };

    const isBusy = (o) => /503|429|overload|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(JSON.stringify(o || ""));
    let lastErr = "AI tijdelijk niet bereikbaar";

    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let r, d;
        try {
          r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
          );
          d = await r.json();
        } catch (e) { lastErr = e.message; await sleep(600); continue; }
        if (r.ok) {
          const text = (d.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text).filter(Boolean).join("").trim();
          if (text) return res.status(200).json({ text });
          lastErr = (d.candidates?.[0]?.finishReason) || "leeg antwoord";
          break;
        }
        lastErr = d.error?.message || ("server " + r.status);
        if (!isBusy(d)) break;
        await sleep(600);
      }
    }
    return res.status(503).json({ error: "De analyse lukte niet: " + lastErr });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
