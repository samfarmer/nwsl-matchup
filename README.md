# NWSL Matchups

A single HTML file that shows the current NWSL table and, for any team you pick,
**every opponent it plays — home and away — with the score of each leg.**

- **Standings** computed from actual results (points, W/D/L, GF/GA, GD), with the
  top-8 playoff cut-off marked.
- **By opponent** — one row per opponent, a Home column and an Away column, so you
  can see at a glance who a team has played, where, and how it went.
- **Compare** — click an opponent and its own Home/Away columns appear beside the
  first team's, so you can read the two teams against a shared field. Click it again
  to drop it; add as many as you like. The column header says **click to compare**,
  and each pinned team gets a ✕ to remove it.
- **Schedule** — the same 30 matches in date order, grouped by month.
- Clear **H / A** badges everywhere: a filled badge for home, an outlined one for away.
- Result chips carry a **W / D / L letter as well as colour**, so they're readable
  without relying on colour alone.
- Pick the main team from the standings on the left. Light and dark themes.
  Deep-linkable, comparisons included: `index.html#season=2026&team=WAS&vs=NC,POR`.

## Running it

There is no build step, no dependencies, and no API key.

```
open index.html
```

That's it — double-click the file, or serve the folder with anything
(`python3 -m http.server`) and open it. It also works fine from GitHub Pages: push
the repo and enable Pages on the default branch.

## Remaining-schedule ratings

Pick a rating in the header and it appears as a column in the standings and under
each team's name in the matchup table — including compared teams, so their run-ins
sit side by side. It scores the matches each team has **left to play**. Two are
built in:

- **Opponent PPG** — average points-per-game of the opponents still to come.
- **Opponent PPG (venue)** — the same, but each opponent is judged on the form it
  shows where the match is played: its home record when you visit, its away record
  when it visits.

Higher means harder. The choice is remembered and deep-linkable:
`index.html#season=2026&team=WAS&rating=opp-venue-ppg`. **How the ratings work** at the
foot of the page explains each one in full — what it measures, why it's built that way,
and what it can't see — with the active one marked.

### Writing your own

A rating is a plugin. The optional `prepare(data, table)` builds any league-wide
state your formula needs (an Elo table, an SRS solve); `compute(ctx, state)` then
returns one number per team, or `null` for "no opinion". The page owns ranking and
formatting, so every rating — built-in or yours — reads the same way and can be
compared against the others.

```js
NWSLRating.register({
  id: "gd-weighted",                    // stable; this is what goes in the URL
  name: "Opponent GD",                  // picker label and tile heading
  abbr: "OGD",                          // standings column header; falls back to name
  blurb: "Average goal difference per game of the opponents still to play.",
  harderIsHigher: true,
  format: v => (v > 0 ? "+" : "") + v.toFixed(2),

  explain: [                            // paragraphs for the explanations section
    "Goal difference per game rather than points, so a team that wins narrowly and " +
    "one that wins by four are not treated as equally hard to face.",
    "It rewards blowouts, which flatter teams with soft schedules — read it next to " +
    "Opponent PPG rather than instead of it."
  ],

  prepare: (data, table) =>
    new Map(table.map(r => [r.id, r.gp ? r.gd / r.gp : 0])),

  compute: ({ remaining }, gdpg) =>
    remaining.length
      ? remaining.reduce((a, p) => a + gdpg.get(p.oppId), 0) / remaining.length
      : null
});
```

Give `abbr` a short string — it labels both the narrow standings column and the value
under each team's name in the matchup table, so it wants the same register as GP/GD/PTS.
The full `name` and `blurb` show up as the tooltip in both places.

`explain` is what the page prints in **How the ratings work**, and it's the place to say
the things a tooltip can't: what the number means, why you chose that denominator, what
it's blind to. It may be a single string, an array of paragraphs, or a **function**
returning either — a function is worth it when the text references a constant, since the
prose then can't drift from the code:

```js
const WINDOW = 6;
explain: () => [
  `Each opponent is scored on its last ${WINDOW} matches rather than the whole season.`,
  "Recent form reacts faster to a team turning its season around, at the cost of noise."
]
```

Paragraphs are inserted as text, not HTML, so markup in them is displayed rather than
interpreted. Omit `explain` and the section falls back to your `blurb`; if `explain`
throws, it falls back to the blurb too and logs a warning.

`compute` receives `{ teamId, row, table, data, remaining }`. `remaining` is the
team's unplayed matches seen from that team's side, so each entry carries `.oppId`
and `.isHome` — a home/away weighting is a one-line change. `NWSLRating.helpers`
exposes `remainingFor`, `pointsPerGame`, `venuePointsPerGame`, `perspective` and
`computeTable` if you want to build on the same pieces.

Save it as `ratings/gd-weighted.js` and add one tag **after** the app script in
`index.html`:

```html
<script src="ratings/gd-weighted.js"></script>
```

It shows up in the picker on the next load. Registering later — from the console,
say — works too and re-renders immediately.

Two things to know. Formulas must not mutate `data`, `table` or `state`: those
objects are shared with the rest of the page. And a formula that throws is
contained — the affected team shows `—` and a warning goes to the console, rather
than taking the page down — but it still runs as ordinary JavaScript in the page,
with no sandbox. A rating file is exactly as trusted as `index.html` itself, so
review contributed ones the way you'd review any other code here.

## Where the data comes from

Live results come from ESPN's public scoreboard endpoint for `usa.nwsl`:

```
https://site.api.espn.com/apis/site/v2/sports/soccer/usa.nwsl/scoreboard?limit=1000&dates=YYYY0101-YYYY1231
```

It's CORS-enabled (`Access-Control-Allow-Origin: *`) and needs no key, so the page
fetches it directly from the browser — one request returns the whole season.

**Catching up works on three levels, in order:**

1. **Embedded snapshot** — a full season is baked into `index.html` itself, so the
   page renders instantly and still works with no network at all.
2. **`localStorage` cache** — the last fetch is reused for 10 minutes.
3. **Live fetch** — on load (and on **Refresh**) it pulls current results and
   overwrites the cache. If the network or ESPN is unavailable it keeps showing the
   most recent data it has and says so in the status line.

Season is switchable in the header; anything back to 2023 is fetched on demand.

### Refreshing the embedded snapshot

```
node scripts/update-snapshot.mjs          # current year
node scripts/update-snapshot.mjs 2025     # a specific season
```

This rewrites the `<script id="snapshot">` block in `index.html` in place. Commit
the result so a fresh clone opens with current data. `.github/workflows/refresh.yml`
does this daily.

## Notes and caveats

- Only the **regular season** is included; playoff and preseason fixtures are
  filtered out. The regular season is a balanced double round-robin — 16 teams,
  30 matches each, every opponent once home and once away — which is what makes
  the two-column opponent view work.
- Tiebreakers are applied as points → wins → goal difference → goals for. NWSL also
  uses head-to-head; this ordering reproduced ESPN's published table exactly when
  the page was built, but an exotic tie could in principle order differently.
- Team crests are hotlinked from ESPN's CDN and are the property of their clubs.
- ESPN's endpoint is undocumented and could change. Everything that touches its
  response shape lives in `parseESPN()` — in `index.html` and mirrored in
  `scripts/update-snapshot.mjs`.

## Licence

MIT — see [LICENSE](LICENSE). Not affiliated with or endorsed by the NWSL or ESPN.
