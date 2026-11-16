// Characters and the handcrafted campaign: "Vesper".
export const CHARACTERS = {
  director: { id: 'director', name: 'Dr. Miriam Hale', role: 'CDC Director', color: '#c9a227' },
  lab: { id: 'lab', name: 'Dr. Arun Desai', role: 'Chief, Special Pathogens Lab', color: '#4fb3d9' },
  vaccine: { id: 'vaccine', name: 'Dr. Grace Okafor', role: 'Vaccine R&D Lead', color: '#7bc67b' },
  comms: { id: 'comms', name: 'Jordan Reyes', role: 'Communications Director', color: '#e58f65' },
  eoc: { id: 'eoc', name: 'CDR Lena Brooks', role: 'EOC Operations Chief, USPHS', color: '#9aa7ff' },
  field: { id: 'field', name: 'Dr. Sam Whitfield', role: 'EIS Field Officer', color: '#d98fd0' },
  congress: { id: 'congress', name: 'Senate HELP Committee', role: 'U.S. Senate', color: '#b0b0b0' },
};

const top = (g) => {
  let best = null, bestInc = -1;
  for (const c of g.cities) {
    const inc = g.cityIncidence(c.idx);
    if (inc > bestInc) { bestInc = inc; best = c; }
  }
  return best;
};

export const STORY_BEATS = [
  {
    id: 'intro', from: 'director', when: g => g.day >= 0,
    title: 'Cluster of unexplained deaths in Houston',
    body: g => `${g.playerName}, thanks for coming in. Overnight, Houston reported 11 patients in intensive care with severe pneumonia, evening fever spikes and a strange mottled rash. Two have died. ` +
      `Several work at an exotic-animal import warehouse near the Port of Houston. Nobody can identify the pathogen.\n\n` +
      `I'm making you Incident Manager. First, get samples to Dr. Desai in the Laboratory and start genome sequencing. Then set up the response in the Emergency Operations Center. ` +
      `Keep the public informed, and if this is what I think it is, we'll need a vaccine. Move fast.`,
  },
  {
    id: 'seq_named', from: 'lab', when: g => g.knowledge.sequenced, modal: true,
    title: 'Meet Vesper virus',
    body: () => `We have a genome. It's a novel paramyxovirus, a distant cousin of measles and mumps. The ER docs nicknamed it "vesper fever" because the fevers spike every evening, and the name stuck: the virus is now Vesper virus (VSPV) and the illness is Vesper Syndrome.\n\n` +
      `The good news is that its fusion protein is a textbook vaccine target. Dr. Okafor's team in the Vaccine Wing can start designing candidates today. My team can turn the sequence into a PCR test in about ten days.`,
  },
  {
    id: 'chicago', from: 'field', when: g => g.day >= 7, modal: false, kind: 'bad',
    apply: g => g.seedCity(g.cityById('CHI').idx, 8, 'I'),
    title: 'Flight attendant hospitalized in Chicago',
    body: 'A flight attendant on the Houston–Chicago route is hospitalized with Vesper-like symptoms. She worked six flights while she had a fever. We\'re pulling passenger manifests now.',
  },
  {
    id: 'media', from: 'comms', when: g => g.day >= 11 && !g.flags.briefed, modal: false, kind: 'warn',
    title: 'The press has the story',
    body: 'Cable news is running "mystery virus" banners nonstop and rumors are filling the vacuum. Come to the Press Room and hold a briefing. People need to hear from us before they hear from someone worse.',
  },
  {
    id: 'vax_kickoff', from: 'vaccine', when: g => g.knowledge.sequenced && g.day >= 14 && g.vaccine.candidates.length === 0, modal: false,
    title: 'Ready to start vaccine design',
    body: 'My team is ready to go. mRNA can produce a candidate in a week, protein subunit is slower but rock-solid, and viral vector needs only one dose. Running two platforms in parallel is expensive, but it hedges against failure. Come see me in the Vaccine Wing.',
  },
  {
    id: 'festival', from: 'eoc', when: g => g.day >= 22,
    title: 'Spring music festival in New Orleans',
    body: g => `A ten-day music festival in New Orleans opens next week and expects 450,000 visitors from across the country. The mayor wants CDC's recommendation. ` +
      `New Orleans currently reports ${g.cityIncidence(g.cityById('MSY').idx).toFixed(1)} cases per 100k per day.`,
    choices: [
      {
        label: 'Recommend postponing the festival',
        detail: 'Trust −2, Leadership −3. Prevents a likely superspreading event.',
        effect: g => { g.adjust({ trust: -2, leadership: -3 }); return 'Organizers postponed to the fall. Local businesses are furious.'; },
      },
      {
        label: 'Allow it with testing & masks ($15M)',
        detail: 'Costs $15M. Some spread is still likely.',
        enabled: g => g.budget >= 15,
        effect: g => {
          g.spend(15);
          const c = g.cityById('MSY').idx;
          g.seedCity(c, 18, 'E');
          g.addModifier({ type: 'beta', city: c, mult: 1.25, until: g.day + 10 });
          return 'Entry testing caught dozens of cases, but not all of them.';
        },
      },
      {
        label: 'Let it go ahead as planned',
        detail: 'Leadership +2. High risk of seeding cases nationwide.',
        effect: g => {
          g.adjust({ leadership: 2 });
          const c = g.cityById('MSY').idx;
          g.seedCity(c, 60, 'E');
          g.addModifier({ type: 'beta', city: c, mult: 1.8, until: g.day + 10 });
          g.addModifier({ type: 'mobility', mult: 1.25, until: g.day + 12 });
          return 'The party went on. Epidemiologists braced for what comes next.';
        },
      },
    ],
  },
  {
    id: 'nursing', from: 'field', when: g => g.day >= 40,
    setup: g => ({ city: top(g) }),
    title: (g, ctx) => `Nursing home outbreak in ${ctx.city.name}`,
    body: (g, ctx) => `A 180-bed long-term care facility in ${ctx.city.name} has 34 residents and 12 staff infected. Vesper hits the elderly brutally. Local health officials are asking for help.`,
    choices: [
      {
        label: 'Send a CDC infection-control strike team ($8M)',
        detail: 'Contains the cluster. Trust +1.',
        enabled: g => g.budget >= 8,
        effect: (g) => { g.spend(8); g.adjust({ trust: 1 }); return 'The strike team cohorted patients and fixed PPE gaps within 48 hours.'; },
      },
      {
        label: 'Issue written guidance only',
        detail: 'Free, but the cluster will likely grow.',
        effect: (g, ctx) => { g.seedCity(ctx.city.idx, 70, 'E', [0, 0.25, 0.75]); return 'The facility struggled to implement the guidance alone.'; },
      },
    ],
  },
  {
    id: 'ppe', from: 'eoc', when: g => g.day >= 58,
    title: 'PPE shortage',
    body: 'Hospitals in several states are rationing N95 respirators. Some nurses are reusing a single mask for a whole week. Supply chains are badly strained.',
    choices: [
      {
        label: 'Release stockpile PPE nationwide (uses 2 SNS shipments)',
        detail: 'Trust +2. Fewer shipments left for surging hospitals later.',
        enabled: g => g.sns.units >= 2,
        effect: g => { g.sns.units -= 2; g.adjust({ trust: 2 }); return 'Masks were on loading docks within days.'; },
      },
      {
        label: 'Fund emergency domestic production ($90M)',
        detail: 'Fixes the problem for good. Leadership +1.',
        enabled: g => g.budget >= 90,
        effect: g => { g.spend(90); g.adjust({ leadership: 1 }); return 'Three factories retooled to make respirators.'; },
      },
      {
        label: 'Let hospitals manage on their own',
        detail: 'Hospital capacity −10% for 45 days.',
        effect: g => { g.addModifier({ type: 'capacity', mult: 0.9, until: g.day + 45 }); g.adjust({ trust: -2 }); return 'Staff infections rose, and some units closed to new patients.'; },
      },
    ],
  },
  {
    id: 'misinfo', from: 'comms', when: g => g.day >= 82, modal: true,
    apply: g => g.adjust({ misinfo: 18, trust: -2 }),
    title: '"#VesperTruth" goes viral',
    body: 'A slick video claiming Vesper was "engineered to sell vaccines" has 40 million views. Misinformation is spiking. A counter-misinformation campaign from the Press Room would help, and so would being transparent at every briefing.',
  },
  {
    id: 'variant_warn', from: 'lab', when: g => g.day >= 112 && g.knowledge.genomic, modal: false, kind: 'warn',
    title: 'Something odd in Miami sequences',
    body: 'Genomic surveillance flagged a cluster of sequences from Miami with a dozen spike-region mutations. It may be nothing, but I have a bad feeling. We\'re watching it closely.',
  },
  {
    id: 'variant', from: 'lab', when: g => g.day >= 124, modal: false, kind: 'bad',
    apply: g => g.introduceVariant({ name: 'Vesper-B', betaMult: 1.32, escape: 0.85, severity: 1.08, city: g.cityById('MIA').idx }),
    title: 'Vesper-B variant',
    body: 'A new lineage, Vesper-B, is growing in Miami. It looks considerably more transmissible. Without genomic surveillance we would not know how far it has already spread.',
  },
  {
    id: 'hearing', from: 'congress', when: g => g.day >= 150,
    title: 'Senate hearing',
    body: g => `The Senate Health Committee has called you to testify. The chair opens: "Dr. ${g.playerName.replace(/^Dr\.?\s*/, '')}, ${Math.round(g.totalReportedDeaths()).toLocaleString()} Americans have died. Why should this committee believe the CDC has this under control?"`,
    choices: [
      {
        label: 'Walk through the data honestly, uncertainty included',
        detail: 'Trust +4, Leadership −2.',
        effect: g => { g.adjust({ trust: 4, leadership: -2 }); return 'Clips of your testimony were widely shared as a model of candor.'; },
      },
      {
        label: 'Emphasize progress and the vaccine timeline',
        detail: 'Leadership +4. Trust −3 if cases are still rising.',
        effect: g => {
          const rising = g.rtEstimate != null && g.rtEstimate > 1;
          g.adjust({ leadership: 4, trust: rising ? -3 : 1 });
          return rising ? 'Fact-checkers pointed out that cases were rising as you spoke.' : 'The committee seemed reassured.';
        },
      },
      {
        label: 'Ask for emergency funding on the spot',
        detail: '60% chance of $500M. Leadership −1.',
        effect: g => {
          g.adjust({ leadership: -1 });
          if (g.rng.chance(0.6)) { g.budget += 500; return 'The committee fast-tracked $500M in emergency funds.'; }
          return 'Your request was tabled for "further review."';
        },
      },
    ],
  },
  {
    id: 'schools', from: 'eoc', when: g => g.day >= 168 && g.cities.some(c => c.level >= 3),
    title: 'Back-to-school decision',
    body: g => `The school year starts in two weeks. ${g.cities.filter(c => c.level >= 3).length} metro areas still have schools closed. Parents, teachers' unions and governors all want CDC guidance.`,
    choices: [
      {
        label: 'Recommend reopening with masks, ventilation and testing',
        detail: 'Closed cities step down to "Masks & Limits". Trust +2.',
        effect: g => { for (const c of g.cities) if (c.rec >= 3) g.setCityNPI(c.idx, 2); g.adjust({ trust: 2 }); return 'Schools reopened with layered precautions.'; },
      },
      {
        label: 'Recommend staying remote for now',
        detail: 'Keeps transmission down. Fatigue rises and Trust −2.',
        effect: g => { g.fatigue = Math.min(0.32, g.fatigue + 0.05); g.adjust({ trust: -2 }); return 'Many districts stayed remote. Parent frustration is boiling over.'; },
      },
    ],
  },
  {
    id: 'first_shot', from: 'vaccine', when: g => g.vaccine.firstShotDay != null, modal: true,
    title: 'First shot in an arm',
    body: g => `At 7:02 this morning an ICU nurse in ${g.cities[g.indexCity].name} received the first authorized Vesper vaccine dose, on live television. My team is in tears. Now we need to get it to everyone.`,
  },
  {
    id: 'thanksgiving', from: 'comms', when: g => g.day >= 259,
    title: 'Thanksgiving travel',
    body: "Thanksgiving is next week. Airlines expect near-record travel. What's our guidance?",
    choices: [
      {
        label: 'Advise against travel; celebrate with your household',
        detail: 'Trust −1. Travel drops for 10 days.',
        effect: g => { g.adjust({ trust: -1 }); g.addModifier({ type: 'mobility', mult: 0.75, until: g.day + 10 }); return 'Many families switched to video calls.'; },
      },
      {
        label: 'Recommend testing before gatherings',
        detail: 'Moderate travel, a modest increase in spread.',
        effect: g => { g.addModifier({ type: 'mobility', mult: 1.2, until: g.day + 10 }); g.addModifier({ type: 'beta', mult: 1.05, until: g.day + 8 }); return 'Pharmacies sold out of tests.'; },
      },
      {
        label: 'No special guidance',
        detail: 'Leadership +1. Expect a holiday surge.',
        effect: g => { g.adjust({ leadership: 1 }); g.addModifier({ type: 'mobility', mult: 1.55, until: g.day + 10 }); g.addModifier({ type: 'beta', mult: 1.12, until: g.day + 8 }); return 'Airports were packed.'; },
      },
    ],
  },
  {
    id: 'origin', from: 'lab', when: g => g.day >= 200, modal: false,
    title: 'Origin traced',
    body: 'Field teams and our lab have traced the spillover to a shipment of Egyptian fruit bats that passed illegally through the Houston warehouse. Wildlife officials are cracking down on the trade. Knowing the reservoir means we can head off the next one.',
  },
];

// Opening briefing for Outbreak Generator mode (random pathogen).
export const RANDOM_INTRO = {
  id: 'intro', from: 'director',
  title: g => `Unexplained illness cluster in ${g.cities[g.indexCity].name}`,
  body: g => {
    const city = g.cities[g.indexCity];
    const sx = g.pathogen.symptoms.slice(0, 3).join(', ');
    return `${g.playerName}, ${city.name} hospitals have admitted a cluster of patients with ${sx}. Several are in intensive care and one has died. ` +
      `Routine panels came back negative for every known pathogen.\n\n` +
      `You're Incident Manager. Nobody knows yet how contagious or deadly this is, so the Laboratory will need to work that out. ` +
      `Start with genome sequencing, then use the EOC to get ahead of the spread. Every day counts.`;
  },
};
