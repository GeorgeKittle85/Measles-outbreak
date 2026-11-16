// Headline generator for the news ticker, lobby screen and break-room TV. Pure function of game state.
import { fmtBig } from '../core/game.js';
import { STAGE_LABEL } from '../core/vaccine.js';

const FLAVOR = [
  'Sourdough starter sales surge as Americans stay home more',
  'Survey: 7 in 10 people now hum a full chorus while washing their hands',
  'Tight end spotted wearing a mask at practice; whole offensive line follows his lead',
  'Bicycle shops report record spring demand',
  'Atlanta coffee shops say CDC night shift keeps espresso machines running 24/7',
  'Zoo pandas unbothered by global events, keepers report',
  'Teachers share tips for teaching fractions over video calls',
  'Nurses honored with nightly applause in several cities',
  'Crossword puzzle sales climb for the third straight month',
  'Dog adoptions spike; shelters report empty kennels',
];

export function headlines(game) {
  const out = [];
  const p = game.pathogen;
  const dz = game.knowledge.sequenced ? p.diseaseShort : 'mystery illness';
  const cities = game.cities;
  const idx = cities[game.indexCity];
  const rep7 = game.nationalReported7();
  const h = game.history;

  if (game.day < 10) out.push(`Unexplained illness in ${idx.name} puts hospitals on alert`);
  const newest = cities.filter(c => c.firstReportDay != null && game.day - c.firstReportDay <= 4 && c.idx !== game.indexCity);
  for (const c of newest.slice(0, 2)) out.push(`${c.name} confirms first ${dz} case`);

  if (h.length > 8) {
    const prev = h[h.length - 8].repCases7;
    if (prev > 15) {
      const ch = (rep7 / prev - 1) * 100;
      if (ch > 15) out.push(`${dz} cases up ${Math.round(ch)}% from last week; officials urge caution`);
      else if (ch < -15) out.push(`New ${dz} cases fall ${Math.round(-ch)}% in a week`);
    }
  }
  if (rep7 >= 1) out.push(`${fmtBig(game.totalReportedCases())} confirmed cases, ${fmtBig(game.totalReportedDeaths())} deaths nationwide`);

  let worst = null, worstLoad = 0;
  for (const c of cities) { const l = game.cityHospitalLoad(c.idx); if (l > worstLoad) { worstLoad = l; worst = c; } }
  if (worst && worstLoad > 0.75) out.push(`${worst.name} hospitals at ${Math.round(worstLoad * 100)}% of outbreak capacity`);

  const stayHome = cities.filter(c => c.level >= 4).length;
  const closed = cities.filter(c => c.level >= 3).length;
  if (stayHome) out.push(`${stayHome} metro area${stayHome > 1 ? 's' : ''} under stay-at-home orders`);
  else if (closed) out.push(`Schools and venues closed in ${closed} metro area${closed > 1 ? 's' : ''}`);

  for (const c of game.vaccine.candidates) {
    if (c.stage === 'phase3') out.push(`${c.name} vaccine trial enrolls 30,000 volunteers`);
    if (c.stage === 'review') out.push(`FDA advisers to review ${c.name} data`);
  }
  if (game.vaccine.administeredTotal > 0) out.push(`${fmtBig(game.vaccinatedTotal())} Americans vaccinated; ${fmtBig(game.vaccine.todayGiven)} shots given yesterday`);
  if (game.variant && game.variant.detected) out.push(`Scientists track spread of ${game.variant.name} variant`);
  if (game.misinfo > 45) out.push(`Poll: ${Math.round(18 + game.misinfo * 0.35)}% say they won't get a ${dz} vaccine`);
  out.push(`Poll: ${Math.round(game.trust)}% trust CDC guidance on ${dz}`);
  if (game.knowledge.therapeutics) out.push('New treatment cuts hospital deaths, trial finds');

  out.push(game.policy.eoc === 1 ? 'CDC emergency operations center at full activation' : `CDC monitoring ${dz}; emergency operations center at Level ${game.policy.eoc}`);
  // a little flavor
  const f = Math.abs(game.day + game.seed);
  out.push(FLAVOR[f % FLAVOR.length]);
  if (out.length < 5) out.push(FLAVOR[(f + 5) % FLAVOR.length]);
  return out;
}

export function topStage(game) {
  const live = game.vaccine.candidates.filter(c => c.stage !== 'failed');
  if (!live.length) return game.knowledge.sequenced ? 'Ready to start' : 'Awaiting genome';
  const order = ['design', 'preclinical', 'phase1', 'phase2', 'phase3', 'review', 'authorized'];
  live.sort((a, b) => order.indexOf(b.stage) - order.indexOf(a.stage));
  return STAGE_LABEL[live[0].stage];
}
