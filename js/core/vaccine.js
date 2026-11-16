// Vaccine development pipeline: platforms, clinical phases, manufacturing.

export const PLATFORMS = {
  mrna: {
    id: 'mrna', name: 'mRNA', tagline: 'Fastest to design, needs ultra-cold storage',
    eff: [0.82, 0.95], doses: 2, startRate: 0.25, maxRate: 3.2, rampDays: 110, adminFactor: 0.85,
    stageDays: { design: 7, preclinical: 28, phase1: 28, phase2: 35, phase3: 56, review: 21 },
    costMult: 1.15, pros: ['Design in a week', 'High efficacy'], cons: ['Needs -70 °C freezers', 'Two doses'],
  },
  vector: {
    id: 'vector', name: 'Viral vector', tagline: 'Single dose, fridge-stable',
    eff: [0.62, 0.82], doses: 1, startRate: 0.2, maxRate: 1.7, rampDays: 120, adminFactor: 1.0,
    stageDays: { design: 12, preclinical: 32, phase1: 28, phase2: 40, phase3: 60, review: 21 },
    costMult: 1.0, pros: ['One dose', 'Ordinary fridge'], cons: ['Moderate efficacy', 'Rare clotting-signal risk'],
  },
  protein: {
    id: 'protein', name: 'Protein subunit', tagline: 'Proven technology, slower to scale',
    eff: [0.8, 0.92], doses: 2, startRate: 0.1, maxRate: 2.0, rampDays: 160, adminFactor: 1.0,
    stageDays: { design: 18, preclinical: 42, phase1: 32, phase2: 45, phase3: 63, review: 21 },
    costMult: 0.85, pros: ['High efficacy', 'Well-understood safety'], cons: ['Slowest to develop', 'Slow manufacturing ramp'],
  },
  inactivated: {
    id: 'inactivated', name: 'Inactivated virus', tagline: 'Classic approach, modest efficacy',
    eff: [0.55, 0.78], doses: 2, startRate: 0.15, maxRate: 1.2, rampDays: 120, adminFactor: 1.0,
    stageDays: { design: 14, preclinical: 40, phase1: 30, phase2: 42, phase3: 60, review: 21 },
    costMult: 0.75, pros: ['Familiar to the public', 'Cheap'], cons: ['Lower efficacy', 'Needs BSL-3 production'],
  },
};

export const STAGES = ['design', 'preclinical', 'phase1', 'phase2', 'phase3', 'review', 'authorized'];
export const STAGE_LABEL = {
  design: 'Antigen design',
  preclinical: 'Preclinical (animal studies)',
  phase1: 'Phase I · safety',
  phase2: 'Phase II · dosing & immune response',
  phase3: 'Phase III · efficacy',
  review: 'FDA review (EUA)',
  authorized: 'Authorized',
  failed: 'Discontinued',
};
export const STAGE_COST = { design: 25, preclinical: 35, phase1: 40, phase2: 110, phase3: 320, review: 0 };
export const STAGE_SUCCESS = { design: 1, preclinical: 0.93, phase1: 0.9, phase2: 0.86, review: 0.97 };
export const ENDPOINTS_NEEDED = 150;
export const AT_RISK_COST = 450;
export const ACCEL = { timeMult: 0.62, costMult: 1.6 };

export const ADMIN_UPGRADES = [
  { id: 'pharmacy', name: 'Retail pharmacy partnership', cost: 60, capacity: 0.55, uptake: 0.02, desc: 'Lets neighborhood pharmacies give shots.' },
  { id: 'massSites', name: 'Mass vaccination sites', cost: 140, capacity: 0.8, uptake: 0, desc: 'Run stadium and convention-center sites with the National Guard.' },
  { id: 'mobile', name: 'Mobile & community clinics', cost: 40, capacity: 0.2, uptake: 0.05, desc: 'Reaches rural, homebound and underserved residents. Increases uptake.' },
  { id: 'coldChain', name: 'Ultra-cold chain expansion', cost: 50, capacity: 0, uptake: 0, desc: 'Buys -70 °C freezers and dry-ice logistics, removing the mRNA distribution penalty.' },
];

export const STRATEGIES = [
  { id: 'elderly', name: 'Seniors first', desc: 'Doses go to people 65+ first, then adults, then children. Prevents the most deaths quickly.' },
  { id: 'adults', name: 'Working adults first', desc: 'Adults 18–64 first. They have the most contacts, so this cuts transmission fastest.' },
  { id: 'prorata', name: 'Everyone equally', desc: 'Eligible people of all ages share doses in proportion to population.' },
  { id: 'hotspots', name: 'Hotspots first', desc: 'Sends more doses to the cities with the highest current incidence.' },
];

let nextId = 1;

export function newCandidate(game, platformId, funding = 'standard') {
  const pl = PLATFORMS[platformId];
  const rng = game.rng;
  let eff = rng.range(pl.eff[0], pl.eff[1]) * game.pathogen.vaxEase;
  if (rng.chance(0.08)) eff = rng.range(0.32, 0.49); // the occasional dud
  eff = Math.min(0.97, eff);
  return {
    id: nextId++,
    platform: platformId,
    name: `${pl.name} candidate ${String.fromCharCode(64 + game.vaccine.candidates.length + 1)}`,
    stage: 'design',
    stageDay: 0,
    stageDays: stageDuration(pl, 'design', funding),
    funding,
    efficacy: eff,
    effKnown: false,
    effHint: null,
    atRisk: false,
    mfgStart: null,
    produced: 0,
    stock: 0,
    endpoints: 0,
    expanded: false,
    challenge: false,
    log: [],
    startedDay: game.day,
  };
}

export function stageDuration(pl, stage, funding) {
  const base = pl.stageDays[stage] ?? 0;
  if (stage === 'phase3' || stage === 'review') return base; // can't shortcut follow-up and review
  return Math.round(base * (funding === 'accelerated' ? ACCEL.timeMult : 1));
}

export function stageCost(pl, stage, funding) {
  return Math.round((STAGE_COST[stage] ?? 0) * pl.costMult * (funding === 'accelerated' ? ACCEL.costMult : 1));
}

export function productionRate(cand, day) {
  if (cand.mfgStart == null || cand.stage === 'failed') return 0;
  const pl = PLATFORMS[cand.platform];
  const t = Math.max(0, day - cand.mfgStart);
  return Math.min(pl.maxRate, pl.startRate + (pl.maxRate - pl.startRate) * (t / pl.rampDays)); // million doses/day
}
