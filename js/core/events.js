// Random events. Each can appear when its condition holds; most ask the player to decide.
import { NPI_LEVELS, dayOfYear } from './data.js';

const hasCases = (g, c, min = 0.5) => g.cityIncidence(c.idx) >= min;
const name = g => (g.knowledge.sequenced ? g.pathogen.diseaseShort : 'the illness');

export const RANDOM_EVENTS = [
  {
    id: 'superspreader_game', weight: 3, cooldown: 45,
    cond: g => g.day > 15 && g.cities.some(c => hasCases(g, c) && c.level < 3),
    setup: g => ({ city: g.pickCity(c => hasCases(g, c) && c.level < 3, c => c.pop) }),
    from: 'eoc',
    title: (g, x) => `Playoff game in ${x.city.name}`,
    body: (g, x) => `${x.city.name}'s team hosts a playoff game on Sunday: 70,000 fans in the stadium plus packed watch parties across the metro. The league wants CDC's view.`,
    choices: [
      { label: 'Recommend no fans in the stands', detail: 'Trust −2, Leadership −2.', effect: g => { g.adjust({ trust: -2, leadership: -2 }); return 'The league complied, grudgingly.'; } },
      {
        label: 'Allow 25% capacity with masks & testing ($10M)', detail: 'Costs $10M. Small bump in spread.', enabled: g => g.budget >= 10,
        effect: (g, x) => { g.spend(10); g.addModifier({ type: 'beta', city: x.city.idx, mult: 1.15, until: g.day + 6 }); return 'A smaller, masked crowd.'; },
      },
      {
        label: 'Full stadium, no restrictions', detail: 'Leadership +1. Expect a spike.',
        effect: (g, x) => { g.adjust({ leadership: 1 }); g.seedCity(x.city.idx, 25); g.addModifier({ type: 'beta', city: x.city.idx, mult: 1.6, until: g.day + 6 }); return 'It was loud. It was crowded.'; },
      },
    ],
  },
  {
    id: 'nursing_home', weight: 3, cooldown: 50,
    cond: g => g.day > 20 && g.cities.some(c => hasCases(g, c, 2)),
    setup: g => ({ city: g.pickCity(c => hasCases(g, c, 2), c => g.cityIncidence(c.idx)) }),
    from: 'field',
    title: (g, x) => `Long-term care outbreak in ${x.city.name}`,
    body: (g, x) => `Forty residents of a ${x.city.name} nursing home have tested positive. Staff are working double shifts and PPE is running low.`,
    choices: [
      { label: 'Send an infection-control strike team ($8M)', detail: 'Trust +1. Contains the cluster.', enabled: g => g.budget >= 8, effect: g => { g.spend(8); g.adjust({ trust: 1 }); return 'The cluster was contained.'; } },
      { label: 'Guidance only', detail: 'Free. Elderly infections likely rise.', effect: (g, x) => { g.seedCity(x.city.idx, 60, 'E', [0, 0.25, 0.75]); return 'The outbreak spread through two more wings.'; } },
    ],
  },
  {
    id: 'governor', weight: 2, cooldown: 70,
    cond: g => g.cities.some(c => c.rec >= 2),
    setup: g => ({ city: g.pickCity(c => c.rec >= 2, c => c.pop * (0.3 + c.resistance)) }),
    from: 'eoc',
    title: (g, x) => `${x.city.state} governor rejects CDC guidance`,
    body: (g, x) => `At a press conference, the governor called CDC's "${NPI_LEVELS[x.city.rec].name}" recommendation for ${x.city.name} "federal overreach" and vowed not to enforce it.`,
    choices: [
      {
        label: 'Push back publicly with data', detail: 'Trust +1, Leadership −3. Resistance rises a little.',
        effect: (g, x) => { g.adjust({ trust: 1, leadership: -3 }); x.city.resistance = Math.min(0.9, x.city.resistance + 0.12); if (x.city.level > 1) x.city.level--; return 'A war of words followed.'; },
      },
      {
        label: 'Negotiate quietly behind the scenes', detail: 'Leadership +1. Resistance rises more.',
        effect: (g, x) => { g.adjust({ leadership: 1 }); x.city.resistance = Math.min(0.9, x.city.resistance + 0.25); x.city.holdUntil = g.day + 20; return 'Talks continue.'; },
      },
    ],
  },
  {
    id: 'misinfo_video', weight: 3, cooldown: 40,
    cond: g => g.day > 12,
    from: 'comms',
    title: 'Viral hoax video',
    body: g => `A video claiming ${name(g)} is "no worse than a cold" and that hospitals are "staged" has 25 million views.`,
    choices: [
      { label: 'Rapid-response fact check ($5M)', detail: 'Misinformation +4 instead of +12.', enabled: g => g.budget >= 5, effect: g => { g.spend(5); g.adjust({ misinfo: 4 }); return 'The fact check went viral too.'; } },
      { label: "Don't amplify it", detail: 'Misinformation +12.', effect: g => { g.adjust({ misinfo: 12 }); return 'The video kept spreading.'; } },
    ],
  },
  {
    id: 'staffing', weight: 3, cooldown: 40,
    cond: g => g.cities.some(c => g.cityHospitalLoad(c.idx) > 0.7),
    setup: g => ({ city: g.pickCity(c => g.cityHospitalLoad(c.idx) > 0.7, c => g.cityHospitalLoad(c.idx)) }),
    from: 'eoc',
    title: (g, x) => `Nurse shortage in ${x.city.name}`,
    body: (g, x) => `${x.city.name} hospitals are at ${Math.round(g.cityHospitalLoad(x.city.idx) * 100)}% of outbreak capacity, and 1 in 6 nurses are out sick or burned out.`,
    choices: [
      { label: 'Deploy the USPHS Commissioned Corps ($20M)', detail: '+15% capacity for 45 days.', enabled: g => g.budget >= 20, effect: (g, x) => { g.spend(20); g.addModifier({ type: 'capacity', city: x.city.idx, mult: 1.15, until: g.day + 45 }); return 'Officers arrived within 72 hours.'; } },
      { label: 'Ask the governor for National Guard medics', detail: '+7% capacity for 45 days. Leadership +1.', effect: (g, x) => { g.adjust({ leadership: 1 }); g.addModifier({ type: 'capacity', city: x.city.idx, mult: 1.07, until: g.day + 45 }); return 'Guard medics are helping out.'; } },
      { label: 'No federal action', detail: '−12% capacity for 30 days.', effect: (g, x) => { g.addModifier({ type: 'capacity', city: x.city.idx, mult: 0.88, until: g.day + 30 }); return 'Two hospitals went on diversion.'; } },
    ],
  },
  {
    id: 'lab_contamination', weight: 1, cooldown: 90,
    cond: g => g.research.active.length > 0,
    from: 'lab', modal: true, kind: 'bad',
    apply: g => { for (const r of g.research.active) r.progress = Math.max(0, r.progress - 5); },
    title: 'Contaminated reagents',
    body: 'A batch of contaminated reagents ruined a week of lab work. All active lab projects are set back 5 days.',
  },
  {
    id: 'cruise', weight: 2, cooldown: 120,
    cond: g => g.day > 15 && g.day < 300,
    setup: g => ({ city: g.pickCity(c => ['MIA', 'SAN', 'LAX', 'SEA', 'TPA', 'MSY'].includes(c.id), c => c.pop) }),
    from: 'eoc',
    title: (g, x) => `Cruise ship outbreak off ${x.city.name}`,
    body: (g, x) => `A cruise ship with 3,100 people aboard has 46 sick passengers. It wants to dock in ${x.city.name}.`,
    choices: [
      { label: 'Dock with federal quarantine ($15M)', detail: 'Trust +2. Minimal spread.', enabled: g => g.budget >= 15, effect: (g, x) => { g.spend(15); g.adjust({ trust: 2 }); g.seedCity(x.city.idx, 2); return 'Passengers were quarantined at a military base.'; } },
      { label: 'Keep everyone aboard', detail: 'Leadership +1, Trust −4.', effect: g => { g.adjust({ leadership: 1, trust: -4 }); return 'Images of trapped passengers dominated the news.'; } },
      { label: 'Normal disembarkation', detail: 'Free. Seeds infections.', effect: (g, x) => { g.seedCity(x.city.idx, 30); return 'Passengers flew home all over the country.'; } },
    ],
  },
  {
    id: 'pharma_offer', weight: 2, once: true,
    cond: g => g.vaccine.candidates.some(c => ['phase1', 'phase2', 'phase3', 'review'].includes(c.stage)),
    setup: g => ({ cand: g.vaccine.candidates.find(c => ['phase1', 'phase2', 'phase3', 'review'].includes(c.stage)) }),
    from: 'vaccine',
    title: 'Manufacturer offers extra capacity',
    body: (g, x) => `A major contract manufacturer offers to dedicate two fill-finish plants to ${x.cand.name} for $100M.`,
    choices: [
      { label: 'Sign the contract ($100M)', detail: '+0.8M doses/day once manufacturing starts.', enabled: g => g.budget >= 100, effect: (g, x) => { g.spend(100); x.cand.bonusRate = (x.cand.bonusRate || 0) + 0.8; return 'Contract signed.'; } },
      { label: 'Decline', detail: 'Save the money.', effect: () => 'Offer declined.' },
    ],
  },
  {
    id: 'school_protest', weight: 2, cooldown: 60,
    cond: g => g.cities.some(c => c.level >= 3 && g.day - c.levelSince > 30),
    setup: g => ({ city: g.pickCity(c => c.level >= 3 && g.day - c.levelSince > 30) }),
    from: 'comms',
    title: (g, x) => `Parents protest school closures in ${x.city.name}`,
    body: (g, x) => `Thousands of parents rallied outside ${x.city.name} City Hall demanding schools reopen.`,
    choices: [
      { label: 'Recommend reopening with testing ($10M)', detail: 'City steps down to "Masks & Limits". Trust +2.', enabled: g => g.budget >= 10, effect: (g, x) => { g.spend(10); g.setCityNPI(x.city.idx, 2); g.adjust({ trust: 2 }); return 'Schools reopened with weekly testing.'; } },
      { label: 'Hold firm', detail: 'Trust −2, fatigue rises.', effect: g => { g.adjust({ trust: -2 }); g.fatigue = Math.min(0.32, g.fatigue + 0.03); return 'Frustration grew.'; } },
    ],
  },
  {
    id: 'hearing', weight: 2, cooldown: 100,
    cond: g => g.day > 60 && g.mode === 'random',
    from: 'congress',
    title: 'Congressional hearing',
    body: g => `A House committee wants answers: ${Math.round(g.totalReportedDeaths()).toLocaleString()} reported deaths and $${Math.round(g.spentTotal)}M spent so far.`,
    choices: [
      { label: 'Present the full data, uncertainty included', detail: 'Trust +3, Leadership −2.', effect: g => { g.adjust({ trust: 3, leadership: -2 }); return 'Praised for candor.'; } },
      { label: 'Stress the progress', detail: 'Leadership +3; Trust −3 if cases are rising.', effect: g => { const up = g.rtEstimate != null && g.rtEstimate > 1; g.adjust({ leadership: 3, trust: up ? -3 : 0 }); return up ? 'Critics called it spin.' : 'Well received.'; } },
      { label: 'Ask for emergency funds', detail: '60% chance of $400M. Leadership −1.', effect: g => { g.adjust({ leadership: -1 }); if (g.rng.chance(0.6)) { g.budget += 400; return '$400M approved.'; } return 'No money this time.'; } },
    ],
  },
  {
    id: 'test_shortage', weight: 2, once: true,
    cond: g => g.knowledge.assay && !g.knowledge.rapid && g.cities.some(c => c.testing > 0),
    from: 'lab',
    title: 'Testing reagent shortage',
    body: 'A global shortage of extraction reagents is slowing PCR testing. Labs are reporting week-long backlogs.',
    choices: [
      { label: 'Emergency procurement contracts ($35M)', detail: 'Problem solved.', enabled: g => g.budget >= 35, effect: g => { g.spend(35); return 'Supplies secured.'; } },
      { label: 'Ration tests to hospitals', detail: 'Detection −30% for 25 days.', effect: g => { g.addModifier({ type: 'detection', mult: 0.7, until: g.day + 25 }); return 'Mild cases went untested.'; } },
    ],
  },
  {
    id: 'wedding', weight: 2, cooldown: 30,
    cond: g => g.day > 20 && g.cities.some(c => hasCases(g, c, 1) && c.level < 3),
    setup: g => ({ city: g.pickCity(c => hasCases(g, c, 1) && c.level < 3) }),
    from: 'field', modal: false, kind: 'bad',
    apply: (g, x) => g.seedCity(x.city.idx, 35),
    title: (g, x) => `Wedding cluster in ${x.city.name}`,
    body: (g, x) => `A 300-guest wedding in ${x.city.name} has been linked to dozens of infections, including the officiant and the cake baker. Contact tracers are working through the guest list.`,
  },
  {
    id: 'celebrity_cure', weight: 2, cooldown: 80,
    cond: g => g.day > 30,
    from: 'comms',
    title: 'Celebrity touts a miracle cure',
    body: 'A celebrity with 90 million followers is promoting an unproven supplement as a cure. Poison control centers are getting calls.',
    choices: [
      { label: 'Issue a joint CDC/FDA warning', detail: 'Trust +1, Misinformation +3.', effect: g => { g.adjust({ trust: 1, misinfo: 3 }); return 'The warning got wide coverage.'; } },
      { label: 'Ignore it', detail: 'Misinformation +8.', effect: g => { g.adjust({ misinfo: 8 }); return 'Sales of the supplement soared.'; } },
    ],
  },
  {
    id: 'airlines', weight: 2, cooldown: 60,
    cond: g => g.policy.travel >= 1,
    from: 'director',
    title: 'Airlines lobby to lift travel limits',
    body: 'Airline CEOs met with the White House and say travel limits are costing 40,000 jobs a month.',
    choices: [
      { label: 'Keep current travel policy', detail: 'Leadership −3.', effect: g => { g.adjust({ leadership: -3 }); return 'The policy stands.'; } },
      { label: 'Ease travel by one level', detail: 'Leadership +2.', effect: g => { g.setTravel(g.policy.travel - 1); g.adjust({ leadership: 2 }); return 'Travel limits eased.'; } },
    ],
  },
  {
    id: 'vaccine_rumor', weight: 3, cooldown: 60,
    cond: g => g.vaccine.todayGiven > 0,
    from: 'comms',
    title: 'Vaccine rumor spreads',
    body: 'A false claim that the vaccine "alters DNA" is trending, and some clinics report cancellations.',
    choices: [
      { label: 'Launch a public safety-data dashboard ($10M)', detail: 'Trust +2, Misinformation +2.', enabled: g => g.budget >= 10, effect: g => { g.spend(10); g.adjust({ trust: 2, misinfo: 2 }); return 'Transparency helped.'; } },
      { label: 'Ignore it', detail: 'Misinformation +10.', effect: g => { g.adjust({ misinfo: 10 }); return 'Cancellations continued.'; } },
    ],
  },
  {
    id: 'vector_signal', weight: 6, once: true,
    cond: g => g.flags.vectorSignalPending && g.vaccine.todayGiven > 0,
    from: 'vaccine',
    title: 'Rare safety signal',
    body: 'Safety monitoring found a very rare clotting disorder (about 4 per million doses) after the viral-vector vaccine. Benefits still far outweigh risks for most adults.',
    choices: [
      { label: 'Pause 10 days to review & update guidance', detail: 'Trust +1 long-term, but a 10-day vector pause.', effect: g => { g.flags.vectorSignalPending = false; g.adjust({ trust: 1 }); for (const c of g.vaccine.candidates) if (c.platform === 'vector') c.stock *= 0.75; return 'Guidance updated; confidence held.'; } },
      { label: 'Continue with updated warnings', detail: 'Misinformation +6.', effect: g => { g.flags.vectorSignalPending = false; g.adjust({ misinfo: 6 }); return 'Some people now refuse the vector vaccine.'; } },
    ],
  },
  {
    id: 'tight_end', weight: 4, once: true,
    cond: g => g.vaccine.todayGiven > 0 && g.day > 40,
    from: 'comms', modal: false, kind: 'good',
    apply: g => { g.addModifier({ type: 'uptake', city: g.cityById('SFO').idx, add: 0.06 }); g.adjust({ trust: 1 }); },
    title: 'Tight end livestreams his shot',
    body: 'A beloved Bay Area tight end in a #85 jersey livestreamed his vaccination, flexed for the camera and challenged fans to "block for your grandma." Bookings in the San Francisco Bay jumped 8.5% overnight.',
  },
  {
    id: 'meatpacking', weight: 2, cooldown: 70,
    cond: g => g.day > 25 && g.cities.some(c => hasCases(g, c, 1)),
    setup: g => ({ city: g.pickCity(c => hasCases(g, c, 1) && ['DFW', 'MCI', 'MSP', 'DEN', 'STL', 'PHX', 'SLC', 'BNA'].includes(c.id)) }),
    from: 'field',
    title: (g, x) => `Meatpacking plant outbreak near ${x.city.name}`,
    body: (g, x) => `A processing plant near ${x.city.name} has 210 infected workers. Line workers stand shoulder to shoulder for 10-hour shifts.`,
    choices: [
      { label: 'Recommend a 2-week closure', detail: 'Leadership −2. Stops the cluster.', effect: g => { g.adjust({ leadership: -2 }); return 'The plant closed for deep cleaning and redesign.'; } },
      { label: 'Stay open with PPE, spacing & testing ($6M)', detail: 'Some spread.', enabled: g => g.budget >= 6, effect: (g, x) => { g.spend(6); g.seedCity(x.city.idx, 15); return 'Plexiglass and testing helped.'; } },
      { label: 'No federal action', detail: 'Significant spread.', effect: (g, x) => { g.seedCity(x.city.idx, 60); return 'Infections spread into the community.'; } },
    ],
  },
  {
    id: 'donation', weight: 1, once: true,
    cond: g => g.day > 50,
    from: 'director', modal: false, kind: 'good',
    apply: g => { g.budget += 150; },
    title: 'Foundation donates $150M',
    body: 'A philanthropic foundation donated $150M to the CDC Foundation for outbreak response, available immediately.',
  },
  {
    id: 'backlog', weight: 1, cooldown: 90,
    cond: g => g.knowledge.assay && g.day > 30,
    setup: g => ({ city: g.pickCity(c => c.repCum > 50), amount: 0 }),
    from: 'eoc', modal: false, kind: 'warn',
    apply: (g, x) => { if (x.city) { x.amount = Math.round(400 + g.rng.range(0, 3000)); g.addModifier({ type: 'backlog', city: x.city.idx, amount: x.amount, until: g.day + 2 }); } },
    title: (g, x) => `Reporting backlog in ${x.city ? x.city.name : 'a state'}`,
    body: (g, x) => `${x.city ? x.city.state : 'A state'} found a backlog of old positive results and is adding them to its counts all at once. Expect a one-day spike that doesn't reflect new transmission.`,
  },
  {
    id: 'holiday', weight: 6, cooldown: 25,
    cond: g => { const d = dayOfYear(g.day); return g.mode === 'random' && ((d >= 178 && d <= 183) || (d >= 320 && d <= 326) || (d >= 350 && d <= 355)); },
    from: 'comms',
    title: g => { const d = dayOfYear(g.day); return d < 200 ? 'Fourth of July weekend' : d < 340 ? 'Thanksgiving travel' : 'Winter holidays'; },
    body: 'A major holiday is coming and travel is expected to be heavy. What does CDC recommend?',
    choices: [
      { label: 'Advise against travel', detail: 'Trust −1, travel −25% for 10 days.', effect: g => { g.adjust({ trust: -1 }); g.addModifier({ type: 'mobility', mult: 0.75, until: g.day + 10 }); return 'Many stayed home.'; } },
      { label: 'Test before gathering', detail: 'Moderate risk.', effect: g => { g.addModifier({ type: 'mobility', mult: 1.2, until: g.day + 10 }); return 'Tests sold out.'; } },
      { label: 'No special guidance', detail: 'Leadership +1. Expect a surge.', effect: g => { g.adjust({ leadership: 1 }); g.addModifier({ type: 'mobility', mult: 1.5, until: g.day + 10 }); g.addModifier({ type: 'beta', mult: 1.1, until: g.day + 8 }); return 'Record travel.'; } },
    ],
  },
  {
    id: 'variant_random', weight: 3, once: true,
    cond: g => g.mode === 'random' && g.day > 100 && !g.variant && g.sim.totalActive() > 2000,
    setup: g => ({ city: g.pickCity(c => true, c => c.pop * c.hub) }),
    from: 'lab', modal: false, kind: 'bad',
    apply: (g, x) => {
      const letters = ['Delta-7', 'Kappa-2', 'Sigma-4', 'Theta-9'];
      g.introduceVariant({ name: `${g.pathogen.short}-${g.rng.pick(letters)}`, betaMult: g.rng.range(1.25, 1.5), escape: g.rng.range(0.78, 0.95), severity: g.rng.range(0.95, 1.2), city: x.city.idx });
    },
    title: 'Mutations accumulating',
    body: 'With this much transmission, the virus is evolving. Expect new variants. Genomic surveillance would show them sooner.',
  },
];
