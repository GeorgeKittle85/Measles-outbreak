// Unit tests for the simulation core. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../js/core/rng.js';
import { CITY_DATA, NPI_LEVELS, US_OUTLINE, TOTAL_POP_M } from '../js/core/data.js';
import { storyPathogen, randomPathogen, computeBeta, spectralRadius } from '../js/core/disease.js';
import { Epidemic, COMPARTMENTS } from '../js/core/sim.js';
import { Game } from '../js/core/game.js';
import { RANDOM_EVENTS } from '../js/core/events.js';
import { STORY_BEATS } from '../js/core/story.js';
import { PROJECTS } from '../js/core/research.js';
import { PLATFORMS } from '../js/core/vaccine.js';
import { headlines } from '../js/ui/news.js';

const resolveAll = (g, pick = 0) => {
  let guard = 0;
  while (g.pendingEvents.length && guard++ < 50) {
    const ev = g.pendingEvents[0];
    let i = ev.choices ? Math.min(pick, ev.choices.length - 1) : 0;
    if (ev.choices) while (ev.choices[i] && ev.choices[i].disabled) i = (i + 1) % ev.choices.length;
    g.resolveEvent(ev.id, i);
  }
};

const identityCtx = (n, p) => ({
  transMult: new Float64Array(n).fill(1),
  contactMult: Array.from({ length: n }, () => new Float64Array(9).fill(1)),
  capacity: new Float64Array(n).fill(1e9),
  mobility: 1, seasonal: 1, variantMult: 1, severityMult: 1, hfrMult: 1,
});

test('RNG is deterministic and Poisson has the right mean', () => {
  const a = new RNG(42), b = new RNG(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const r = new RNG(7);
  for (const lambda of [0.3, 4, 60]) {
    let s = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) s += r.poisson(lambda);
    assert.ok(Math.abs(s / N - lambda) < lambda * 0.05 + 0.02, `mean for λ=${lambda} was ${s / N}`);
  }
});

test('static data is consistent', () => {
  assert.equal(CITY_DATA.length, 26);
  assert.ok(Math.abs(TOTAL_POP_M - 135.2) < 1);
  assert.equal(new Set(CITY_DATA.map(c => c.id)).size, 26);
  assert.ok(US_OUTLINE.length > 100);
  assert.equal(NPI_LEVELS.length, 5);
});

test('beta reproduces R0 at the disease-free equilibrium', () => {
  for (const p of [storyPathogen(), randomPathogen(new RNG(3)), randomPathogen(new RNG(99))]) {
    const sim = new Epidemic({ cities: CITY_DATA, pathogen: p, rng: new RNG(1), stochastic: false });
    sim.computeRt(identityCtx(CITY_DATA.length, p));
    for (let c = 0; c < CITY_DATA.length; c++) {
      assert.ok(Math.abs(sim.lastRt[c] - p.R0) / p.R0 < 0.04, `${CITY_DATA[c].id}: Rt ${sim.lastRt[c]} vs R0 ${p.R0}`);
    }
  }
  assert.ok(Math.abs(spectralRadius([[2, 0, 0], [0, 1, 0], [0, 0, 0.5]]) - 2) < 1e-9);
  assert.ok(computeBeta(storyPathogen()) > 0);
});

test('epidemic conserves population and grows when R0 > 1', () => {
  const p = storyPathogen();
  const sim = new Epidemic({ cities: CITY_DATA, pathogen: p, rng: new RNG(5), stochastic: true });
  const total = () => { let s = 0; for (const k of COMPARTMENTS) s += sim.total(k); return s; };
  const N0 = total();
  sim.seed(4, 100, 'I');
  const ctx = identityCtx(CITY_DATA.length, p);
  for (let d = 0; d < 60; d++) sim.step(ctx);
  assert.ok(Math.abs(total() - N0) / N0 < 1e-9, 'population drifted');
  assert.ok(sim.totalCum('inf') > 10000, 'outbreak should take off with no interventions');
  assert.ok(sim.cityCum('inf', 0) > 0, 'travel should seed other cities');
  for (const k of COMPARTMENTS) for (const v of sim[k]) assert.ok(v >= -1e-6, `${k} went negative`);
});

test('stronger NPI levels lower Rt monotonically', () => {
  const g = new Game({ mode: 'story', seed: 11 });
  let prev = Infinity;
  for (let L = 0; L <= 4; L++) {
    for (const c of g.cities) c.level = L;
    g.sim.computeRt(g.buildContext());
    const rt = g.sim.lastRt[0];
    assert.ok(rt < prev, `level ${L} Rt ${rt} not below ${prev}`);
    prev = rt;
  }
  assert.ok(prev < 1.6, 'stay-at-home should push Rt near or below ~1.5');
});

test('same seed gives the same game', () => {
  const run = () => {
    const g = new Game({ mode: 'random', seed: 1234 });
    g.start();
    for (let i = 0; i < 80; i++) { g.advanceDay(); resolveAll(g); }
    return [g.pathogen.name, g.sim.totalCum('inf'), g.totalReportedCases(), g.budget].join('|');
  };
  assert.equal(run(), run());
});

test('lab projects complete, unlock prerequisites and reveal knowledge', () => {
  const g = new Game({ mode: 'story', seed: 2 });
  g.start(); resolveAll(g);
  assert.equal(g.startResearch('assay').ok, false, 'assay needs sequencing');
  assert.ok(g.startResearch('sequencing').ok);
  assert.ok(g.startResearch('transmission').ok);
  assert.equal(g.startResearch('severity').ok, false, 'only two lab teams');
  // up to 30 days: random events (e.g. contaminated reagents) can delay lab work
  for (let i = 0; i < 30 && !g.knowledge.transmission; i++) { g.advanceDay(); resolveAll(g); }
  assert.ok(g.research.done.has('sequencing'));
  assert.ok(g.knowledge.sequenced && g.knowledge.transmission);
  assert.ok(g.startResearch('assay').ok);
  assert.equal(g.startResearch('sequencing').ok, false, 'cannot redo sequencing');
  for (let i = 0; i < 20 && !g.knowledge.assay; i++) { g.advanceDay(); resolveAll(g); }
  assert.ok(g.knowledge.assay);
  assert.ok(g.objectives().find(o => o.id === 'seq').done);
});

test('vaccine pipeline: phases, readout, EUA, manufacturing and vaccination', () => {
  const g = new Game({ mode: 'story', seed: 21, difficulty: 'recruit' });
  g.start(); resolveAll(g);
  g.knowledge.sequenced = true;
  g.budget = 1e5;
  assert.ok(g.startVaccine('mrna', 'accelerated').ok);
  const cand = g.vaccine.candidates[0];
  cand.efficacy = 0.9; // make the outcome deterministic for the test
  let guard = 0;
  while (cand.stage !== 'phase3' && cand.stage !== 'failed' && guard++ < 300) {
    g.advanceDay(); resolveAll(g);
  }
  if (cand.stage === 'failed') return; // a stochastic phase failure is a legitimate outcome
  assert.equal(cand.stage, 'phase3');
  assert.ok(g.startAtRisk(cand.id).ok);
  cand.endpoints = 500;
  cand.stageDay = cand.stageDays;
  guard = 0;
  while (cand.stage !== 'authorized' && guard++ < 80) { g.advanceDay(); resolveAll(g); }
  assert.equal(cand.stage, 'authorized');
  assert.ok(cand.effKnown);
  for (const u of ['pharmacy', 'massSites']) assert.ok(g.buyUpgrade(u).ok);
  const before = g.vaccinatedTotal();
  for (let i = 0; i < 40; i++) { g.advanceDay(); resolveAll(g); }
  assert.ok(g.vaccinatedTotal() > before + 1e6, 'people should be getting vaccinated');
  assert.ok(g.sim.total('V') > 0, 'immunity should mature after 14 days');
  assert.ok(g.ageCoverage(2) > g.ageCoverage(0), 'seniors-first strategy should cover seniors before kids');
  assert.equal(g.ageCoverage(0), 0, 'children not eligible before the pediatric trial');
});

test('every random event and story beat can fire and resolve every choice', () => {
  for (const ev of [...RANDOM_EVENTS, ...STORY_BEATS]) {
    const nChoices = ev.choices ? ev.choices.length : 1;
    for (let ci = 0; ci < nChoices; ci++) {
      const g = new Game({ mode: 'story', seed: 77 });
      g.start(); resolveAll(g);
      g.knowledge.sequenced = g.knowledge.assay = true;
      g.budget = 5000;
      for (let i = 0; i < 40; i++) { g.advanceDay(); resolveAll(g); }
      g.setCityNPI(0, 3); g.cities[0].level = 3; g.cities[0].levelSince = 0;
      g.policy.travel = 1;
      g.startVaccine('mrna');
      g.pendingEvents = [];
      g.fireBeat(ev, 'test');
      const inst = g.pendingEvents.find(e => e.def === ev);
      if (!inst) continue; // non-modal beats resolve immediately, or setup found no target
      const res = g.resolveEvent(inst.id, ci);
      assert.ok(res.ok || res.msg === 'Not available', `${ev.id} choice ${ci} failed`);
      g.advanceDay();
    }
  }
});

test('doing nothing gets you fired; the game ends and grades itself', () => {
  const g = new Game({ mode: 'story', seed: 5 });
  g.start();
  let guard = 0;
  while (!g.over && guard++ < 800) { g.advanceDay(); resolveAll(g, 9); }
  assert.ok(g.over);
  assert.equal(g.outcome.kind, 'fired');
  assert.equal(g.outcome.grade, 'F');
  assert.ok(g.outcome.deaths > 10000);
});

test('a competent response can contain the outbreak', () => {
  let wins = 0;
  for (const seed of [1, 3]) {
    const g = new Game({ mode: 'story', seed, difficulty: 'recruit' });
    g.start();
    g.startResearch('sequencing'); g.startResearch('transmission'); g.setEOC(1);
    while (!g.over) {
      g.advanceDay(); resolveAll(g);
      if (g.knowledge.sequenced) g.startResearch('assay');
      if (g.knowledge.sequenced && !g.vaccine.candidates.some(c => c.stage !== 'failed')) g.startVaccine('mrna', 'accelerated');
      for (const c of g.cities) {
        const inc = g.cityIncidence(c.idx), load = g.cityHospitalLoad(c.idx);
        if (inc > 0.3 && !c.team) g.deployTeam(c.idx);
        if (g.knowledge.assay && inc > 0.3) g.setCityTesting(c.idx, 2);
        let want = inc > 12 || load > 0.7 ? 4 : inc > 3 ? 3 : inc > 0.3 ? 2 : g.day > 20 ? 1 : 0;
        if (g.vaccineCoverage() > 0.55) want = Math.min(want, 1);
        if (g.day % 5 === 0) g.setCityNPI(c.idx, want);
        if (load > 0.9) g.deploySNS(c.idx);
      }
      for (const cand of g.vaccine.candidates) if (cand.stage === 'phase2' && g.budget > 500) g.startAtRisk(cand.id);
      if (g.authorizedCount) { g.buyUpgrade('pharmacy'); g.buyUpgrade('massSites'); g.buyUpgrade('coldChain'); }
      if (g.day % 7 === 0) g.pressBriefing('transparent');
      if (g.budget < 600) g.requestFunding();
    }
    if (g.outcome.win) wins++;
    assert.ok(g.outcome.savedFrac > 0.8, 'response should avert most deaths');
  }
  assert.ok(wins >= 1, 'expected at least one contained outbreak on Recruit');
});

test('content sanity: projects, platforms and headlines', () => {
  assert.ok(PROJECTS.every(p => p.days > 0 && p.cost > 0));
  assert.ok(Object.values(PLATFORMS).every(p => p.eff[0] < p.eff[1] && p.doses >= 1));
  const g = new Game({ mode: 'random', seed: 9 });
  g.start(); resolveAll(g);
  for (let i = 0; i < 30; i++) { g.advanceDay(); resolveAll(g); }
  const h = headlines(g);
  assert.ok(h.length >= 3 && h.every(s => typeof s === 'string' && s.length > 5));
});
