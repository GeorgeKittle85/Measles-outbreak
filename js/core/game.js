// Game state and rules. Pure logic: no DOM and no Three.js, so it runs (and is tested) in Node.
import { RNG, clamp } from './rng.js';
import {
  CITY_DATA, NPI_LEVELS, TRAVEL_LEVELS, DIFFICULTIES, formatDate, dayOfYear, TOTAL_POP_M,
} from './data.js';
import { storyPathogen, randomPathogen, ROUTES } from './disease.js';
import { Epidemic, A } from './sim.js';
import { PROJECTS, PROJECT_BY_ID, projectAvailable } from './research.js';
import {
  PLATFORMS, STAGES, STAGE_LABEL, STAGE_SUCCESS, ENDPOINTS_NEEDED, AT_RISK_COST, ADMIN_UPGRADES,
  newCandidate, stageDuration, stageCost, productionRate,
} from './vaccine.js';
import { RANDOM_EVENTS } from './events.js';
import { STORY_BEATS, CHARACTERS, RANDOM_INTRO } from './story.js';

const REPORT_DELAY = 3;
const DEATH_DELAY = 5;
const IMMUNITY_DELAY = 14;
const MAX_DAYS = 730;
const TEAM_COST = 0.3;
const TESTING_COST = 0.018; // $M per testing level per million residents per day
const BED_SCALE = 1.5; // beds in CITY_DATA are ICU-weighted; surge-ready ward + ICU capacity is ~1.5x

export const CAMPAIGNS = [
  { id: 'prevention', name: 'Prevention basics', cost: 25, days: 60, desc: 'National ads on masks, ventilation and staying home when sick. Raises compliance.' },
  { id: 'elders', name: 'Protect our elders', cost: 20, days: 75, desc: 'Guidance for nursing homes and multigenerational households. Cuts contacts with people 65+.' },
  { id: 'counter', name: 'Counter-misinformation partnership', cost: 35, days: 60, desc: 'Work with platforms and local messengers to fact-check fast. Reduces misinformation.' },
  { id: 'confidence', name: 'Vaccine confidence campaign', cost: 40, days: 90, desc: 'Trusted doctors, clergy and coaches talk openly about vaccine safety. Raises uptake.' },
];

export class Game {
  constructor({ mode = 'story', difficulty = 'officer', seed = Date.now(), playerName = 'Dr. Quinn', autoPauseConsoles = true } = {}) {
    this.mode = mode;
    this.diff = DIFFICULTIES[difficulty] || DIFFICULTIES.officer;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.playerName = playerName;
    this.settings = { autoPauseConsoles };
    this.listeners = {};
    this.day = 0;
    this.over = false;
    this.outcome = null;

    this.pathogen = mode === 'story' ? storyPathogen() : randomPathogen(this.rng, this.diff.r0Mult);
    if (mode === 'story') {
      this.pathogen.R0 *= this.diff.r0Mult;
      this.pathogen.beta *= this.diff.r0Mult;
    }

    this.cities = CITY_DATA.map((d, idx) => ({
      ...d,
      idx,
      rec: 0,
      level: 0,
      levelSince: 0,
      holdUntil: 0,
      testing: 0,
      team: null,
      sns: 0,
      fms: 0,
      resistance: clamp(this.rng.range(0.05, 0.35), 0, 1),
      confidence: this.rng.range(-0.06, 0.06),
      repCases: [],
      repDeaths: [],
      repCum: 0,
      repDeathsCum: 0,
      vax: [0, 0, 0],
      firstReportDay: null,
    }));

    this.sim = new Epidemic({ cities: this.cities, pathogen: this.pathogen, rng: this.rng, stochastic: true });
    this.cf = new Epidemic({ cities: this.cities, pathogen: this.pathogen, rng: this.rng, stochastic: false });

    this.budget = this.diff.budget;
    this.trust = this.diff.trust;
    this.leadership = this.diff.leadership;
    this.misinfo = this.diff.misinfo;
    this.fatigue = 0;
    this.fear = 0;
    this.compliance = 0.55;
    this.disruption = 0;
    this.spentTotal = 0;

    this.knowledge = {
      sequenced: false, assay: false, transmission: false, severity: false,
      rapid: false, genomic: false, wastewater: false, therapeutics: false, sero: null,
    };
    this.research = { slots: 2, active: [], done: new Set(), attempts: {}, cooldown: {} };
    this.vaccine = {
      candidates: [],
      adminCapacity: 0.4, // million courses per day
      upgrades: new Set(),
      uptakeBonus: 0,
      strategy: 'elderly',
      pediatric: null, // {start, days} | 'authorized'
      variantUpdate: null,
      pending: [],
      administeredTotal: 0,
      todayGiven: 0,
      authorizedDay: null,
      firstShotDay: null,
    };
    this.policy = { travel: 0, eoc: 3, elderGuidance: false };
    this.teams = { total: 4 };
    this.sns = { units: 6 };
    this.campaigns = [];
    this.briefing = { cooldownUntil: 0, reassuringCheck: null, urgentUntil: 0 };
    this.funding = { pending: null, cooldownUntil: 20, requests: 0 };
    this.modifiers = [];
    this.variant = null;
    this.flags = {};
    this.messages = [];
    this.pendingEvents = [];
    this.firedStory = new Set();
    this.eventCooldown = {};
    this.history = [];
    this.caseQueue = Array.from({ length: REPORT_DELAY }, () => new Float64Array(this.cities.length));
    this.deathQueue = Array.from({ length: DEATH_DELAY }, () => new Float64Array(this.cities.length));
    this.zeroReportStreak = 0;
    this.rtEstimate = null;
    this.lastCtx = null;
    this.indexCity = null;

    this.setupOutbreak();
    this.recordHistory();
  }

  // ---------- events ----------
  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach(fn => fn(data)); }
  toast(text, kind = 'info') { this.emit('toast', { text, kind }); }
  addMessage(from, subject, body, kind = 'info') {
    const m = { day: this.day, from: CHARACTERS[from] || { name: from, role: '' }, subject, body, kind, read: false };
    this.messages.unshift(m);
    this.emit('message', m);
    return m;
  }

  // ---------- setup ----------
  setupOutbreak() {
    const seedMult = this.diff.seedMult;
    if (this.mode === 'story') {
      const hou = this.cityById('HOU');
      this.indexCity = hou.idx;
      for (const s of [this.sim, this.cf]) {
        s.seed(hou.idx, 34 * seedMult, 'E');
        s.seed(hou.idx, 20 * seedMult, 'I');
        s.seed(hou.idx, 11, 'H', [0.05, 0.55, 0.4]);
      }
      hou.firstReportDay = 0;
      this.caseQueue[0][hou.idx] = 11;
    } else {
      const city = this.rng.weighted(this.cities, c => c.pop * c.hub);
      this.indexCity = city.idx;
      const hosp = Math.max(4, Math.round(8 * seedMult));
      for (const s of [this.sim, this.cf]) {
        s.seed(city.idx, 30 * seedMult, 'E');
        s.seed(city.idx, 18 * seedMult, 'I');
        s.seed(city.idx, hosp, 'H', [0.1, 0.5, 0.4]);
      }
      city.firstReportDay = 0;
      this.caseQueue[0][city.idx] = hosp;
    }
  }

  // Called once the player is in the building: fires the opening briefing.
  start() {
    if (this.started) return;
    this.started = true;
    if (this.mode === 'story') this.runStory();
    else this.fireBeat(RANDOM_INTRO, 'story');
  }

  objectives() {
    const done = this.research.done;
    const list = [
      { id: 'seq', text: 'Sequence the pathogen in the Laboratory', done: done.has('sequencing'), station: 'lab' },
      { id: 'assay', text: 'Develop a PCR diagnostic test (Laboratory)', done: done.has('assay'), station: 'lab' },
      { id: 'team', text: 'Deploy an EIS field team from the EOC', done: !!this.flags.teamDeployed, station: 'eoc' },
      { id: 'npi', text: 'Recommend protective measures for a city (EOC)', done: !!this.flags.npiSet, station: 'eoc' },
      { id: 'brief', text: 'Hold a press briefing in the Press Room', done: !!this.flags.briefed, station: 'press' },
      { id: 'vax', text: 'Launch a vaccine program in the Vaccine Wing', done: this.vaccine.candidates.length > 0, station: 'vaccine' },
      { id: 'eua', text: 'Get a vaccine authorized by the FDA', done: this.authorizedCount > 0, station: 'vaccine' },
      { id: 'cover', text: 'Vaccinate 60% of the population', done: this.vaccineCoverage() >= 0.6, station: 'vaccine' },
      { id: 'end', text: 'End the outbreak: 28 days with zero new reported cases', done: !!(this.outcome && this.outcome.win), station: 'eoc' },
    ];
    return list;
  }

  // ---------- lookups ----------
  cityById(id) { return this.cities.find(c => c.id === id); }
  get dateLabel() { return formatDate(this.day); }
  get totalPop() { return TOTAL_POP_M * 1e6; }

  cityPopM(c) { return this.cities[c].pop; }
  reported7(city, key = 'repCases') {
    const arr = city[key];
    const n = Math.min(7, arr.length);
    if (!n) return 0;
    let s = 0;
    for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
    return s / n;
  }
  cityIncidence(c) { // reported cases per 100k per day (7-day avg)
    const city = this.cities[c];
    return this.reported7(city) / (city.pop * 10);
  }
  cityHospitalLoad(c) { return this.sim.cityTotal('H', c) / Math.max(1, this.cityCapacity(c)); }
  cityCapacity(c) {
    const city = this.cities[c];
    let cap = city.beds * BED_SCALE * city.pop * 10 * (1 + 0.2 * city.sns + 0.22 * city.fms);
    for (const m of this.modifiers) if (m.type === 'capacity' && (m.city == null || m.city === c)) cap *= m.mult;
    return cap;
  }
  teamActive(c) { const t = this.cities[c].team; return !!t && this.day >= t.arrive; }
  teamsDeployed() { return this.cities.filter(c => c.team).length; }
  teamsAvailable() { return this.teams.total - this.teamsDeployed(); }

  nationalReported7(key = 'repCases') {
    return this.cities.reduce((s, c) => s + this.reported7(c, key), 0);
  }
  totalReportedCases() { return this.cities.reduce((s, c) => s + c.repCum, 0); }
  totalReportedDeaths() { return this.cities.reduce((s, c) => s + c.repDeathsCum, 0); }
  hospitalized() { return this.sim.total('H'); }
  totalCapacity() { let s = 0; for (let c = 0; c < this.cities.length; c++) s += this.cityCapacity(c); return s; }
  overflowCities() {
    let n = 0;
    for (let c = 0; c < this.cities.length; c++) if (this.cityHospitalLoad(c) > 1) n++;
    return n;
  }
  vaccinatedTotal() { return this.cities.reduce((s, c) => s + c.vax[0] + c.vax[1] + c.vax[2], 0); }
  vaccineCoverage() { return this.vaccinatedTotal() / this.totalPop; }
  ageCoverage(a) {
    let v = 0, n = 0;
    for (let c = 0; c < this.cities.length; c++) { v += this.cities[c].vax[a]; n += this.sim.N[c * A + a]; }
    return n ? v / n : 0;
  }
  cityCoverage(c) {
    const city = this.cities[c];
    return (city.vax[0] + city.vax[1] + city.vax[2]) / this.sim.cityPop(c);
  }
  authorizedCandidates() { return this.vaccine.candidates.filter(v => v.stage === 'authorized'); }
  get authorizedCount() { return this.authorizedCandidates().length; }

  // ---------- detection model ----------
  detection(c) {
    const city = this.cities[c];
    const team = this.teamActive(c);
    const eoc1 = this.policy.eoc === 1;
    if (!this.knowledge.assay) {
      return { mild: 0.01 + (team ? 0.02 : 0), asym: 0, hosp: this.flags.han ? 0.6 : 0.42 };
    }
    let mild = 0.13 + 0.1 * city.testing + (team ? 0.05 : 0) + (eoc1 ? 0.02 : 0);
    if (this.knowledge.rapid) mild += city.testing > 0 ? 0.08 : 0.04;
    let asym = 0.01 + 0.035 * city.testing + (team ? 0.05 : 0) + (this.knowledge.rapid ? 0.03 : 0);
    for (const m of this.modifiers) if (m.type === 'detection') { mild *= m.mult; asym *= m.mult; }
    return { mild: Math.min(0.7, mild), asym: Math.min(0.3, asym), hosp: 0.95 };
  }

  ascertainment(c) {
    const p = this.pathogen;
    const d = this.detection(c);
    const h = (p.hosp[0] * 0.22 + p.hosp[1] * 0.61 + p.hosp[2] * 0.17);
    return (1 - h) * ((1 - p.asymp) * d.mild + p.asymp * d.asym) + h * d.hosp;
  }

  // ---------- transmission context ----------
  buildContext() {
    const p = this.pathogen;
    const route = ROUTES[p.route];
    const comp = this.compliance;
    const n = this.cities.length;
    const transMult = new Float64Array(n);
    const contactMult = [];
    const capacity = new Float64Array(n);
    const elderCampaign = this.campaignActive('elders') || this.policy.elderGuidance;
    const preventionCampaign = this.campaignActive('prevention');

    for (let c = 0; c < n; c++) {
      const city = this.cities[c];
      const L = city.level;
      // contact matrix multipliers: [kid,adult,elder] x [kid,adult,elder]
      // ce = effective compliance: official orders get partial adherence even when trust is low.
      const ce = 0.3 + 0.7 * comp;
      const school = [1, 1, 1, 1, 1, 1, 1, 1, 1];
      if (L >= 3) { school[0] = 0.25; school[1] = 0.75; school[3] = 0.75; }
      const beh = [1, 1, 1, 1, 1, 1, 1, 1, 1];
      if (L >= 2) { beh[4] *= 0.84; beh[5] *= 0.9; beh[7] *= 0.9; beh[8] *= 0.92; }
      if (L >= 3) { beh[4] *= 0.7; beh[5] *= 0.85; beh[7] *= 0.85; beh[8] *= 0.88; }
      if (L >= 4) { for (let k = 0; k < 9; k++) beh[k] *= 0.56; }
      if (elderCampaign) { beh[2] *= 0.75; beh[5] *= 0.75; beh[6] *= 0.75; beh[7] *= 0.75; beh[8] *= 0.85; }
      const cm = new Float64Array(9);
      for (let k = 0; k < 9; k++) cm[k] = school[k] * (1 - (1 - beh[k]) * ce);
      contactMult.push(cm);

      let tm = 1;
      if (L >= 1) tm *= 1 - route.hygieneEff * ce;
      if (L >= 2) tm *= 1 - route.maskEff * ce;
      if (L >= 3) tm *= 1 - route.venueEff * ce;
      if (preventionCampaign) tm *= 1 - 0.05 * ce;

      // isolation of symptomatic + detected cases
      const det = this.detection(c);
      const selfIso = (0.1 + (L >= 1 ? 0.1 : 0)) * comp;
      const isoProb = Math.min(0.85, selfIso + det.mild * 0.85 * comp);
      const postOnset = (1 - p.asymp) * (1 - p.presymp);
      tm *= 1 - postOnset * isoProb;

      // contact tracing (quarantine of contacts)
      const team = this.teamActive(c);
      const capacityTrace = 15 + city.pop * 10 + (team ? 120 + city.pop * 10 : 0);
      const load = this.reported7(city);
      const covered = load <= 0 ? 1 : Math.min(1, capacityTrace / load);
      let quality = team ? 0.6 : 0.28;
      if (!this.knowledge.assay) quality *= 0.6;
      if (this.policy.eoc === 1) quality *= 1.1;
      const asc = this.ascertainment(c);
      tm *= 1 - Math.min(0.6, quality * covered * comp * Math.min(1, asc * 1.6) * 0.65);

      for (const m of this.modifiers) if (m.type === 'beta' && (m.city == null || m.city === c)) tm *= m.mult;
      transMult[c] = tm;
      capacity[c] = this.cityCapacity(c);
    }

    let mobility = TRAVEL_LEVELS[this.policy.travel].mobility;
    for (const m of this.modifiers) if (m.type === 'mobility') mobility *= m.mult;

    const learning = 1 - 0.15 * Math.min(1, this.day / 180);
    const hfrMult = learning * (this.knowledge.therapeutics ? 0.68 : 1);
    return {
      transMult, contactMult, capacity, mobility,
      seasonal: this.seasonal(),
      variantMult: this.variantBetaMult(),
      severityMult: this.variantSeverityMult(),
      hfrMult,
    };
  }

  buildCfContext() {
    const n = this.cities.length;
    const p = this.pathogen;
    const comp = 0.55;
    const postOnset = (1 - p.asymp) * (1 - p.presymp);
    const tm = 1 - postOnset * 0.1 * comp;
    const ones = new Float64Array(9).fill(1);
    const capacity = new Float64Array(n);
    for (let c = 0; c < n; c++) capacity[c] = this.cities[c].beds * BED_SCALE * this.cities[c].pop * 10;
    return {
      transMult: new Float64Array(n).fill(tm),
      contactMult: Array.from({ length: n }, () => ones),
      capacity,
      mobility: 1,
      seasonal: this.seasonal(),
      variantMult: this.variantBetaMult(),
      severityMult: this.variantSeverityMult(),
      hfrMult: 1 - 0.15 * Math.min(1, this.day / 180),
    };
  }

  seasonal() {
    if (!this.pathogen.seasonal) return 1;
    const doy = dayOfYear(this.day);
    return 1 + 0.13 * Math.cos((2 * Math.PI * (doy - 15)) / 365);
  }
  variantBetaMult() { return this.variant ? 1 + (this.variant.betaMult - 1) * this.variant.share : 1; }
  variantSeverityMult() { return this.variant ? 1 + (this.variant.severity - 1) * this.variant.share : 1; }
  vaccineEscapeMult() {
    if (!this.variant) return 1;
    const fixed = this.vaccine.variantUpdate === 'done';
    return fixed ? 1 : 1 - (1 - this.variant.escape) * this.variant.share;
  }

  campaignActive(id) { return this.campaigns.some(c => c.id === id && c.until > this.day); }

  // ---------- main tick ----------
  advanceDay() {
    if (this.over) return;
    this.day++;
    const ctx = this.buildContext();
    this.lastCtx = ctx;
    this.sim.step(ctx);
    this.cf.step(this.buildCfContext());

    this.updateVariant();
    this.updateVaccination();
    this.updateReporting();
    this.updateResearch();
    this.updateVaccinePipeline();
    this.updateFunding();
    this.updateNPIAdoption();
    this.updateMeters();
    this.updateBudget();
    this.expireModifiers();
    this.runStory();
    this.rollRandomEvent();
    this.recordHistory();
    this.checkEnd();
    this.emit('day', this.day);
  }

  // ---------- reporting ----------
  updateReporting() {
    const n = this.cities.length;
    const detected = new Float64Array(n);
    const deathsNow = new Float64Array(n);
    for (let c = 0; c < n; c++) {
      const d = this.detection(c);
      const exp = this.sim.cityDaily('symOnset', c) * d.mild
        + this.sim.cityDaily('asymOnset', c) * d.asym
        + this.sim.cityDaily('hosp', c) * d.hosp;
      detected[c] = exp < 25 ? this.rng.poisson(exp) : Math.round(exp);
      const dExp = this.sim.cityDaily('deaths', c) * (this.knowledge.assay ? 0.93 : 0.6);
      deathsNow[c] = dExp < 25 ? this.rng.poisson(dExp) : Math.round(dExp);
    }
    // backlog modifiers (data dumps)
    for (const m of this.modifiers) {
      if (m.type === 'backlog' && !m.applied) { detected[m.city] += m.amount; m.applied = true; }
    }
    this.caseQueue.push(detected);
    this.deathQueue.push(deathsNow);
    const reported = this.caseQueue.shift();
    const repDeaths = this.deathQueue.shift();
    let total = 0;
    const firsts = [];
    for (let c = 0; c < n; c++) {
      const city = this.cities[c];
      city.repCases.push(reported[c]);
      city.repDeaths.push(repDeaths[c]);
      city.repCum += reported[c];
      city.repDeathsCum += repDeaths[c];
      total += reported[c];
      if (reported[c] > 0 && city.firstReportDay == null) {
        city.firstReportDay = this.day;
        if (this.day > 1) firsts.push(city.name);
      }
    }
    if (firsts.length) this.toast(`First reported case${firsts.length > 1 ? 's' : ''}: ${listNames(firsts)}`, 'warn');
    this.zeroReportStreak = total === 0 ? this.zeroReportStreak + 1 : 0;
    this.updateRtEstimate();
  }

  avgHosp() {
    const p = this.pathogen;
    return p.hosp[0] * 0.22 + p.hosp[1] * 0.61 + p.hosp[2] * 0.17;
  }

  updateRtEstimate() {
    if (this.knowledge.transmission) {
      this.rtEstimate = Math.max(0, this.sim.nationalRt() + this.rng.normal(0, 0.03));
      return;
    }
    const h = this.history;
    if (h.length < 15) { this.rtEstimate = null; return; }
    const now = this.nationalReported7();
    const prev = h[h.length - 7].repCases7;
    if (now < 3 || prev < 3) { this.rtEstimate = null; return; }
    const r = Math.log(now / prev) / 7;
    const Tg = this.pathogen.latent + this.pathogen.infectious / 2;
    this.rtEstimate = clamp(Math.exp(r * Tg) + this.rng.normal(0, 0.12), 0, 6);
  }

  // ---------- research ----------
  startResearch(id) {
    const proj = PROJECT_BY_ID[id];
    if (!proj) return { ok: false, msg: 'Unknown project' };
    const avail = projectAvailable(this, proj);
    if (!avail.ok) return { ok: false, msg: avail.why };
    this.spend(proj.cost);
    this.research.active.push({ id, progress: 0, days: proj.days, started: this.day });
    this.research.attempts[id] = (this.research.attempts[id] || 0) + 1;
    return { ok: true, msg: `${proj.name} started (${proj.days} days)` };
  }

  updateResearch() {
    const speed = this.policy.eoc === 1 ? 1.15 : 1;
    const finished = [];
    for (const r of this.research.active) {
      r.progress += speed;
      if (r.progress >= r.days) finished.push(r);
    }
    for (const r of finished) {
      this.research.active = this.research.active.filter(x => x !== r);
      this.research.done.add(r.id);
      this.completeResearch(r.id);
    }
  }

  completeResearch(id) {
    const p = this.pathogen;
    const proj = PROJECT_BY_ID[id];
    const k = this.knowledge;
    switch (id) {
      case 'sequencing':
        k.sequenced = true;
        p.diseaseShortKnown = true;
        this.adjust({ leadership: 4, trust: 1 });
        this.addMessage('lab', `Sequencing complete: ${p.name}`,
          `It's a novel ${p.common} (family ${p.family}). We're calling it ${p.name} (${p.short}); the illness is ${p.disease}. ` +
          `Closest known relatives share under 70% genome identity. Primers for a PCR assay and antigen targets for vaccine design are ready.`, 'good');
        break;
      case 'assay':
        k.assay = true;
        this.adjust({ leadership: 3 });
        this.addMessage('lab', 'PCR assay validated and shipping',
          'Test kits are going out to every public health lab today. Confirmed case counts will now be far more accurate. Fund testing in cities from the EOC to find more cases.', 'good');
        break;
      case 'transmission':
        k.transmission = true;
        this.addMessage('lab', 'Transmission study results',
          `R0 ≈ ${p.R0.toFixed(2)}. Main route: ${ROUTES[p.route].label.toLowerCase()}. About ${Math.round(p.presymp * 100)}% of transmission happens before symptoms start` +
          `${p.presymp > 0.3 ? ', so isolating sick people alone will not stop it' : ', so isolating symptomatic cases works very well'}. ${ROUTES[p.route].note}`, 'good');
        break;
      case 'severity': {
        k.severity = true;
        const ifr = (a) => (p.hosp[a] * p.hfr[a] * 100).toFixed(a === 2 ? 1 : 2);
        this.addMessage('lab', 'Clinical severity study results',
          `Infection fatality rate by age: 0–17: ${ifr(0)}%, 18–64: ${ifr(1)}%, 65+: ${ifr(2)}%. Overall IFR ≈ ${(p.ifr * 100).toFixed(2)}%. ` +
          `Incubation ≈ ${p.incubation.toFixed(1)} days. ${p.pediatricSkew ? 'Unusually, children are hospitalized at higher rates than adults.' : 'Risk climbs steeply with age, so protecting seniors saves the most lives.'}`, 'good');
        break;
      }
      case 'serosurvey': {
        const trueInf = this.sim.totalCum('inf');
        const rep = this.totalReportedCases();
        k.sero = { day: this.day, trueInf, reported: rep, ratio: rep > 0 ? trueInf / rep : null, prevalence: trueInf / this.totalPop };
        this.research.cooldown.serosurvey = this.day + 30;
        this.addMessage('lab', 'Serosurvey results',
          `About ${(k.sero.prevalence * 100).toFixed(2)}% of residents in the 26 metros have antibodies, which is roughly ${fmtBig(trueInf)} infections. ` +
          `That's ${k.sero.ratio ? k.sero.ratio.toFixed(1) + '× ' : ''}more than reported cases.`, 'good');
        break;
      }
      case 'rapid':
        k.rapid = true;
        this.addMessage('lab', 'Rapid antigen test authorized', 'Fifteen-minute tests are rolling out. Detection rises everywhere and testing costs drop by 40%.', 'good');
        break;
      case 'genomic':
        k.genomic = true;
        this.addMessage('lab', 'Genomic surveillance online', 'We now sequence about 5% of positive samples. New variants will show up weeks earlier.', 'good');
        if (this.variant && !this.variant.detected) this.detectVariant();
        break;
      case 'wastewater':
        k.wastewater = true;
        this.addMessage('lab', 'Wastewater surveillance online', 'All 26 metros are now reporting sewage viral loads. Hidden spread shows up as halos on the EOC map.', 'good');
        break;
      case 'therapeutics':
        if (this.rng.chance(PROJECT_BY_ID.therapeutics.success)) {
          k.therapeutics = true;
          this.adjust({ trust: 3, leadership: 4 });
          this.addMessage('lab', 'Treatment works!', 'The trial met its primary endpoint: hospitalized patients on the drug combo have about a third lower risk of dying. Guidance to clinicians is going out now.', 'good');
        } else {
          this.addMessage('lab', 'Therapeutics trial failed', 'The candidate drugs did no better than placebo. We have other candidates and can start another trial.', 'bad');
        }
        break;
    }
    this.toast(`Lab: ${proj.name} complete`, 'good');
    this.emit('research', id);
  }

  // ---------- vaccines ----------
  startVaccine(platformId, funding = 'standard') {
    if (!this.knowledge.sequenced) return { ok: false, msg: 'Sequence the pathogen first' };
    const active = this.vaccine.candidates.filter(v => v.stage !== 'failed' && v.stage !== 'authorized');
    if (active.length >= 3) return { ok: false, msg: 'Maximum three candidates in development' };
    const pl = PLATFORMS[platformId];
    const cost = stageCost(pl, 'design', funding);
    if (this.budget < cost) return { ok: false, msg: 'Insufficient budget' };
    const cand = newCandidate(this, platformId, funding);
    this.spend(cost);
    this.vaccine.candidates.push(cand);
    cand.log.push(`Day ${this.day}: program launched`);
    this.misinfo = clamp(this.misinfo + 1, 0, 100);
    return { ok: true, msg: `${cand.name} launched` };
  }

  setVaccineFunding(id, funding) {
    const cand = this.vaccine.candidates.find(v => v.id === id);
    if (!cand || cand.stage === 'authorized' || cand.stage === 'failed') return { ok: false, msg: 'Not possible' };
    if (cand.funding === funding) return { ok: true };
    cand.funding = funding;
    const pl = PLATFORMS[cand.platform];
    const remainingFrac = 1 - cand.stageDay / Math.max(1, cand.stageDays);
    if (cand.stage !== 'phase3' && cand.stage !== 'review') {
      const newDays = stageDuration(pl, cand.stage, funding);
      cand.stageDays = Math.round(cand.stageDay + newDays * remainingFrac);
    }
    return { ok: true, msg: funding === 'accelerated' ? 'Accelerated funding: later phases cost more but run in parallel' : 'Returned to standard funding' };
  }

  startAtRisk(id) {
    const cand = this.vaccine.candidates.find(v => v.id === id);
    if (!cand || cand.atRisk || cand.mfgStart != null) return { ok: false, msg: 'Not possible' };
    if (!['phase2', 'phase3', 'review'].includes(cand.stage)) return { ok: false, msg: 'Available from Phase II' };
    if (this.budget < AT_RISK_COST) return { ok: false, msg: 'Insufficient budget' };
    this.spend(AT_RISK_COST);
    cand.atRisk = true;
    cand.mfgStart = this.day;
    cand.log.push(`Day ${this.day}: at-risk manufacturing started`);
    return { ok: true, msg: 'Manufacturing started at risk. Doses are stockpiling.' };
  }

  expandTrial(id) {
    const cand = this.vaccine.candidates.find(v => v.id === id);
    if (!cand || cand.stage !== 'phase3' || cand.expanded) return { ok: false, msg: 'Not possible' };
    if (this.budget < 110) return { ok: false, msg: 'Insufficient budget' };
    this.spend(110);
    cand.expanded = true;
    return { ok: true, msg: 'Trial expanded to international sites with active transmission' };
  }

  challengeTrial(id) {
    const cand = this.vaccine.candidates.find(v => v.id === id);
    if (!cand || cand.stage !== 'phase3' || cand.challenge) return { ok: false, msg: 'Not possible' };
    if (cand.stageDay < 21) return { ok: false, msg: 'Needs 3 weeks of Phase III safety data first' };
    cand.challenge = true;
    cand.endpoints += 55;
    this.adjust({ trust: -5, leadership: 1 });
    cand.log.push(`Day ${this.day}: human challenge study added`);
    return { ok: true, msg: 'Human challenge study authorized. Ethicists are divided.' };
  }

  setStrategy(s) { this.vaccine.strategy = s; return { ok: true, msg: 'Allocation strategy updated' }; }

  buyUpgrade(id) {
    const up = ADMIN_UPGRADES.find(u => u.id === id);
    if (!up || this.vaccine.upgrades.has(id)) return { ok: false, msg: 'Not possible' };
    if (this.budget < up.cost) return { ok: false, msg: 'Insufficient budget' };
    this.spend(up.cost);
    this.vaccine.upgrades.add(id);
    this.vaccine.adminCapacity += up.capacity;
    this.vaccine.uptakeBonus += up.uptake;
    return { ok: true, msg: `${up.name} funded` };
  }

  startPediatric() {
    if (!this.authorizedCount) return { ok: false, msg: 'Needs an authorized vaccine' };
    if (this.vaccine.pediatric) return { ok: false, msg: 'Already underway' };
    if (this.budget < 60) return { ok: false, msg: 'Insufficient budget' };
    this.spend(60);
    this.vaccine.pediatric = { start: this.day, days: 70 };
    return { ok: true, msg: 'Pediatric trial started (≈70 days)' };
  }

  startVariantUpdate() {
    if (!this.variant || !this.variant.detected || this.variant.escape >= 0.99) return { ok: false, msg: 'No escape variant detected' };
    if (!this.knowledge.genomic) return { ok: false, msg: 'Needs the genomic surveillance network' };
    if (!this.authorizedCount) return { ok: false, msg: 'Needs an authorized vaccine' };
    if (this.vaccine.variantUpdate) return { ok: false, msg: 'Already underway' };
    if (this.budget < 120) return { ok: false, msg: 'Insufficient budget' };
    this.spend(120);
    this.vaccine.variantUpdate = { start: this.day, days: 42 };
    return { ok: true, msg: 'Variant-adapted vaccine in development (≈42 days)' };
  }

  updateVaccinePipeline() {
    const v = this.vaccine;
    const trueInc7 = this.trueIncidence7();
    for (const cand of v.candidates) {
      const pl = PLATFORMS[cand.platform];
      // production
      if (cand.mfgStart != null && cand.stage !== 'failed') {
        const rate = productionRate(cand, this.day) + (cand.bonusRate || 0);
        cand.produced += rate * 1e6;
        cand.stock += rate * 1e6;
      }
      if (cand.stage === 'failed' || cand.stage === 'authorized') continue;
      if (cand.waitingFunds) {
        const cost = stageCost(pl, cand.stage, cand.funding);
        if (this.budget >= cost) { this.spend(cost); cand.waitingFunds = false; cand.log.push(`Day ${this.day}: funding secured`); }
        else continue;
      }
      if (cand.pausedUntil && this.day < cand.pausedUntil) continue;
      cand.stageDay += 1;
      if (cand.stage === 'phase3') {
        const factor = 2.2 * (cand.expanded ? 1.6 : 1) * (cand.funding === 'accelerated' ? 1.25 : 1);
        cand.endpoints += 15000 * trueInc7 * factor + (cand.expanded ? 0.7 : 0.08);
        if (cand.stageDay >= cand.stageDays && cand.endpoints >= ENDPOINTS_NEEDED) this.phase3Readout(cand);
        continue;
      }
      if (cand.stageDay < cand.stageDays) continue;
      if (cand.stage === 'review') {
        if (this.rng.chance(STAGE_SUCCESS.review)) this.authorize(cand);
        else {
          cand.stageDay = 0; cand.stageDays = 21;
          cand.log.push(`Day ${this.day}: FDA requested more manufacturing data`);
          this.addMessage('vaccine', `${cand.name}: FDA needs more data`, 'Reviewers want more manufacturing consistency data. Expect about three more weeks.', 'bad');
        }
        continue;
      }
      // design / preclinical / phase1 / phase2 end
      const ok = this.rng.chance(STAGE_SUCCESS[cand.stage] ?? 1);
      if (!ok) { this.failCandidate(cand, `${STAGE_LABEL[cand.stage]} did not meet its goals`); continue; }
      if (cand.stage === 'phase2') {
        const lo = Math.max(0.3, cand.efficacy - 0.1 + this.rng.range(-0.04, 0.04));
        cand.effHint = [lo, Math.min(0.98, lo + 0.2)];
      }
      const next = STAGES[STAGES.indexOf(cand.stage) + 1];
      this.enterStage(cand, next);
    }

    // pediatric + variant update programs
    if (v.pediatric && v.pediatric !== 'authorized' && this.day >= v.pediatric.start + v.pediatric.days) {
      v.pediatric = 'authorized';
      this.addMessage('vaccine', 'Vaccine authorized for children', 'The FDA extended authorization to ages 5–17. Children are now eligible under every allocation strategy.', 'good');
      this.toast('Children are now eligible for vaccination', 'good');
    }
    if (v.variantUpdate && v.variantUpdate !== 'done' && this.day >= v.variantUpdate.start + v.variantUpdate.days) {
      v.variantUpdate = 'done';
      this.addMessage('vaccine', 'Variant-adapted vaccine ready', `New doses now match the ${this.variant?.name ?? 'new'} variant, so full protection is back.`, 'good');
    }
  }

  enterStage(cand, stage) {
    const pl = PLATFORMS[cand.platform];
    cand.stage = stage;
    cand.stageDay = 0;
    cand.stageDays = stageDuration(pl, stage, cand.funding);
    cand.log.push(`Day ${this.day}: entered ${STAGE_LABEL[stage]}`);
    const cost = stageCost(pl, stage, cand.funding);
    if (cost > 0) {
      if (this.budget >= cost) this.spend(cost);
      else {
        cand.waitingFunds = true;
        this.addMessage('vaccine', `${cand.name} is waiting for funding`, `${STAGE_LABEL[stage]} costs $${cost}M. The program is paused until the budget can cover it. Ask the Director to request emergency funds.`, 'bad');
      }
    }
    if (stage === 'phase1') this.toast(`${cand.name}: first volunteers dosed in Phase I`, 'good');
    if (stage === 'phase3') {
      this.toast(`${cand.name} enters Phase III (30,000 volunteers)`, 'good');
      this.addMessage('vaccine', `${cand.name} enters Phase III`,
        `Thirty thousand volunteers are enrolling. Efficacy readout needs ${ENDPOINTS_NEEDED} confirmed cases among participants and at least ${cand.stageDays} days of follow-up. ` +
        'Endpoints build up faster when there is more transmission, so suppressing the outbreak slows the trial. You can expand to international sites if needed.', 'info');
    }
  }

  phase3Readout(cand) {
    if (cand.efficacy >= 0.5) {
      cand.effKnown = true;
      cand.log.push(`Day ${this.day}: Phase III efficacy ${(cand.efficacy * 100).toFixed(0)}%`);
      this.adjust({ trust: 3, leadership: 5 });
      this.addMessage('vaccine', `${cand.name}: ${(cand.efficacy * 100).toFixed(0)}% effective!`,
        `Phase III hit its primary endpoint: ${Math.round(cand.efficacy * 100)}% efficacy against infection, and even higher against severe disease. We're filing for Emergency Use Authorization.`, 'good');
      this.toast(`Phase III success: ${(cand.efficacy * 100).toFixed(0)}% efficacy`, 'good');
      this.enterStage(cand, 'review');
    } else {
      this.failCandidate(cand, `Phase III efficacy was only ${(cand.efficacy * 100).toFixed(0)}%, below the FDA's 50% bar`);
    }
  }

  authorize(cand) {
    cand.stage = 'authorized';
    cand.log.push(`Day ${this.day}: Emergency Use Authorization granted`);
    if (cand.mfgStart == null) {
      cand.mfgStart = this.day;
      const contract = Math.round(AT_RISK_COST * 0.6);
      this.spend(contract);
    }
    if (this.vaccine.authorizedDay == null) this.vaccine.authorizedDay = this.day;
    this.adjust({ trust: 4, leadership: 9 });
    this.addMessage('director', `EUA granted: ${cand.name}`,
      `The FDA has authorized ${cand.name}. ${cand.stock > 0 ? `We have ${fmtBig(cand.stock)} doses stockpiled from at-risk manufacturing. ` : 'Manufacturing is ramping up from zero, so supply will be tight for weeks. '}` +
      'Set the allocation strategy in the Vaccine Wing and make sure the country can actually deliver the shots.', 'good');
    this.toast(`FDA authorizes ${cand.name}!`, 'good');
    if (cand.platform === 'vector' && this.rng.chance(0.35)) this.flags.vectorSignalPending = true;
  }

  failCandidate(cand, reason) {
    cand.stage = 'failed';
    cand.failReason = reason;
    cand.log.push(`Day ${this.day}: discontinued: ${reason}`);
    if (cand.stock > 0) cand.stock = 0;
    this.adjust({ trust: -2, leadership: -3 });
    this.addMessage('vaccine', `${cand.name} discontinued`, `${reason}. Any stockpiled doses are written off. Launch a new candidate on another platform; our sequencing and antigen work carries over.`, 'bad');
    this.toast(`${cand.name} failed: ${reason}`, 'bad');
  }

  trueIncidence7() {
    const h = this.history;
    const n = Math.min(7, h.length);
    if (!n) return 0;
    let s = 0;
    for (let i = h.length - n; i < h.length; i++) s += h[i].trueInf;
    return s / n / this.totalPop;
  }

  willingness(c, a) {
    const city = this.cities[c];
    const base = 0.42 + 0.42 * (this.trust / 100) - 0.22 * (this.misinfo / 100) + city.confidence + this.vaccine.uptakeBonus;
    const ageAdj = [-0.08, 0, 0.12][a];
    const campaign = this.campaignActive('confidence') ? 0.07 : 0;
    let mod = 0;
    for (const m of this.modifiers) if (m.type === 'uptake' && (m.city == null || m.city === c)) mod += m.add;
    return clamp(base + ageAdj + campaign + mod, 0.15, 0.95);
  }

  updateVaccination() {
    const v = this.vaccine;
    v.todayGiven = 0;
    // mature pending immunity
    if (v.pending.length) {
      const keep = [];
      for (const item of v.pending) {
        if (item.day <= this.day) this.sim.applyVaccination(item.c, item.a, item.prot, item.nonresp);
        else keep.push(item);
      }
      v.pending = keep;
    }
    const auth = this.authorizedCandidates().filter(c => c.stock >= 1);
    if (!auth.length) return;
    auth.sort((a, b) => b.efficacy - a.efficacy);
    let courses = auth.reduce((s, c) => s + c.stock / PLATFORMS[c.platform].doses, 0);
    const usesMrna = auth.some(c => c.platform === 'mrna');
    const adminFactor = usesMrna && !v.upgrades.has('coldChain') ? PLATFORMS.mrna.adminFactor : 1;
    let budgetToday = Math.min(courses, v.adminCapacity * 1e6 * adminFactor);
    if (budgetToday < 1) return;

    const n = this.cities.length;
    const kidsOK = v.pediatric === 'authorized';
    const demand = (c, a) => {
      if (a === 0 && !kidsOK) return 0;
      const i = c * A + a;
      const alive = this.sim.N[i] - this.sim.D[i];
      return Math.max(0, this.willingness(c, a) * alive - this.cities[c].vax[a]);
    };
    const tiers = {
      elderly: [[2], [1], [0]],
      adults: [[1], [2], [0]],
      prorata: [[0, 1, 2]],
      hotspots: [[0, 1, 2]],
    }[v.strategy] || [[0, 1, 2]];
    const hotspotW = c => 1 + 4 * Math.min(1, this.cityIncidence(c) / 40) + (this.cities[c].surge ? 1 : 0);
    const cityW = c => (v.strategy === 'hotspots' ? hotspotW(c) : 1) + (this.cities[c].surge ? 0.5 : 0);

    const allocations = [];
    for (const tier of tiers) {
      if (budgetToday < 1) break;
      const cells = [];
      let total = 0, wTotal = 0;
      for (let c = 0; c < n; c++) for (const a of tier) {
        const d = demand(c, a);
        if (d <= 0) continue;
        const w = d * cityW(c);
        cells.push({ c, a, d, w });
        total += d; wTotal += w;
      }
      if (total <= 0) continue;
      const give = Math.min(budgetToday, total);
      for (const cell of cells) {
        const x = Math.min(cell.d, give * cell.w / wTotal);
        allocations.push({ c: cell.c, a: cell.a, x });
        budgetToday -= x;
      }
    }

    // consume stock from best candidates first
    let given = 0;
    const escape = this.vaccineEscapeMult();
    let cIdx = 0;
    for (const al of allocations) {
      let remaining = al.x;
      while (remaining > 0.5 && cIdx < auth.length) {
        const cand = auth[cIdx];
        const pl = PLATFORMS[cand.platform];
        const avail = cand.stock / pl.doses;
        const take = Math.min(avail, remaining);
        cand.stock -= take * pl.doses;
        if (cand.stock < pl.doses) cIdx++;
        remaining -= take;
        const city = this.cities[al.c];
        const i = al.c * A + al.a;
        const alive = this.sim.N[i] - this.sim.D[i];
        const unvax = Math.max(1, alive - city.vax[al.a]);
        const fracS = clamp(this.sim.S[i] / unvax, 0, 1);
        city.vax[al.a] += take;
        given += take;
        const ve = cand.efficacy * escape;
        const toS = take * fracS;
        v.pending.push({ day: this.day + IMMUNITY_DELAY, c: al.c, a: al.a, prot: toS * ve, nonresp: toS * (1 - ve) });
      }
    }
    v.todayGiven = given;
    v.administeredTotal += given;
    if (given > 0) this.spend(given / 1e6 * 2.5, true);
    if (given > 0 && v.firstShotDay == null) {
      v.firstShotDay = this.day;
      this.emit('firstShot');
    }
  }

  // ---------- variants ----------
  introduceVariant({ name, betaMult = 1.4, escape = 0.85, severity = 1.1, city }) {
    if (this.variant) return;
    this.variant = { name, betaMult, escape, severity, share: 0.015, day: this.day, detected: false, city };
    if (city != null) { this.sim.seed(city, 25, 'I'); this.cf.seed(city, 25, 'I'); }
    if (this.knowledge.genomic) this.detectVariant();
  }
  detectVariant() {
    const v = this.variant;
    if (!v || v.detected) return;
    v.detected = true;
    this.addMessage('lab', `Variant detected: ${v.name}`,
      `Genomic surveillance flagged ${v.name}. Early data suggest it is ~${Math.round((v.betaMult - 1) * 100)}% more transmissible` +
      `${v.escape < 0.95 ? ' and partly evades vaccine protection. You can commission a variant-adapted vaccine in the Vaccine Wing' : ''}.`, 'bad');
    this.toast(`New variant detected: ${v.name}`, 'bad');
  }
  updateVariant() {
    const v = this.variant;
    if (!v || v.share >= 0.999) return;
    const before = v.share;
    v.share = Math.min(1, v.share + v.share * (1 - v.share) * 0.06);
    const delta = v.share - before;
    if (v.escape < 1 && this.vaccine.variantUpdate !== 'done') {
      this.sim.escape(delta * (1 - v.escape) * 0.6);
    }
    if (!v.detected && v.share > 0.45) this.detectVariant();
  }

  // ---------- city actions ----------
  setCityNPI(c, level) {
    const city = this.cities[c];
    city.rec = clamp(level, 0, 4);
    this.flags.npiSet = true;
    if (city.rec < city.level) { city.level = city.rec; city.levelSince = this.day; }
    return { ok: true, msg: `Recommended "${NPI_LEVELS[city.rec].name}" to ${city.name} officials` };
  }
  setNationalNPI(level) {
    for (let c = 0; c < this.cities.length; c++) this.setCityNPI(c, level);
    return { ok: true, msg: `Nationwide recommendation: ${NPI_LEVELS[level].name}` };
  }
  setCityTesting(c, level) {
    if (!this.knowledge.assay) return { ok: false, msg: 'Needs the PCR assay' };
    this.cities[c].testing = clamp(level, 0, 3);
    return { ok: true, msg: `${this.cities[c].name} testing set to level ${level}` };
  }
  deployTeam(c) {
    const city = this.cities[c];
    if (city.team) return { ok: false, msg: 'Team already assigned' };
    if (this.teamsAvailable() <= 0) return { ok: false, msg: 'No field teams available' };
    city.team = { arrive: this.day + 2 };
    this.flags.teamDeployed = true;
    return { ok: true, msg: `EIS field team en route to ${city.name} (arrives in 2 days)` };
  }
  recallTeam(c) {
    const city = this.cities[c];
    if (!city.team) return { ok: false, msg: 'No team there' };
    city.team = null;
    return { ok: true, msg: `Field team recalled from ${city.name}` };
  }
  deploySNS(c) {
    if (this.sns.units <= 0) return { ok: false, msg: 'Strategic National Stockpile exhausted' };
    const city = this.cities[c];
    if (city.sns >= 2) return { ok: false, msg: 'Max two shipments per city' };
    this.sns.units--;
    city.sns++;
    return { ok: true, msg: `Ventilators & PPE shipped to ${city.name} (+20% capacity)` };
  }
  fmsCost(c) { return Math.round(3 + 2 * this.cities[c].pop); }
  deployFMS(c) {
    const city = this.cities[c];
    if (city.fms >= 2) return { ok: false, msg: 'Max two field hospitals per city' };
    const cost = this.fmsCost(c);
    if (this.budget < cost) return { ok: false, msg: 'Insufficient budget' };
    this.spend(cost);
    city.fms++;
    return { ok: true, msg: `Federal Medical Station set up in ${city.name}` };
  }
  toggleSurge(c) {
    const city = this.cities[c];
    city.surge = !city.surge;
    return { ok: true, msg: city.surge ? `${city.name} prioritized for vaccine doses` : `${city.name} back to normal allocation` };
  }

  // ---------- national ----------
  setTravel(level) {
    this.policy.travel = clamp(level, 0, 2);
    return { ok: true, msg: TRAVEL_LEVELS[this.policy.travel].name };
  }
  setEOC(level) {
    this.policy.eoc = level;
    if (level <= 2) this.flags.han = true;
    return { ok: true, msg: `EOC activation set to Level ${level}` };
  }
  toggleElderGuidance() {
    this.policy.elderGuidance = !this.policy.elderGuidance;
    if (this.policy.elderGuidance) this.adjust({ trust: -1 });
    return { ok: true, msg: this.policy.elderGuidance ? 'Long-term care visitor restrictions recommended' : 'Visitor restrictions lifted' };
  }

  // ---------- press ----------
  pressBriefing(tone) {
    if (this.day < this.briefing.cooldownUntil) return { ok: false, msg: `Next briefing possible on day ${this.briefing.cooldownUntil}` };
    this.briefing.cooldownUntil = this.day + 7;
    this.flags.briefed = true;
    const cases = this.nationalReported7();
    const room = clamp((100 - this.trust) / 45, 0.15, 1); // diminishing returns near the top
    if (tone === 'transparent') {
      this.adjust({ trust: 3.5 * room, misinfo: -2 });
      this.fear = Math.min(0.2, this.fear + 0.01);
      return { ok: true, msg: 'Transparent briefing: trust up. Reporters appreciated the candor.' };
    }
    if (tone === 'reassuring') {
      this.adjust({ trust: 5 * room, leadership: 3 });
      this.briefing.reassuringCheck = { day: this.day + 21, cases: Math.max(5, cases) };
      return { ok: true, msg: 'Reassuring briefing: markets calmer. Hope the numbers cooperate…' };
    }
    if (tone === 'urgent') {
      this.adjust({ trust: 1, leadership: -2 });
      this.briefing.urgentUntil = this.day + 30;
      return { ok: true, msg: 'Urgent warning issued: compliance will rise for about a month.' };
    }
    return { ok: false, msg: 'Unknown tone' };
  }

  startCampaign(id) {
    const def = CAMPAIGNS.find(c => c.id === id);
    if (!def) return { ok: false, msg: 'Unknown campaign' };
    if (this.campaignActive(id)) return { ok: false, msg: 'Already running' };
    if (this.budget < def.cost) return { ok: false, msg: 'Insufficient budget' };
    this.spend(def.cost);
    this.campaigns.push({ id, until: this.day + def.days, started: this.day });
    return { ok: true, msg: `${def.name} campaign launched` };
  }

  // ---------- director ----------
  requestFunding() {
    if (this.funding.pending) return { ok: false, msg: 'A request is already before Congress' };
    if (this.day < this.funding.cooldownUntil) return { ok: false, msg: `Congress won't take another request until day ${this.funding.cooldownUntil}` };
    this.funding.pending = { decideDay: this.day + 12 };
    this.funding.requests++;
    return { ok: true, msg: 'Supplemental funding request sent to Congress (decision in ~12 days)' };
  }
  updateFunding() {
    const f = this.funding;
    if (!f.pending || this.day < f.pending.decideDay) return;
    const severity = Math.min(1, this.totalReportedDeaths() / 15000 + this.overflowCities() / 6 + this.totalReportedCases() / 400000);
    const prob = clamp(0.25 + 0.4 * severity + 0.35 * (this.leadership / 100) - 0.05 * Math.max(0, f.requests - 2), 0.1, 0.95);
    f.pending = null;
    f.cooldownUntil = this.day + 35;
    if (this.rng.chance(prob)) {
      const amount = Math.round((500 + 1500 * severity + this.rng.range(0, 400)) / 10) * 10;
      this.budget += amount;
      this.adjust({ leadership: 2 });
      this.addMessage('director', `Congress approves $${amount}M`, `The supplemental appropriation passed. The money is available immediately.`, 'good');
      this.toast(`Congress approves $${amount}M`, 'good');
    } else {
      this.addMessage('director', 'Funding request stalled', 'The supplemental bill stalled in committee. Members said the threat "has not been demonstrated." You can try again in about five weeks.', 'bad');
      this.toast('Funding request failed in Congress', 'bad');
    }
  }
  hireTeams() {
    if (this.teams.total >= 12) return { ok: false, msg: 'EIS is fully deployed' };
    if (this.budget < 18) return { ok: false, msg: 'Insufficient budget' };
    this.spend(18);
    this.teams.total += 2;
    return { ok: true, msg: 'Two more field teams recruited (EIS officers + state epidemiologists)' };
  }
  expandLab() {
    if (this.research.slots >= 4) return { ok: false, msg: 'Lab at maximum capacity' };
    const cost = this.research.slots === 2 ? 45 : 80;
    if (this.budget < cost) return { ok: false, msg: 'Insufficient budget' };
    this.spend(cost);
    this.research.slots++;
    return { ok: true, msg: 'Lab capacity expanded: one more concurrent project' };
  }
  restockSNS() {
    if (this.sns.units >= 6) return { ok: false, msg: 'Stockpile is full' };
    if (this.budget < 60) return { ok: false, msg: 'Insufficient budget' };
    this.spend(60);
    this.sns.units = Math.min(6, this.sns.units + 3);
    return { ok: true, msg: 'Stockpile replenished (+3 shipments)' };
  }

  // ---------- dynamics ----------
  updateNPIAdoption() {
    const adopted = {};
    const partial = [];
    for (const city of this.cities) {
      const inc = this.cityIncidence(city.idx);
      if (city.rec > city.level && this.day >= city.holdUntil) {
        let p = 0.17 * (0.55 + (this.trust / 100) * 0.9) * (this.policy.eoc === 1 ? 1.25 : 1) * (1 + Math.min(1, inc / 40));
        if (city.rec - city.level >= 2) p *= 0.85;
        if (this.rng.chance(p)) {
          let lvl = city.rec;
          if (city.rec >= 2 && this.rng.chance(city.resistance)) {
            lvl = city.rec - 1;
            city.holdUntil = this.day + 21;
            if (lvl > city.level) partial.push(`${city.name} (only "${NPI_LEVELS[lvl].short}")`);
          } else {
            (adopted[lvl] ||= []).push(city.name);
          }
          if (lvl > city.level) { city.level = lvl; city.levelSince = this.day; }
        }
      } else if (city.rec < city.level && this.rng.chance(0.5)) {
        city.level = city.rec; city.levelSince = this.day;
      }
      // local officials act on their own when hospitals are overwhelmed
      if (city.level < 2 && this.cityHospitalLoad(city.idx) > 0.95 && this.rng.chance(0.06)) {
        city.level = 2; city.levelSince = this.day;
        this.addMessage('eoc', `${city.name} acts on its own`, `With hospitals full, ${city.name} officials issued a mask order and gathering limits without waiting for CDC guidance.`, 'warn');
      }
      // fatigue-driven easing
      if (city.level >= 3 && this.day - city.levelSince > 50 && this.compliance < 0.45 && inc < 15 && this.rng.chance(0.03)) {
        city.level -= 1; city.levelSince = this.day; city.holdUntil = this.day + 14;
        this.addMessage('eoc', `${city.name} eases restrictions`, `Facing public frustration, ${city.state} leaders relaxed measures in ${city.name} to "${NPI_LEVELS[city.level].name}" against CDC advice.`, 'warn');
      }
    }
    for (const lvl in adopted) this.toast(`Now in effect, "${NPI_LEVELS[lvl].name}": ${listNames(adopted[lvl])}`, 'info');
    if (partial.length) this.toast(`Partly adopted: ${listNames(partial)}`, 'warn');
  }

  updateMeters() {
    const pop = TOTAL_POP_M;
    let dis = 0, lvlAvg = 0;
    for (const c of this.cities) { dis += c.pop * NPI_LEVELS[c.level].disruption; lvlAvg += c.pop * c.level; }
    dis = dis / pop + TRAVEL_LEVELS[this.policy.travel].disruption;
    lvlAvg /= pop;
    this.disruption = clamp(dis, 0, 100);

    if (lvlAvg >= 1.5) this.fatigue += 0.0009 * lvlAvg;
    else this.fatigue -= 0.004;
    this.fatigue = clamp(this.fatigue, 0, 0.32);

    const deaths7 = this.nationalReported7('repDeaths');
    const perMillion = deaths7 / pop;
    const targetFear = Math.min(0.2, perMillion * 0.045);
    this.fear += (targetFear - this.fear) * 0.08;
    const urgent = this.day < this.briefing.urgentUntil ? 0.07 : 0;
    let compMod = 0;
    for (const m of this.modifiers) if (m.type === 'compliance') compMod += m.add;
    this.compliance = clamp(0.22 + 0.58 * (this.trust / 100) + this.fear - this.fatigue + urgent + compMod, 0.12, 0.95);

    // trust
    let dTrust = (55 - this.trust) * 0.008 - (this.misinfo / 100) * 0.06;
    if (this.disruption > 40) dTrust -= (this.disruption - 40) * 0.003;
    const overflow = this.overflowCities();
    dTrust -= overflow * 0.04;
    if (this.campaignActive('counter')) this.misinfo -= 0.45;
    const rc = this.briefing.reassuringCheck;
    if (rc && this.day >= rc.day) {
      this.briefing.reassuringCheck = null;
      if (this.nationalReported7() > rc.cases * 1.5) {
        dTrust -= 9;
        this.addMessage('comms', 'Credibility gap', 'Three weeks after we said things were under control, cases are up sharply. Pundits are replaying the clip on loop.', 'bad');
        this.toast('Reassuring briefing backfired: trust −9', 'bad');
      }
    }
    this.trust = clamp(this.trust + dTrust, 0, 100);

    // misinformation
    const trials = this.vaccine.candidates.some(c => c.stage !== 'failed');
    this.misinfo += 0.035 + (trials ? 0.04 : 0) + (this.vaccine.todayGiven > 0 ? 0.03 : 0);
    this.misinfo = clamp(this.misinfo, 0, 100);

    // leadership confidence
    let dLead = 0.04;
    dLead -= Math.min(1.2, deaths7 * 0.00055);
    let overflowPop = 0;
    for (const c of this.cities) if (this.cityHospitalLoad(c.idx) > 1) overflowPop += c.pop;
    dLead -= 0.6 * (overflowPop / pop);
    dLead -= Math.max(0, this.disruption - 25) * 0.008;
    if (this.budget < 0) dLead -= 0.25;
    if (this.day % 7 === 0 && this.history.length > 8) {
      const prev = this.history[this.history.length - 7].repCases7;
      const now = this.nationalReported7();
      if (prev > 20 && now < prev * 0.85) dLead += 1.2;
      if (prev > 20 && now > prev * 1.5) dLead -= 0.8;
    }
    this.leadership = clamp(this.leadership + dLead, 0, 100);
  }

  dailyCosts() {
    const k = this.knowledge;
    let teams = 0, testing = 0;
    for (const c of this.cities) {
      if (c.team) teams += TEAM_COST;
      testing += TESTING_COST * c.testing * c.pop * (k.rapid ? 0.6 : 1);
    }
    const eoc = this.policy.eoc === 1 ? 0.6 : this.policy.eoc === 2 ? 0.25 : 0;
    const travel = [0, 0.3, 0.5][this.policy.travel];
    const distribution = this.authorizedCount ? 0.8 : 0;
    return { teams, testing, eoc, travel, distribution, total: teams + testing + eoc + travel + distribution };
  }

  updateBudget() {
    const costs = this.dailyCosts();
    this.spend(costs.total, true);
  }

  spend(amount, silent = false) {
    this.budget -= amount;
    this.spentTotal += amount;
    if (!silent) this.emit('spend', amount);
  }

  adjust({ trust = 0, leadership = 0, misinfo = 0, budget = 0 } = {}) {
    this.trust = clamp(this.trust + trust, 0, 100);
    this.leadership = clamp(this.leadership + leadership, 0, 100);
    this.misinfo = clamp(this.misinfo + misinfo, 0, 100);
    this.budget += budget;
  }

  addModifier(m) { this.modifiers.push({ ...m, start: this.day }); }
  expireModifiers() { this.modifiers = this.modifiers.filter(m => m.until == null || m.until > this.day); }

  seedCity(c, count, stage = 'E', ageDist) {
    this.sim.seed(c, count, stage, ageDist);
    this.cf.seed(c, count, stage, ageDist);
  }

  // ---------- story + random events ----------
  runStory() {
    if (this.mode !== 'story') return;
    for (const beat of STORY_BEATS) {
      if (this.firedStory.has(beat.id)) continue;
      if (!beat.when(this)) continue;
      this.firedStory.add(beat.id);
      this.fireBeat(beat, 'story');
    }
  }

  fireBeat(def, source) {
    const ctx = def.setup ? def.setup(this) : {};
    if (ctx === false || (ctx && Object.values(ctx).some(v => v == null))) return; // no valid target right now
    const inst = {
      id: `${def.id}-${this.day}`,
      def, ctx, source,
      title: typeof def.title === 'function' ? def.title(this, ctx) : def.title,
      body: typeof def.body === 'function' ? def.body(this, ctx) : def.body,
      from: def.from ? CHARACTERS[def.from] : null,
      choices: def.choices ? def.choices.map(ch => ({
        label: typeof ch.label === 'function' ? ch.label(this, ctx) : ch.label,
        detail: typeof ch.detail === 'function' ? ch.detail(this, ctx) : ch.detail || '',
        disabled: ch.enabled ? !ch.enabled(this, ctx) : false,
      })) : null,
    };
    if (def.apply) def.apply(this, ctx);
    if (def.modal === false && !def.choices) {
      this.addMessage(def.from || 'eoc', inst.title, inst.body, def.kind || 'info');
      this.toast(`✉ ${inst.title}`, def.kind === 'bad' ? 'bad' : def.kind === 'good' ? 'good' : 'warn');
      return;
    }
    this.pendingEvents.push(inst);
    this.emit('event', inst);
  }

  resolveEvent(instId, choiceIdx) {
    const i = this.pendingEvents.findIndex(e => e.id === instId);
    if (i < 0) return { ok: false };
    const inst = this.pendingEvents[i];
    let result = '';
    if (inst.def.choices) {
      const ch = inst.def.choices[choiceIdx];
      if (!ch) return { ok: false };
      if (ch.enabled && !ch.enabled(this, inst.ctx)) return { ok: false, msg: 'Not available' };
      result = ch.effect ? ch.effect(this, inst.ctx) || '' : '';
      this.addMessage(inst.def.from || 'eoc', inst.title, `${inst.body}\n\nDecision: ${ch.label}.${result ? ' ' + result : ''}`, 'info');
    } else {
      this.addMessage(inst.def.from || 'eoc', inst.title, inst.body, inst.def.kind || 'info');
    }
    this.pendingEvents.splice(i, 1);
    return { ok: true, msg: result };
  }

  rollRandomEvent() {
    if (this.day < 8 || this.pendingEvents.length) return;
    const rate = this.diff.eventRate * (this.mode === 'story' ? 0.6 : 1);
    if (!this.rng.chance(rate)) return;
    const eligible = RANDOM_EVENTS.filter(e => {
      if (this.eventCooldown[e.id] && this.eventCooldown[e.id] > this.day) return false;
      if (e.once && this.eventCooldown[e.id]) return false;
      return !e.cond || e.cond(this);
    });
    const ev = this.rng.weighted(eligible, e => e.weight || 1);
    if (!ev) return;
    this.eventCooldown[ev.id] = this.day + (ev.cooldown || 60);
    this.fireBeat(ev, 'random');
  }

  pickCity(filter = () => true, weight = c => c.pop) {
    const list = this.cities.filter(filter);
    if (!list.length) return null;
    return this.rng.weighted(list, weight);
  }

  // ---------- history & end ----------
  recordHistory() {
    const s = this.sim;
    const prevCf = this.history.length ? this.history[this.history.length - 1].cfDeaths : 0;
    this.history.push({
      day: this.day,
      repCases: this.cities.reduce((t, c) => t + (c.repCases[c.repCases.length - 1] || 0), 0),
      repCases7: this.nationalReported7(),
      repDeaths: this.cities.reduce((t, c) => t + (c.repDeaths[c.repDeaths.length - 1] || 0), 0),
      repDeathsCum: this.totalReportedDeaths(),
      trueInf: s.totalDaily('inf'),
      trueDeaths: s.totalCum('deaths'),
      cfInf: this.cf.totalDaily('inf'),
      cfDeaths: Math.max(prevCf, this.cf.totalCum('deaths')),
      hosp: s.total('H'),
      cap: this.totalCapacity(),
      active: s.totalActive(),
      vax: this.vaccinatedTotal(),
      rt: s.nationalRt(),
      rtEst: this.rtEstimate,
      trust: this.trust,
      leadership: this.leadership,
      budget: this.budget,
    });
  }

  checkEnd() {
    if (this.over) return;
    if (this.leadership <= 0) return this.finish('fired');
    const active = this.sim.totalActive();
    if (this.day >= 30 && this.zeroReportStreak >= 28 && active < 150) return this.finish('contained');
    if (this.day >= 60 && active < 0.5) return this.finish('contained');
    if (this.day >= MAX_DAYS) return this.finish('timeout');
  }

  finish(kind) {
    this.over = true;
    const deaths = this.sim.totalCum('deaths');
    // Let the do-nothing scenario play out so lives-saved compares full outbreaks.
    // If the outbreak is over, compare against the full do-nothing epidemic; otherwise compare to the same date.
    const cfSameDay = this.cf.totalCum('deaths');
    if (kind === 'contained') {
      const cfCtx = this.buildCfContext();
      for (let i = 0; i < 400 && this.cf.totalActive() > 1; i++) this.cf.step(cfCtx);
    }
    const cfDeaths = Math.max(kind === 'contained' ? this.cf.totalCum('deaths') : cfSameDay, deaths);
    const infections = this.sim.totalCum('inf');
    const saved = Math.max(0, cfDeaths - deaths);
    const savedFrac = cfDeaths > 0 ? saved / cfDeaths : 1;
    const per100k = deaths / (this.totalPop / 1e5);
    let score = savedFrac * 60 + clamp(1 - per100k / 120, 0, 1) * 40;
    if (this.authorizedCount) score += 5;
    score += clamp((this.trust - 50) / 6, -6, 6);
    if (this.budget > 0) score += 2;
    if (kind === 'timeout') score -= 12;
    if (kind === 'fired') score = Math.min(score, 50);
    score = Math.max(0, score);
    const grade = score >= 100 ? 'A+' : score >= 92 ? 'A' : score >= 82 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';
    this.outcome = {
      kind,
      win: kind === 'contained',
      day: this.day,
      deaths, infections,
      reportedCases: this.totalReportedCases(),
      reportedDeaths: this.totalReportedDeaths(),
      cfDeaths, cfInfections: this.cf.totalCum('inf'),
      saved, savedFrac, score, grade, per100k,
      vaccinated: this.vaccinatedTotal(),
      spent: this.spentTotal,
    };
    this.emit('end', this.outcome);
  }
}

function listNames(names) {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function fmtBig(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e4) return Math.round(n / 1e3) + 'K';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toString();
}

export { PROJECTS, PLATFORMS, STAGE_LABEL, ADMIN_UPGRADES };
