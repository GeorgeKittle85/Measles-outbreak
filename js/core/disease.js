// Pathogen definitions: the handcrafted story pathogen and a generator for novel ones.
import { CONTACTS } from './data.js';

export const ROUTES = {
  respiratory: {
    label: 'Respiratory droplets',
    note: 'Masks and distancing work well. Spread is heaviest in crowded indoor settings.',
    maskEff: 0.26, hygieneEff: 0.06, venueEff: 0.04,
  },
  airborne: {
    label: 'Airborne aerosols',
    note: 'Lingers in indoor air. Masks help less than for droplets, but closing indoor venues helps more.',
    maskEff: 0.17, hygieneEff: 0.02, venueEff: 0.12,
  },
  contact: {
    label: 'Direct contact & bodily fluids',
    note: 'Spreads mostly between caregivers and patients. Isolation and contact tracing are very effective.',
    maskEff: 0.06, hygieneEff: 0.2, venueEff: 0.02,
  },
};

// Family templates give plausible parameter ranges for a novel pathogen.
const FAMILIES = [
  {
    id: 'corona', family: 'Coronaviridae', common: 'coronavirus', weight: 30,
    R0: [2.0, 3.4], latent: [3, 5.5], infectious: [5, 8], asymp: [0.2, 0.4], presymp: [0.3, 0.48],
    routes: ['respiratory', 'airborne'], hosp: [[0.002, 0.006], [0.015, 0.035], [0.08, 0.16]],
    hfr: [[0.03, 0.06], [0.08, 0.14], [0.22, 0.32]], vaxEase: 1.0, seasonal: true,
    symptoms: ['fever', 'dry cough', 'loss of smell', 'fatigue', 'shortness of breath'],
  },
  {
    id: 'flu', family: 'Orthomyxoviridae', common: 'novel influenza A', weight: 25,
    R0: [1.6, 2.5], latent: [1.5, 3], infectious: [3.5, 6], asymp: [0.15, 0.3], presymp: [0.2, 0.35],
    routes: ['respiratory'], hosp: [[0.006, 0.02], [0.01, 0.025], [0.05, 0.12]],
    hfr: [[0.04, 0.09], [0.07, 0.13], [0.16, 0.26]], vaxEase: 0.9, seasonal: true,
    symptoms: ['high fever', 'myalgia', 'cough', 'headache', 'pneumonia in severe cases'],
  },
  {
    id: 'paramyxo', family: 'Paramyxoviridae', common: 'paramyxovirus', weight: 20,
    R0: [2.6, 4.6], latent: [6, 10], infectious: [5, 8], asymp: [0.05, 0.18], presymp: [0.15, 0.3],
    routes: ['respiratory', 'airborne'], hosp: [[0.008, 0.02], [0.01, 0.025], [0.05, 0.1]],
    hfr: [[0.04, 0.08], [0.06, 0.12], [0.15, 0.25]], vaxEase: 1.05, seasonal: true,
    symptoms: ['high fever', 'maculopapular rash', 'conjunctivitis', 'cough', 'encephalitis in rare cases'],
  },
  {
    id: 'filo', family: 'Filoviridae', common: 'filovirus', weight: 10,
    R0: [1.5, 2.1], latent: [6, 10], infectious: [6, 9], asymp: [0.02, 0.06], presymp: [0.0, 0.04],
    routes: ['contact'], hosp: [[0.35, 0.5], [0.45, 0.6], [0.55, 0.7]],
    hfr: [[0.12, 0.2], [0.14, 0.22], [0.25, 0.35]], vaxEase: 1.0, seasonal: false,
    symptoms: ['sudden fever', 'severe weakness', 'vomiting and diarrhea', 'hemorrhagic signs'],
  },
  {
    id: 'arena', family: 'Arenaviridae', common: 'arenavirus', weight: 8,
    R0: [1.5, 2.3], latent: [5, 9], infectious: [6, 10], asymp: [0.1, 0.3], presymp: [0.05, 0.15],
    routes: ['contact', 'respiratory'], hosp: [[0.04, 0.08], [0.06, 0.12], [0.15, 0.25]],
    hfr: [[0.06, 0.1], [0.08, 0.14], [0.18, 0.28]], vaxEase: 0.85, seasonal: false,
    symptoms: ['fever', 'sore throat', 'chest pain', 'facial swelling'],
  },
  {
    id: 'henipa', family: 'Paramyxoviridae (Henipavirus)', common: 'henipavirus', weight: 7,
    R0: [1.4, 2.0], latent: [5, 9], infectious: [5, 8], asymp: [0.05, 0.12], presymp: [0.05, 0.15],
    routes: ['respiratory', 'contact'], hosp: [[0.15, 0.25], [0.2, 0.3], [0.3, 0.4]],
    hfr: [[0.2, 0.3], [0.25, 0.35], [0.4, 0.5]], vaxEase: 0.95, seasonal: false,
    symptoms: ['fever', 'severe headache', 'confusion', 'encephalitis', 'respiratory distress'],
  },
];

const SYL_A = ['Ka', 'Vor', 'Tel', 'Mira', 'Os', 'Ral', 'Hel', 'Zan', 'Cor', 'Bel', 'Dra', 'Ish', 'Lun', 'Pel', 'Quor', 'Sev', 'Tam', 'Ul', 'Var', 'Yen'];
const SYL_B = ['an', 'eth', 'ori', 'uma', 'avi', 'ex', 'ira', 'ond', 'usk', 'elle', 'ar', 'ion', 'ova', 'ith', 'ane'];
const SYL_C = ['', '', 'a', 'o', 'is', 'en', 'ar'];

const SYNDROME_BY_FAMILY = {
  corona: ['Severe Acute Respiratory Syndrome', 'Acute Respiratory Distress Syndrome', 'Severe Viral Pneumonia Syndrome'],
  flu: ['Novel Influenza A', 'Acute Febrile Respiratory Illness', 'Pandemic Influenza Syndrome'],
  paramyxo: ['Febrile Rash Illness', 'Acute Exanthem Fever', 'Febrile Respiratory Rash Syndrome'],
  filo: ['Viral Hemorrhagic Fever', 'Acute Hemorrhagic Fever Syndrome'],
  arena: ['Acute Hemorrhagic Fever', 'Febrile Hemorrhagic Syndrome'],
  henipa: ['Acute Febrile Encephalitis', 'Encephalitic Respiratory Syndrome'],
};

function initials(s) {
  return s.split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join('');
}

// Effective infectious days per infection by age (mild path weighted by relative infectiousness).
export function infectiousDays(p, a) {
  const infRelM = (1 - p.asymp) + p.asymp * 0.55;
  return (1 - p.hosp[a]) * infRelM * p.infectious + p.hosp[a] * p.severeInfectious;
}

// Spectral radius of a 3x3 non-negative matrix via power iteration.
export function spectralRadius(M) {
  let v = [1, 1, 1];
  let lambda = 0;
  for (let it = 0; it < 60; it++) {
    const w = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) w[i] += M[i][j] * v[j];
    const norm = Math.max(w[0], w[1], w[2]);
    if (norm <= 0) return 0;
    lambda = norm;
    v = [w[0] / norm, w[1] / norm, w[2] / norm];
  }
  return lambda;
}

// Transmission rate per contact-day that reproduces the pathogen's R0 under baseline contacts.
export function computeBeta(p) {
  const D = [0, 1, 2].map(a => infectiousDays(p, a));
  // NGM(a <- b) = beta * D_b * C[b][a]
  const M = [0, 1, 2].map(a => [0, 1, 2].map(b => D[b] * CONTACTS[b][a]));
  return p.R0 / spectralRadius(M);
}

export function overallIFR(p, shares = [0.22, 0.61, 0.17]) {
  let s = 0;
  for (let a = 0; a < 3; a++) s += shares[a] * p.hosp[a] * p.hfr[a];
  return s;
}

export function storyPathogen() {
  return finalize({
    id: 'vesper',
    familyId: 'paramyxo',
    family: 'Paramyxoviridae',
    common: 'paramyxovirus',
    name: 'Vesper virus',
    short: 'VSPV',
    disease: 'Vesper Syndrome',
    diseaseShort: 'Vesper',
    origin: 'Spillover from Egyptian fruit bats shipped through an exotic-animal import warehouse at the Port of Houston.',
    R0: 2.75,
    latent: 5,
    infectious: 7,
    severeInfectious: 5,
    hospStay: 10,
    asymp: 0.22,
    presymp: 0.34,
    route: 'respiratory',
    hosp: [0.005, 0.026, 0.12],
    hfr: [0.05, 0.12, 0.28],
    vaxEase: 1.0,
    seasonal: true,
    symptoms: ['evening fever spikes', 'mottled rash on the torso', 'dry cough', 'crushing fatigue', 'viral pneumonia in severe cases'],
  });
}

export function randomPathogen(rng, r0Mult = 1) {
  const fam = rng.weighted(FAMILIES, f => f.weight);
  const r = range => rng.range(range[0], range[1]);
  const root = rng.pick(SYL_A) + rng.pick(SYL_B) + rng.pick(SYL_C);
  const name = `${root} virus`;
  const syndrome = rng.pick(SYNDROME_BY_FAMILY[fam.id]);
  const year = 27;
  const diseaseShort = `${initials(syndrome)}-${year}`;
  const p = {
    id: 'random',
    familyId: fam.id,
    family: fam.family,
    common: fam.common,
    name,
    short: (root.slice(0, 3) + 'V').toUpperCase(),
    disease: `${syndrome} (${diseaseShort})`,
    diseaseShort,
    origin: rng.pick([
      'Zoonotic spillover traced to a live-animal supply chain.',
      'Introduced by a returning traveler who visited a remote mining region.',
      'Spillover from wildlife near a newly cleared logging site.',
      'Likely jumped from farmed animals; the reservoir host is still unknown.',
    ]),
    R0: r(fam.R0) * r0Mult,
    latent: r(fam.latent),
    infectious: r(fam.infectious),
    severeInfectious: 0,
    hospStay: rng.range(8, 13),
    asymp: r(fam.asymp),
    presymp: r(fam.presymp),
    route: rng.pick(fam.routes),
    hosp: fam.hosp.map(r),
    hfr: fam.hfr.map(r),
    vaxEase: fam.vaxEase * rng.range(0.92, 1.06),
    seasonal: fam.seasonal,
    symptoms: rng.shuffle([...fam.symptoms]).slice(0, 4),
  };
  // Occasionally the pathogen hits children hardest (as some flu strains do).
  if (rng.chance(0.12)) {
    p.hosp[0] = Math.max(p.hosp[0], p.hosp[1] * rng.range(1.2, 2.0));
    p.pediatricSkew = true;
  }
  p.severeInfectious = Math.max(3, p.infectious * 0.65);
  return finalize(p);
}

function finalize(p) {
  p.beta = computeBeta(p);
  p.ifr = overallIFR(p);
  p.incubation = p.latent + 1.5; // symptom onset ~1-2 days after becoming infectious
  return p;
}

export function describeRange(value, spread, digits = 1) {
  const lo = Math.max(0, value * (1 - spread));
  const hi = value * (1 + spread);
  return `${lo.toFixed(digits)}–${hi.toFixed(digits)}`;
}
