# EPICENTER: Outbreak Response

A 3D, semi-realistic epidemiology game. You are the CDC epidemiologist put in charge when a brand-new disease appears in the United States. You walk the halls of a 3D CDC headquarters and run the response from each room:

- **Laboratory:** identify the pathogen, build a test, measure how contagious and deadly it is.
- **Emergency Operations Center:** a holographic map of the country; deploy field teams and testing, and recommend protective measures to cities.
- **Vaccine Wing:** design, trial and manufacture vaccines.
- **Press Room:** keep public trust, fight misinformation.
- **Director's Office:** money, manpower, and keeping your job.

The outbreak keeps moving while you walk between rooms, so plan your route.

> A fictional simulation for fun and learning. Not affiliated with or endorsed by the U.S. Centers for Disease Control and Prevention. All characters are fictional.

## Play

No build step and no dependencies. It's plain HTML and ES modules, with [Three.js](https://threejs.org) loaded from a CDN.

```bash
npm start            # serves the game at http://localhost:8000
# or: python3 -m http.server 8000
```

Then open <http://localhost:8000>. (Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.)

### Scenarios

| Mode | What it is |
| --- | --- |
| **Story: Vesper** | A handcrafted outbreak. Patients in Houston have evening fever spikes and a mottled rash. It has characters, scripted dilemmas (a spring festival, a nursing-home cluster, a PPE shortage, a Senate hearing, back-to-school, Thanksgiving) and a variant that shows up mid-game. |
| **Outbreak generator: Disease X** | A new pathogen every game: coronavirus, novel flu, paramyxovirus, filovirus, arenavirus or henipavirus, each with randomized traits. You only learn its R0, route and fatality rate through lab work. |

Difficulty: **Recruit**, **Field Officer** or **Incident Director**. Each changes budget, starting trust, political patience, how large the initial outbreak is and how often events hit.

### Controls

| | |
| --- | --- |
| Walk | Click or tap the floor · `WASD` / arrow keys · hold `Shift` to run |
| Look | Drag · scroll or pinch to zoom |
| Use a station | Walk to a glowing marker and press `E`, or click the marker |
| Quick travel | Room buttons at the bottom (you still walk there) |
| Time | `Space` pause · `1`–`4` for 1×/2×/4×/8× |
| Close | `Esc` |

By default, time pauses while a console is open. Turn that off in *Your Office → Settings* for a harder, real-time game.

### Winning

The outbreak is over after **28 straight days with no new reported cases**. You're graded on lives saved compared with a do-nothing scenario, deaths per 100k, whether you delivered a vaccine, and public trust. If **leadership confidence** reaches zero, you're relieved of command. After two years, the review board grades whatever state you've reached.

## How the simulation works

`js/core/` is pure JavaScript with no DOM, so the whole game runs (and is tested) in Node.

- **Metapopulation SEIR model** (`sim.js`). It covers the 26 largest U.S. metro areas, about 135M people. Each metro has 3 age groups (0–17, 18–64, 65+) with POLYMOD-style contact matrices. The compartments are S, E, I (mild vs. heading to hospital), H, R, D, plus vaccinated/protected. Metros are linked by a gravity-model travel network. Small numbers are drawn from a Poisson distribution, so early sparks can fizzle out or take off.
- **Fog of war.** You see *reported* cases, not true infections. How many cases get detected depends on the PCR assay, testing programs, field teams and rapid tests. Serosurveys and wastewater surveillance show what you're missing.
- **Interventions.** Recommended measures go from Advisory up to Stay-at-Home. They change specific contact settings (schools, work, community), and masks are weighted by transmission route. Local officials adopt your recommendations with a delay, and sometimes only partly. Effectiveness depends on **compliance**, which rises with trust and fear and falls with **pandemic fatigue**.
- **Hospitals.** Capacity varies by metro and can be raised with stockpile shipments and field hospitals. Once a metro's hospitals are past capacity, fatality rises sharply.
- **Vaccines** (`vaccine.js`). Four platforms (mRNA, viral vector, protein subunit, inactivated) go through Design → Preclinical → Phase I/II/III → FDA review. Each phase has realistic odds of failure. Phase III needs real infections among trial volunteers, so suppressing the outbreak slows the trial; you can add international sites or a human challenge study. After authorization come at-risk manufacturing, production ramp-up, delivery capacity, allocation strategy, hesitancy and a pediatric trial.
- **People.** Public trust, misinformation, compliance, fatigue, economic disruption and leadership confidence all feed back into each other.
- **Counterfactual.** A deterministic copy of the epidemic runs alongside yours with no response at all, which is how "lives saved" is computed.

Parameters are tuned to land in plausible ranges. For example, masks plus gathering limits cut R by about 28%, school and venue closures by about 50%, and stay-at-home orders by about 60%. They are illustrative, not predictive.

## Project layout

```
index.html            HUD, title, dialogs (markup)
css/style.css         UI styles
js/main.js            app bootstrap, game loop, interactions
js/three.js           pins the Three.js version (CDN)
js/core/              simulation & rules (no DOM): sim, game, disease, research, vaccine, events, story, data
js/world/             3D: HQ building, people/NPCs, holo map, wall screens, player/camera, A* navigation
js/ui/                HUD, station consoles, dialogs, news ticker
tests/core.test.mjs   unit tests (node --test)
tests/e2e.mjs         browser smoke test (Playwright)
tools/serve.mjs       zero-dependency static server
```

## Tests

```bash
npm test                         # simulation & rules unit tests
npm run e2e                      # headless-browser playthrough (needs the `playwright` package)
THREE_LOCAL=./three.module.js npm run e2e   # same, offline
```

*Easter egg: check the wall of your office.*
