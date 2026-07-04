// JDR — gebundelde router (jdr-coach + jdr-taken + jdr-prioriteit in één function).
// Reden: Vercel Hobby staat max 12 serverless functions toe. De originele code staat
// ongewijzigd in _jdr-coach.js / _jdr-taken.js / _jdr-prioriteit.js (underscore-prefix
// = telt niet mee als function). De oude URLs blijven werken via rewrites in vercel.json.
//
// TERUGSPLITSEN (bijv. na upgrade naar Vercel Pro):
// 1. hernoem _jdr-coach.js → jdr-coach.js (idem taken/prioriteit)
// 2. verwijder dit bestand en de drie /api/jdr-* rewrites uit vercel.json
export const maxDuration = 30;

import coach from "./_jdr-coach.js";
import taken from "./_jdr-taken.js";
import prioriteit from "./_jdr-prioriteit.js";

export default async function handler(req, res) {
  const fn = (req.query && req.query.fn ? req.query.fn : "").toString();
  if (fn === "coach") return coach(req, res);
  if (fn === "taken") return taken(req, res);
  if (fn === "prioriteit") return prioriteit(req, res);
  return res.status(404).json({ error: "Onbekende functie: gebruik ?fn=coach|taken|prioriteit" });
}
