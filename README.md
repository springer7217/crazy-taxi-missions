# Sky Cab: The Loop

A Lee Springer LLC speed-build. The project is `crazy-taxi-missions`: an arcade fare run through a near-future Chicago Loop. You drive an original flying roadster, pick up passengers, and bank the fare before the clock runs out.

The on-screen title is **Sky Cab: The Loop**. The car is called the Roadster. It is original art, with no automaker marks.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on port **4731** (`http://127.0.0.1:4731`).

```bash
npm run build
npm run preview
```

`npm run build` typechecks with `tsc`, then writes a static site to `dist/`.

## Deploy on Vercel

Do not put secrets in the repo. This game has none.

1. Import the repository in Vercel.
2. Framework preset: **Vite**.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. No environment variables.

`vercel.json` already sets the build command, the output directory, a no-cache header on `sw.js`, and a day-long cache on `/map/*`.

## Controls

| Input | Action |
| --- | --- |
| W A S D or arrow keys | Throttle, brake, steer |
| Hold Space | Charge a hop, release to jump |
| Shift | Drift |
| P or Esc | Pause |
| M | Mute |
| Enter | Confirm the focused fare screen |

On a coarse pointer or a window under 860px, a stick (up throttle, down brake, sideways steer), Jump, and Drift sit on the play screen.

## Map data

Roads, building footprints, the Chicago River, and the lakefront come from **OpenStreetMap** through the public Overpass API. Google Maps was not used: it needs a paid key, and its terms do not cover this kind of offline game extract.

`npm run map` regenerates `public/map/loop.json` from a cached Overpass response (or a fresh download). The extract is the Loop plus the river and the lakefront, roughly the river to Roosevelt and the lake to Halsted. Building count is capped. Alleys and the smallest footprints are simplified away.

Map data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright).

Landmarks (the Bean, Willis Tower, Tribune Tower, Union Station, Navy Pier, the Mart) are stylized props placed on that geometry. Navy Pier’s deck is a hand-drawn quad because the pier itself is not a single OSM polygon.

## Upgrades

Cash, cleared missions, skins (brushed steel, matte black, night gold), thruster colors, engine, handling, and hop level live in `localStorage` under `skycab-loop-save-v1`. The garage is available from the title, pause, and result screens.

## Add a mission

Edit `src/missions/missions.ts` and append an object to `MISSIONS`. Unlock order is linear: a fare opens when the previous id is in the cleared list.

```ts
{
  id: "short-id",
  title: "On-screen name",
  tagline: "One line on the title list",
  briefing: "What Mara says before the clock starts.",
  timeLimit: 160,
  baseFare: 150,
  passenger: "lenny", // lenny | samir | june | ruthie | priya | eddie
  fragile: false,     // optional; three hard hits fail the fare
  startChaos: 0,      // optional
  heat: 62,           // optional chaos level that calls the wardens
  stops: [
    { at: "bean", kind: "pickup" },
    { at: "union", kind: "dropoff" },
  ],
}
```

Stop `at` is one of `willis`, `tribune`, `bean`, `union`, `pier`, `mart`. A chain can set `base` on a drop and a `handoff` (`{ atStop, passenger }`) when the rider changes.

Passenger lines live in `src/dialogue/lines.ts`.

## Audio and voice

Music and effects are generated in the browser with Web Audio. No samples. The Voice toggle uses `speechSynthesis` when the browser has it. Text bubbles still show if speech is off, muted, or missing.

## Credits

Sky Cab: The Loop is a Lee Springer LLC speed-build. Original writing, art, and audio. Map data © OpenStreetMap contributors (ODbL). Not affiliated with any automaker.
