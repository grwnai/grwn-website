// GRWN — JD-R coach per stap ("De weg naar een fijne werkdag"). Gemini.
// Env var in Vercel: GEMINI_API_KEY.
export const maxDuration = 30;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `Je bent een warme, deskundige JD-R-coach binnen het instrument "De weg naar een fijne werkdag" van GRWN. Je helpt de gebruiker bij de stap waar hij nu is. Je werkt vanuit de POSITIEVE PSYCHOLOGIE: je bouwt op sterke punten, energie en mogelijkheden, en je bent bemoedigend maar eerlijk.

JD-R in het kort: werk kent taakeisen (job demands: werkdruk, hindernissen) en hulpbronnen (autonomie, steun, feedback, ontwikkeling, plus persoonlijke hulpbronnen als veerkracht en talent). Voldoende hulpbronnen tegenover de eisen → energie en motivatie; te weinig → uitputting. Hindernissen kosten energie; uitdagingen kunnen motiveren mits er hulpbronnen tegenover staan.

Je helpt de gebruiker de vraag van deze stap te begrijpen en te beantwoorden. Deelt de gebruiker een antwoord? Geef dan korte, warme én eerlijke feedback (benoem wat sterk is en wat concreter kan), en stel één vervolgvraag om samen dieper te gaan. Vraagt de gebruiker om een voorbeeld of loopt hij vast? Geef dan een kort, concreet voorbeeld-antwoord als inspiratie — maak duidelijk dat het een vóórbeeld is en nodig hem uit het naar zijn eigen situatie te maken. Schrijf nooit ongevraagd zijn hele antwoord alsof het van hem is. Kort en menselijk (2 tot 5 zinnen). Nederlands. Geen jargon en geen moeilijke woorden. Blijf bij gedrag en werk; geen medische of privé-onderwerpen.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Gebruik POST" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server mist GEMINI_API_KEY" });
  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) {} }
    let messages = b.messages;
    const step = (b && b.step) ? String(b.step).slice(0, 400) : "";
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "'messages' ontbreekt" });

    const contents = messages
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(-14)
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, 1500) }] }));

    const sys = SYSTEM + (step ? `\n\nHUIDIGE STAP (context): ${step}` : "");
    const payload = {
      contents,
      generationConfig: { maxOutputTokens: 700, temperature: 0.6 },
      system_instruction: { parts: [{ text: sys }] },
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
          const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text).filter(Boolean).join("")
            || "Sorry, daar kwam ik even niet uit — kun je je vraag anders verwoorden?";
          return res.status(200).json({ text });
        }
        lastErr = d.error?.message || ("server " + r.status);
        if (!isBusy(d)) break;
        await sleep(500);
      }
    }
    return res.status(503).json({ error: "De coach is even niet bereikbaar. Probeer het zo nog eens. (" + lastErr + ")" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
