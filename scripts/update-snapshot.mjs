#!/usr/bin/env node
/**
 * Refreshes the offline baseline embedded in index.html.
 *
 *   node scripts/update-snapshot.mjs [season]
 *
 * The page always tries ESPN first; this snapshot is what it falls back to when
 * the network is unavailable, so a freshly cloned or emailed index.html still
 * opens with a full season in it. Run it whenever you want the committed file to
 * reflect current results (the GitHub Action does this daily).
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = join(ROOT, "index.html");
const LEAGUE = "usa.nwsl";

const season = Number(process.argv[2]) || new Date().getUTCFullYear();
const url =
  `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/scoreboard` +
  `?limit=1000&dates=${season}0101-${season}1231`;

// Keep in sync with parseESPN() in index.html.
function parseESPN(json, year) {
  const teams = {}, matches = [];
  for (const ev of json.events || []) {
    const c = (ev.competitions || [])[0];
    if (!c || !c.competitors || c.competitors.length < 2) continue;
    if (ev.season?.slug && ev.season.slug !== "regular-season") continue;

    const home = c.competitors.find(x => x.homeAway === "home");
    const away = c.competitors.find(x => x.homeAway === "away");
    if (!home || !away) continue;

    for (const side of [home, away]) {
      const t = side.team;
      teams[t.id] ??= {
        id: t.id,
        name: t.displayName,
        short: t.shortDisplayName || t.displayName,
        abbr: t.abbreviation || (t.displayName || "").slice(0, 3).toUpperCase(),
        logo: t.logos?.[0]?.href || t.logo ||
              `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`
      };
    }
    const st = c.status?.type ?? {};
    const state = st.completed ? "F" : st.state === "in" ? "L" : "S";
    const num = v => (v === undefined || v === null || v === "") ? null : Number(v);

    matches.push({
      id: ev.id,
      date: ev.date,
      home: home.team.id,
      away: away.team.id,
      hs: state === "S" ? null : num(home.score),
      as: state === "S" ? null : num(away.score),
      state,
      venue: c.venue?.fullName || undefined
    });
  }
  matches.sort((a, b) => a.date.localeCompare(b.date));
  return { season: year, updated: new Date().toISOString(), teams, matches };
}

const res = await fetch(url);
if (!res.ok) {
  console.error(`ESPN returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const snap = parseESPN(await res.json(), season);
if (!snap.matches.length) {
  console.error(`No regular-season matches found for ${season}; leaving index.html alone.`);
  process.exit(1);
}

const html = await readFile(HTML, "utf8");
const re = /(<script type="application\/json" id="snapshot">)([\s\S]*?)(<\/script>)/;
if (!re.test(html)) {
  console.error("Could not find the #snapshot block in index.html.");
  process.exit(1);
}
// $ in replacement strings is special — pass a function so scores survive verbatim.
const next = html.replace(re, (_, open, __, close) => open + JSON.stringify(snap) + close);
await writeFile(HTML, next);

const played = snap.matches.filter(m => m.state === "F").length;
console.log(
  `Snapshot updated: ${season} — ${Object.keys(snap.teams).length} teams, ` +
  `${played}/${snap.matches.length} matches played.`
);
