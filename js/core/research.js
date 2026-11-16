// Laboratory projects: characterize the pathogen, build diagnostics and surveillance, test treatments.

export const PROJECTS = [
  {
    id: 'sequencing', name: 'Genome Sequencing', days: 6, cost: 4, requires: [],
    desc: 'Sequence patient samples to identify the pathogen. You need this before you can build a test or design a vaccine.',
    unlocks: 'Pathogen identity, PCR assay, vaccine design',
  },
  {
    id: 'assay', name: 'PCR Diagnostic Assay', days: 10, cost: 12, requires: ['sequencing'],
    desc: 'Design and validate a PCR test and ship kits to public health labs. Lets you confirm cases and fund testing in cities.',
    unlocks: 'Confirmed case counts, city testing programs',
  },
  {
    id: 'transmission', name: 'Transmission Study', days: 18, cost: 8, requires: [],
    desc: 'Household and contact studies run with field teams. Measures R0, transmission route and how much spread happens before symptoms.',
    unlocks: 'R0, route, presymptomatic spread, accurate Rt',
  },
  {
    id: 'severity', name: 'Clinical Severity Study', days: 22, cost: 10, requires: [],
    desc: 'Review hospital records nationwide to estimate the fatality rate by age, the hospitalization rate and the incubation period.',
    unlocks: 'IFR by age, hospitalization rate, incubation',
  },
  {
    id: 'serosurvey', name: 'Serological Survey', days: 14, cost: 15, requires: ['assay'], repeatable: true,
    desc: 'Antibody testing on blood-bank samples shows how many people have really been infected, including mild cases that were never tested.',
    unlocks: 'True infection estimate (snapshot)',
  },
  {
    id: 'rapid', name: 'Rapid Antigen Test', days: 28, cost: 40, requires: ['assay'],
    desc: 'Develop a cheap 15-minute test with industry partners. Detects more cases and cuts testing costs by 40%.',
    unlocks: 'Higher detection, cheaper testing',
  },
  {
    id: 'genomic', name: 'Genomic Surveillance Network', days: 14, cost: 25, requires: ['sequencing'],
    desc: 'Routinely sequence a share of positive samples so you see new variants weeks earlier.',
    unlocks: 'Early variant warning, variant-adapted vaccines',
  },
  {
    id: 'wastewater', name: 'Wastewater Surveillance', days: 18, cost: 20, requires: ['assay'],
    desc: 'Sample sewage at treatment plants in every metro area. Shows hidden spread before cases get reported.',
    unlocks: 'Wastewater signal on the map; earlier warnings',
  },
  {
    id: 'therapeutics', name: 'Therapeutics Trial', days: 55, cost: 70, requires: ['sequencing'], repeatable: true,
    desc: 'Randomized trial of repurposed antivirals and monoclonal antibodies. If it succeeds, fewer hospitalized patients die.',
    unlocks: 'Lower hospital fatality (if successful)', success: 0.62,
  },
];

export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map(p => [p.id, p]));

export function projectAvailable(game, proj) {
  const r = game.research;
  if (r.active.some(a => a.id === proj.id)) return { ok: false, why: 'Already running' };
  if (!proj.repeatable && r.done.has(proj.id)) return { ok: false, why: 'Completed' };
  if (proj.id === 'therapeutics' && game.knowledge.therapeutics) return { ok: false, why: 'Treatment found' };
  if (proj.id === 'therapeutics' && (r.attempts.therapeutics || 0) >= 3) return { ok: false, why: 'No candidates left' };
  if (proj.id === 'serosurvey' && r.cooldown.serosurvey > game.day) return { ok: false, why: `Ready day ${r.cooldown.serosurvey}` };
  for (const req of proj.requires) {
    if (!r.done.has(req)) return { ok: false, why: `Requires ${PROJECT_BY_ID[req].name}` };
  }
  if (r.active.length >= r.slots) return { ok: false, why: 'All lab teams busy' };
  if (game.budget < proj.cost) return { ok: false, why: 'Insufficient budget' };
  return { ok: true };
}
