// Station consoles: the panels you use at each room of the HQ.
import { fmtBig, CAMPAIGNS } from '../core/game.js';
import { NPI_LEVELS, TRAVEL_LEVELS, AGE_GROUPS } from '../core/data.js';
import { PROJECTS, projectAvailable } from '../core/research.js';
import {
  PLATFORMS, STAGE_LABEL, STAGES, ENDPOINTS_NEEDED, AT_RISK_COST, ADMIN_UPGRADES, STRATEGIES, ACCEL,
  stageCost, productionRate,
} from '../core/vaccine.js';
import { ROUTES } from '../core/disease.js';
import { CHARACTERS } from '../core/story.js';
import { chart } from '../world/screens.js';
import { incidenceCss } from '../world/holomap.js';
import { headlines } from './news.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = m => (Math.abs(m) >= 1000 ? `${m < 0 ? '−' : ''}$${(Math.abs(m) / 1000).toFixed(2)}B` : `${m < 0 ? '−' : ''}$${Math.round(Math.abs(m))}M`);
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const TESTING_COST = 0.018;

const TITLES = {
  eoc: { kicker: 'Emergency Operations Center', title: 'National Response Console', tabs: [['overview', 'Overview'], ['city', 'City'], ['national', 'National policy']] },
  lab: { kicker: 'Laboratory · BSL-3', title: 'Pathogen Characterization', tabs: [['projects', 'Projects'], ['profile', 'Pathogen profile']] },
  vaccine: { kicker: 'Vaccine R&D Wing', title: 'Vaccine Program', tabs: [['pipeline', 'Pipeline'], ['new', 'New candidate'], ['distribution', 'Distribution']] },
  press: { kicker: 'Joint Information Center', title: 'Public Communication', tabs: [] },
  director: { kicker: "Director's Office", title: 'Dr. Miriam Hale', tabs: [] },
  office: { kicker: 'Your Office', title: 'Incident Manager Workstation', tabs: [['inbox', 'Inbox'], ['sitrep', 'Situation report'], ['guide', 'Field guide'], ['settings', 'Settings']] },
};

export class Consoles {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('console');
    this.body = document.getElementById('console-body');
    this.tabsEl = document.getElementById('console-tabs');
    this.titleEl = document.getElementById('console-title');
    this.kickerEl = document.getElementById('console-kicker');
    this.station = null;
    this.tab = null;
    this.city = 0;
    this.confirmRestart = false;

    document.getElementById('console-close').addEventListener('click', () => app.closeConsole());
    this.tabsEl.addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.render(true);
    });
    this.body.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      this.act(t.dataset.act, t.dataset.arg, t.dataset.arg2);
    });
    this.body.addEventListener('change', e => {
      const t = e.target.closest('[data-change]');
      if (!t) return;
      this.act(t.dataset.change, t.type === 'checkbox' ? t.checked : t.value);
    });
  }

  get game() { return this.app.game; }

  open(station, tab) {
    this.station = station;
    const def = TITLES[station];
    this.tab = tab || (def.tabs[0] ? def.tabs[0][0] : null);
    this.kickerEl.textContent = def.kicker;
    this.titleEl.textContent = def.title;
    if (station === 'eoc' && tab !== 'city') this.city = this.topCity();
    this.el.hidden = false;
    this.render(true);
  }

  close() {
    this.station = null;
    this.el.hidden = true;
    this.confirmRestart = false;
  }

  selectCity(idx) {
    this.city = idx;
    this.tab = 'city';
    this.render(true);
  }

  topCity() {
    const g = this.game;
    let best = g.indexCity, bi = -1;
    for (const c of g.cities) { const v = g.cityIncidence(c.idx) + g.cityHospitalLoad(c.idx); if (v > bi) { bi = v; best = c.idx; } }
    return best;
  }

  render(resetScroll = false) {
    if (!this.station || !this.game) return;
    const def = TITLES[this.station];
    this.tabsEl.innerHTML = def.tabs.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" class="${id === this.tab ? 'on' : ''}" aria-selected="${id === this.tab}">${label}</button>`).join('');
    const scroll = this.body.scrollTop;
    const fn = this[`render_${this.station}`];
    this.body.innerHTML = fn.call(this);
    this.body.scrollTop = resetScroll ? 0 : scroll;
    this.drawCharts();
    if (this.station === 'eoc') this.app.holo.setSelected(this.tab === 'city' ? this.city : -1);
    if (this.station === 'office' && this.tab === 'inbox') {
      this.body.querySelectorAll('details[data-msg]').forEach(d => d.addEventListener('toggle', () => {
        const m = this.game.messages[+d.dataset.msg];
        if (d.open && m && !m.read) { m.read = true; d.classList.remove('unread'); this.app.hud.update(true); }
      }));
    }
  }

  act(action, arg, arg2) {
    const g = this.game;
    const n = v => Number(v);
    const map = {
      city: () => this.selectCity(n(arg)),
      tab: () => { this.tab = arg; this.render(true); return null; },
      npi: () => g.setCityNPI(this.city, n(arg)),
      testing: () => g.setCityTesting(this.city, n(arg)),
      team: () => g.deployTeam(this.city),
      recall: () => g.recallTeam(this.city),
      sns: () => g.deploySNS(this.city),
      fms: () => g.deployFMS(this.city),
      surge: () => g.toggleSurge(this.city),
      eocLevel: () => g.setEOC(n(arg)),
      travel: () => g.setTravel(n(arg)),
      nationNPI: () => g.setNationalNPI(n(arg)),
      elder: () => g.toggleElderGuidance(),
      research: () => g.startResearch(arg),
      vaccine: () => g.startVaccine(arg, arg2),
      funding: () => g.setVaccineFunding(n(arg), arg2),
      atrisk: () => g.startAtRisk(n(arg)),
      expand: () => g.expandTrial(n(arg)),
      challenge: () => g.challengeTrial(n(arg)),
      strategy: () => g.setStrategy(arg),
      upgrade: () => g.buyUpgrade(arg),
      pediatric: () => g.startPediatric(),
      variantVax: () => g.startVariantUpdate(),
      brief: () => g.pressBriefing(arg),
      campaign: () => g.startCampaign(arg),
      requestFunding: () => g.requestFunding(),
      hire: () => g.hireTeams(),
      lab: () => g.expandLab(),
      restock: () => g.restockSNS(),
      autopause: () => { g.settings.autoPauseConsoles = !!arg; return { ok: true, msg: arg ? 'Time pauses while consoles are open' : 'Time keeps running while consoles are open' }; },
      restart: () => {
        if (!this.confirmRestart) { this.confirmRestart = true; return null; }
        this.app.backToTitle();
        return null;
      },
    };
    const fn = map[action];
    if (!fn) return;
    const res = fn();
    if (res && res.msg) this.app.hud.toast(res.msg, res.ok ? 'info' : 'warn');
    if (res && res.ok) this.app.onPlayerAction(action);
    if (this.station) this.render();
    this.app.hud.update(true);
  }

  drawCharts() {
    const g = this.game;
    const h = g.history;
    this.body.querySelectorAll('canvas[data-chart]').forEach(cv => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 400, hgt = cv.clientHeight || 150;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(hgt * dpr);
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      let series = [];
      let opts = {};
      switch (cv.dataset.chart) {
        case 'cases': series = [{ data: h.map(d => d.repCases7), color: '#4cc3ff', fill: 'rgba(76,195,255,0.2)' }]; break;
        case 'deaths': series = [{ data: h.map((d, i) => avg(h, i, 'repDeaths')), color: '#ff7a7a', fill: 'rgba(255,93,93,0.15)' }]; break;
        case 'hosp': series = [{ data: h.map(d => d.hosp), color: '#ffb547', fill: 'rgba(255,181,71,0.15)' }, { data: h.map(d => d.cap), color: 'rgba(255,93,93,0.8)', dash: [6, 5], width: 1.6 }]; break;
        case 'rt': series = [{ data: h.map(d => d.rtEst ?? 0), color: '#b59cff' }, { data: h.map(() => 1), color: 'rgba(255,255,255,0.35)', dash: [4, 4], width: 1 }]; opts = { max: 4 }; break;
        case 'vax': series = [{ data: h.map(d => d.vax / g.totalPop * 100), color: '#6fe3a6', fill: 'rgba(61,220,151,0.15)' }]; opts = { max: 100 }; break;
        case 'city': {
          const c = g.cities[this.city];
          series = [{ data: c.repCases.map((_, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - 6); j <= i; j++) { s += c.repCases[j]; k++; } return s / k; }), color: incidenceCss(g.cityIncidence(this.city)), fill: 'rgba(255,255,255,0.06)' }];
          break;
        }
      }
      ctx.font = '12px "IBM Plex Mono", monospace';
      chart(ctx, 0, 4, w, hgt - 8, series, opts);
    });
  }

  // ======================= EOC =======================
  render_eoc() {
    if (this.tab === 'city') return this.eocCity();
    if (this.tab === 'national') return this.eocNational();
    return this.eocOverview();
  }

  eocOverview() {
    const g = this.game;
    const hosp = g.hospitalized(), cap = g.totalCapacity();
    const rt = g.rtEstimate;
    const affected = g.cities.filter(c => c.repCum > 0).length;
    const rows = [...g.cities].sort((a, b) => g.cityIncidence(b.idx) - g.cityIncidence(a.idx) || b.repCum - a.repCum || b.pop - a.pop);
    return `
      <div class="kpis">
        ${k('Cases / day', fmtBig(g.nationalReported7()), '7-day avg, reported')}
        ${k('Deaths / day', fmtBig(g.nationalReported7('repDeaths')), `${fmtBig(g.totalReportedDeaths())} total`)}
        ${k('In hospital', fmtBig(hosp), `${pct(hosp / cap)} of capacity`)}
        ${k('Rt estimate', rt == null ? '—' : rt.toFixed(2), g.knowledge.transmission ? 'measured' : 'rough, from case growth')}
        ${k('Metros affected', `${affected}/26`, `${g.overflowCities()} hospitals overwhelmed`)}
      </div>
      <div class="grid2">
        <div class="chart-box"><div class="chart-label">Reported cases / day</div><canvas data-chart="cases"></canvas></div>
        <div class="chart-box"><div class="chart-label">Hospitalized vs. capacity</div><canvas data-chart="hosp"></canvas></div>
      </div>
      <p class="note">Reported cases are only the infections that get tested${g.knowledge.assay ? '' : '. Until the lab builds a PCR test, only hospitalized patients get counted (as suspected cases)'}. Hospital numbers are much more reliable. Click a city row, or a pillar on the holo map, to manage it.</p>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Metro</th><th class="num">Cases/100k</th><th class="num">Hosp.</th><th>Measures</th><th>Team</th><th class="num">Tests</th></tr></thead>
        <tbody>${rows.map(c => {
          const inc = g.cityIncidence(c.idx);
          const load = g.cityHospitalLoad(c.idx);
          const lc = load > 1 ? 'bad' : load > 0.8 ? 'warn' : '';
          return `<tr class="clickable ${c.idx === this.city ? 'sel' : ''}" data-act="city" data-arg="${c.idx}">
            <td><span class="swatch" style="background:${incidenceCss(inc)}"></span> ${esc(c.name)}</td>
            <td class="num">${inc < 0.05 ? '0' : inc.toFixed(1)}</td>
            <td class="num"><span class="chip ${lc}">${Math.round(load * 100)}%</span></td>
            <td>${NPI_LEVELS[c.level].short}${c.rec !== c.level ? ` <span class="chip info">→ ${NPI_LEVELS[c.rec].short}</span>` : ''}</td>
            <td>${c.team ? (g.teamActive(c.idx) ? '<span class="chip good">on site</span>' : '<span class="chip info">en route</span>') : ''}</td>
            <td class="num">${c.testing ? '●'.repeat(c.testing) : '–'}</td></tr>`;
        }).join('')}</tbody></table></div>`;
  }

  eocCity() {
    const g = this.game;
    const c = g.cities[this.city];
    const idx = c.idx;
    const inc = g.cityIncidence(idx);
    const load = g.cityHospitalLoad(idx);
    const cap = g.cityCapacity(idx);
    const H = g.sim.cityTotal('H', idx);
    const team = c.team ? (g.teamActive(idx) ? 'On site' : `Arrives day ${c.team.arrive}`) : 'None';
    const attitude = c.resistance > 0.45 ? ['Defiant', 'bad'] : c.resistance > 0.25 ? ['Independent-minded', 'warn'] : ['Cooperative', 'good'];
    let ww = '';
    if (g.knowledge.wastewater) {
      const prev = g.sim.cityActive(idx) / g.sim.cityPop(idx);
      const lvl = prev > 0.004 ? ['Very high', 'bad'] : prev > 0.001 ? ['High', 'bad'] : prev > 0.0002 ? ['Moderate', 'warn'] : prev > 0.00002 ? ['Low', 'info'] : ['Not detected', 'good'];
      ww = `<span class="chip ${lvl[1]}">Wastewater: ${lvl[0]}</span>`;
    }
    const rapid = g.knowledge.rapid ? 0.6 : 1;
    const authorized = g.authorizedCount > 0;
    return `
      <div class="row">
        <select data-change="city" aria-label="Choose a metro area" class="btn">${g.cities.map(o => `<option value="${o.idx}" ${o.idx === idx ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        <span class="chip">${c.pop.toFixed(1)}M residents</span>
        <span class="chip ${attitude[1]}">Officials: ${attitude[0]}</span>
        ${ww}
      </div>
      <div class="kpis">
        ${k('Cases/100k/day', inc.toFixed(1), 'reported, 7-day avg')}
        ${k('Reported cases', fmtBig(c.repCum), `${fmtBig(c.repDeathsCum)} deaths`)}
        ${k('Hospital load', `${Math.round(load * 100)}%`, `${fmtBig(H)} / ${fmtBig(cap)} beds`)}
        ${k('Local Rt', g.knowledge.transmission ? g.sim.lastRt[idx].toFixed(2) : '—', g.knowledge.transmission ? 'measured' : 'needs Transmission Study')}
        ${k('Vaccinated', pct(g.cityCoverage(idx), 1), authorized ? 'of residents' : 'no vaccine yet')}
      </div>
      <div class="chart-box"><div class="chart-label">${esc(c.name)} · reported cases / day</div><canvas data-chart="city"></canvas></div>

      <div class="section">
        <h3>Recommended measures</h3>
        <p class="note">CDC recommends; state and local officials decide. Adoption takes days and depends on public trust and how bad things look locally. In effect now: <b>${NPI_LEVELS[c.level].name}</b>${c.rec !== c.level ? ` · waiting on officials to adopt <b>${NPI_LEVELS[c.rec].name}</b>` : ''}.</p>
        <div class="levels">${NPI_LEVELS.map(l => `<button type="button" data-act="npi" data-arg="${l.level}" class="${l.level === c.rec ? 'rec' : ''} ${l.level === c.level ? 'eff' : ''}" title="${esc(l.desc)}"><b>${l.level} · ${esc(l.short)}</b><small>${esc(l.desc)}</small></button>`).join('')}</div>
      </div>

      <div class="section">
        <h3>Testing program</h3>
        ${g.knowledge.assay ? '' : '<p class="note warn">Needs the PCR assay from the Laboratory.</p>'}
        <div class="levels l4">${[0, 1, 2, 3].map(l => `<button type="button" data-act="testing" data-arg="${l}" class="${c.testing === l ? 'rec eff' : ''}" ${g.knowledge.assay ? '' : 'disabled'}><b>${['Off', 'Basic', 'Expanded', 'Saturation'][l]}</b><small>${l ? money(TESTING_COST * l * c.pop * rapid) + '/day' : 'free'}</small></button>`).join('')}</div>
        <p class="note">More testing finds more mild cases, gets them isolated sooner, and gives you a truer picture.</p>
      </div>

      <div class="grid2">
        <div class="card">
          <div class="card-top"><span class="card-title">EIS field team</span><span class="card-meta">${g.teamsAvailable()}/${g.teams.total} free</span></div>
          <p class="note">Disease detectives who boost contact tracing and case finding. $0.3M/day while deployed. Status: <b>${team}</b>.</p>
          ${c.team ? `<button type="button" class="btn" data-act="recall">Recall team</button>` : `<button type="button" class="btn primary" data-act="team" ${g.teamsAvailable() > 0 ? '' : 'disabled'}>Deploy team</button>`}
        </div>
        <div class="card">
          <div class="card-top"><span class="card-title">Hospital surge</span><span class="card-meta">${fmtBig(cap)} beds</span></div>
          <p class="note">When hospitals overflow, many more patients die.</p>
          <div class="row">
            <button type="button" class="btn" data-act="sns" ${g.sns.units > 0 && c.sns < 2 ? '' : 'disabled'}>Stockpile shipment (${g.sns.units} left) +20%</button>
            <button type="button" class="btn" data-act="fms" ${c.fms < 2 && g.budget >= g.fmsCost(idx) ? '' : 'disabled'}>Field hospital ${money(g.fmsCost(idx))} +22%</button>
          </div>
        </div>
      </div>
      ${authorized ? `<div class="card"><div class="card-top"><span class="card-title">Vaccine allocation</span></div>
        <label class="check"><input type="checkbox" data-change="surge" ${c.surge ? 'checked' : ''}> Send extra doses to ${esc(c.name)}</label></div>` : ''}`;
  }

  eocNational() {
    const g = this.game;
    const costs = g.dailyCosts();
    const eoc = [
      [3, 'Level 3 · Monitoring', 'Normal operations. Free.'],
      [2, 'Level 2 · Partial', 'Health Alert Network advisory to clinicians (more hospital cases caught before the test exists). $0.25M/day.'],
      [1, 'Level 1 · Full activation', 'All hands: labs 15% faster, tracing and local adoption improve. $0.6M/day.'],
    ];
    return `
      <div class="section">
        <h3>EOC activation</h3>
        <div class="levels l3">${eoc.map(([l, name, d]) => `<button type="button" data-act="eocLevel" data-arg="${l}" class="${g.policy.eoc === l ? 'rec eff' : ''}"><b>${name}</b><small>${d}</small></button>`).join('')}</div>
      </div>
      <div class="section">
        <h3>Domestic travel</h3>
        <div class="levels l3">${TRAVEL_LEVELS.map(t => `<button type="button" data-act="travel" data-arg="${t.level}" class="${g.policy.travel === t.level ? 'rec eff' : ''}"><b>${esc(t.name)}</b><small>Travel ${Math.round(t.mobility * 100)}% of normal · disruption +${t.disruption}</small></button>`).join('')}</div>
        <p class="note">Travel limits slow the spread between cities. They don't stop it, and they cost jobs and goodwill.</p>
      </div>
      <div class="section">
        <h3>Recommend the same level everywhere</h3>
        <div class="levels">${NPI_LEVELS.map(l => `<button type="button" data-act="nationNPI" data-arg="${l.level}"><b>${l.level} · ${esc(l.short)}</b><small>disruption ${l.disruption}</small></button>`).join('')}</div>
        <p class="note">Overrides every city's recommendation. Disruption now: <b>${Math.round(g.disruption)}</b>/100. High disruption drains leadership confidence and public trust, and builds pandemic fatigue.</p>
      </div>
      <div class="card">
        <label class="check"><input type="checkbox" data-change="elder" ${g.policy.elderGuidance ? 'checked' : ''}> Long-term care visitor restrictions (cuts contacts with people 65+; families hate it)</label>
      </div>
      <div class="card">
        <div class="card-top"><span class="card-title">Daily operating costs</span><span class="card-meta">${money(costs.total)}/day</span></div>
        <dl class="facts">
          <dt>Field teams</dt><dd>${money(costs.teams)}</dd><dt>Testing</dt><dd>${money(costs.testing)}</dd>
          <dt>EOC activation</dt><dd>${money(costs.eoc)}</dd><dt>Travel screening</dt><dd>${money(costs.travel)}</dd>
          <dt>Vaccine distribution</dt><dd>${money(costs.distribution)} + $2.50/shot</dd>
        </dl>
      </div>`;
  }

  // ======================= LAB =======================
  render_lab() {
    return this.tab === 'profile' ? this.labProfile() : this.labProjects();
  }

  labProjects() {
    const g = this.game;
    const r = g.research;
    const active = r.active.map(a => {
      const p = PROJECTS.find(x => x.id === a.id);
      const left = Math.max(0, Math.ceil((a.days - a.progress) / (g.policy.eoc === 1 ? 1.15 : 1)));
      return `<div class="card hl"><div class="card-top"><span class="card-title">${esc(p.name)}</span><span class="card-meta">${left} days left</span></div>
        <div class="bar"><i style="width:${Math.min(100, (a.progress / a.days) * 100)}%"></i></div></div>`;
    }).join('');
    const list = PROJECTS.map(p => {
      const av = projectAvailable(g, p);
      const done = r.done.has(p.id) && !p.repeatable;
      return `<div class="card ${done ? '' : ''}"><div class="proj">
        <div><div class="card-title">${esc(p.name)} ${done ? '<span class="chip good">done</span>' : ''}${p.repeatable && r.done.has(p.id) ? '<span class="chip">repeatable</span>' : ''}</div>
          <p class="note">${esc(p.desc)}</p><p class="note">Unlocks: ${esc(p.unlocks)}</p></div>
        <div style="display:grid;gap:4px;justify-items:end">
          <span class="chip">${money(p.cost)} · ${p.days}d${p.success ? ` · ${Math.round(p.success * 100)}% odds` : ''}</span>
          ${done ? '' : `<button type="button" class="btn ${av.ok ? 'primary' : ''} small" data-act="research" data-arg="${p.id}" ${av.ok ? '' : 'disabled'}>Start</button>`}
          ${!done && !av.ok ? `<span class="why">${esc(av.why)}</span>` : ''}
        </div></div></div>`;
    }).join('');
    return `
      <div class="persona"><div class="avatar" style="background:${CHARACTERS.lab.color}">AD</div>
        <div><b>${CHARACTERS.lab.name}</b><div class="note">${CHARACTERS.lab.role}</div>
        <div class="quote">${esc(labQuote(g))}</div></div></div>
      <div class="section"><h3>Lab teams · ${r.active.length}/${r.slots} busy</h3>${active || '<p class="note">No projects running. Every day without data is a day flying blind.</p>'}</div>
      <div class="section"><h3>Projects</h3>${list}</div>`;
  }

  labProfile() {
    const g = this.game;
    const p = g.pathogen;
    const k = g.knowledge;
    const u = t => `<span class="unknown">${t}</span>`;
    const ifr = a => (p.hosp[a] * p.hfr[a] * 100).toFixed(a === 2 ? 1 : 2) + '%';
    const repC = g.totalReportedCases(), repD = g.totalReportedDeaths();
    const naiveCfr = repC > 20 ? `${((repD / repC) * 100).toFixed(1)}% of reported cases have died, but that overstates the real risk because mild cases go uncounted` : 'Too few cases to estimate';
    return `
      <div class="card hl"><div class="card-top"><span class="card-title">${k.sequenced ? esc(p.name) + ` (${esc(p.short)})` : 'Unidentified pathogen'}</span>
        <span class="card-meta">${k.sequenced ? esc(p.family) : 'run Genome Sequencing'}</span></div>
        <p>${k.sequenced ? `Causes <b>${esc(p.disease)}</b>.` : 'Patients share a distinctive clinical picture, but no known pathogen matches.'} Reported symptoms: ${esc(p.symptoms.join(', '))}.</p>
      </div>
      <dl class="facts">
        <dt>Transmission route</dt><dd>${k.transmission ? esc(ROUTES[p.route].label) : u('Unknown: needs Transmission Study')}</dd>
        <dt>R0 (basic)</dt><dd>${k.transmission ? p.R0.toFixed(2) : u(`Early estimate ${(p.R0 * 0.7).toFixed(1)}–${(p.R0 * 1.35).toFixed(1)} (very uncertain)`)}</dd>
        <dt>Herd immunity threshold</dt><dd>${k.transmission ? pct(1 - 1 / p.R0) : u('Depends on R0')}</dd>
        <dt>Spread before symptoms</dt><dd>${k.transmission ? pct(p.presymp) + ' of transmission' : u('Unknown')}</dd>
        <dt>Asymptomatic infections</dt><dd>${k.transmission ? pct(p.asymp) : u('Unknown')}</dd>
        <dt>Incubation period</dt><dd>${k.severity ? p.incubation.toFixed(1) + ' days' : u(`About ${Math.max(1, Math.round(p.incubation - 2))}–${Math.round(p.incubation + 3)} days (clinical reports)`)}</dd>
        <dt>Hospitalized</dt><dd>${k.severity ? AGE_GROUPS.map((a, i) => `${a.short}: ${pct(p.hosp[i], 1)}`).join(' · ') : u('Unknown')}</dd>
        <dt>Infection fatality rate</dt><dd>${k.severity ? `${AGE_GROUPS.map((a, i) => `${a.short}: ${ifr(i)}`).join(' · ')} · overall ${(p.ifr * 100).toFixed(2)}%` : u(naiveCfr)}</dd>
        <dt>Origin</dt><dd>${k.sequenced && g.day > 45 ? esc(p.origin) : u('Under investigation')}</dd>
        ${g.variant && g.variant.detected ? `<dt>Variant</dt><dd>${esc(g.variant.name)} · ~${Math.round(g.variant.share * 100)}% of cases</dd>` : ''}
        ${k.sero ? `<dt>Last serosurvey</dt><dd>Day ${k.sero.day}: ${pct(k.sero.prevalence, 2)} infected · ${k.sero.ratio ? k.sero.ratio.toFixed(1) + '× reported' : ''}</dd>` : ''}
      </dl>
      ${k.transmission ? `<p class="note">${esc(ROUTES[p.route].note)}</p>` : ''}`;
  }

  // ======================= VACCINE =======================
  render_vaccine() {
    const g = this.game;
    const intro = `<div class="persona"><div class="avatar" style="background:${CHARACTERS.vaccine.color}">GO</div>
      <div><b>${CHARACTERS.vaccine.name}</b><div class="note">${CHARACTERS.vaccine.role}</div><div class="quote">${esc(vaxQuote(g))}</div></div></div>`;
    if (this.tab === 'new') return intro + this.vaxNew();
    if (this.tab === 'distribution') return intro + this.vaxDistribution();
    return intro + this.vaxPipeline();
  }

  vaxPipeline() {
    const g = this.game;
    const cands = g.vaccine.candidates;
    if (!cands.length) {
      return `<div class="card"><p>${g.knowledge.sequenced ? 'No candidates yet. Open the <b>New candidate</b> tab to launch one. Running two platforms in parallel hedges against failure.' : 'We need the genome first. Get the Laboratory to sequence the pathogen.'}</p>
        ${g.knowledge.sequenced ? '<button type="button" class="btn primary" data-act="tab" data-arg="new">Choose a platform</button>' : ''}</div>`;
    }
    return cands.slice().reverse().map(c => {
      const pl = PLATFORMS[c.platform];
      const si = STAGES.indexOf(c.stage);
      const stages = STAGES.map((s, i) => `<i class="${c.stage === 'failed' ? 'fail' : i < si || c.stage === 'authorized' ? 'done' : i === si ? 'cur' : ''}" title="${STAGE_LABEL[s]}"></i>`).join('');
      let progress = '';
      if (c.stage === 'phase3') {
        progress = `<div class="note">Endpoints: <b class="num">${Math.floor(c.endpoints)}/${ENDPOINTS_NEEDED}</b> cases among volunteers · follow-up day ${c.stageDay}/${c.stageDays}</div>
          <div class="bar"><i style="width:${Math.min(100, (c.endpoints / ENDPOINTS_NEEDED) * 100)}%;background:var(--warn)"></i></div>`;
      } else if (!['authorized', 'failed'].includes(c.stage)) {
        progress = `<div class="note">${Math.max(0, c.stageDays - c.stageDay)} days left in this stage${c.waitingFunds ? ' · <b style="color:var(--bad)">paused: waiting for funding</b>' : ''}</div>
          <div class="bar"><i style="width:${Math.min(100, (c.stageDay / Math.max(1, c.stageDays)) * 100)}%"></i></div>`;
      }
      const eff = c.effKnown ? `<span class="chip good">${Math.round(c.efficacy * 100)}% efficacy</span>` : c.effHint ? `<span class="chip info">Phase II immune response: ${Math.round(c.effHint[0] * 100)}–${Math.round(c.effHint[1] * 100)}%</span>` : '<span class="chip">Efficacy unknown</span>';
      const fundOK = !['phase3', 'review', 'authorized', 'failed'].includes(c.stage);
      const actions = [];
      if (fundOK) actions.push(`<button type="button" class="btn small ${c.funding === 'standard' ? 'on' : ''}" data-act="funding" data-arg="${c.id}" data-arg2="standard">Standard</button>
        <button type="button" class="btn small ${c.funding === 'accelerated' ? 'on' : ''}" data-act="funding" data-arg="${c.id}" data-arg2="accelerated">Accelerated (−${Math.round((1 - ACCEL.timeMult) * 100)}% time, ×${ACCEL.costMult} cost)</button>`);
      if (['phase2', 'phase3', 'review'].includes(c.stage) && c.mfgStart == null) actions.push(`<button type="button" class="btn small" data-act="atrisk" data-arg="${c.id}" ${g.budget >= AT_RISK_COST ? '' : 'disabled'}>Manufacture at risk (${money(AT_RISK_COST)})</button>`);
      if (c.stage === 'phase3' && !c.expanded) actions.push(`<button type="button" class="btn small" data-act="expand" data-arg="${c.id}" ${g.budget >= 110 ? '' : 'disabled'}>Add international sites ($110M)</button>`);
      if (c.stage === 'phase3' && !c.challenge) actions.push(`<button type="button" class="btn small danger" data-act="challenge" data-arg="${c.id}">Human challenge study (Trust −5)</button>`);
      const mfg = c.mfgStart != null && c.stage !== 'failed' ? `<div class="note">Manufacturing: <b class="num">${(productionRate(c, g.day) + (c.bonusRate || 0)).toFixed(2)}M</b> doses/day · <b class="num">${fmtBig(c.stock)}</b> in stock${c.stage !== 'authorized' ? ' (cannot be used until authorized)' : ''}</div>` : '';
      return `<div class="card ${c.stage === 'failed' ? 'bad' : c.stage === 'authorized' ? 'hl' : ''}">
        <div class="card-top"><span class="card-title">${esc(c.name)}</span><span class="card-meta">${pl.doses === 2 ? '2 doses' : '1 dose'} · day ${c.startedDay}</span></div>
        <div class="stages">${stages}</div>
        <div class="row"><b>${STAGE_LABEL[c.stage]}</b>${eff}</div>
        ${progress}${mfg}
        ${c.failReason ? `<p class="note warn">${esc(c.failReason)}</p>` : ''}
        ${actions.length ? `<div class="row">${actions.join('')}</div>` : ''}
        <div class="log">${c.log.slice(-3).map(l => `<div>${esc(l)}</div>`).join('')}</div>
      </div>`;
    }).join('');
  }

  vaxNew() {
    const g = this.game;
    if (!g.knowledge.sequenced) return '<div class="card"><p>Vaccine design needs the genome sequence. Start <b>Genome Sequencing</b> in the Laboratory.</p></div>';
    const live = g.vaccine.candidates.filter(c => !['failed', 'authorized'].includes(c.stage)).length;
    return `<p class="note">Running candidates: ${live}/3. Prices are per stage, charged as each stage begins. Accelerated funding overlaps phases (Operation-Warp-Speed style) for ${Math.round((1 - ACCEL.timeMult) * 100)}% less time at ${ACCEL.costMult}× the cost.</p>` +
      Object.values(PLATFORMS).map(pl => {
        const days = ['design', 'preclinical', 'phase1', 'phase2', 'phase3', 'review'].reduce((s, st) => s + pl.stageDays[st], 0);
        const cost = ['design', 'preclinical', 'phase1', 'phase2', 'phase3'].reduce((s, st) => s + stageCost(pl, st, 'standard'), 0);
        const first = stageCost(pl, 'design', 'standard');
        const firstA = stageCost(pl, 'design', 'accelerated');
        return `<div class="card plat"><div class="card-top"><span class="card-title">${esc(pl.name)}</span><span class="card-meta">${esc(pl.tagline)}</span></div>
          <div class="row"><span class="chip">Efficacy ${Math.round(pl.eff[0] * 100)}–${Math.round(pl.eff[1] * 100)}%</span><span class="chip">${pl.doses} dose${pl.doses > 1 ? 's' : ''}</span><span class="chip">~${days} days to EUA</span><span class="chip">~${money(cost)} total</span><span class="chip">up to ${pl.maxRate}M doses/day</span></div>
          <div class="grid2"><ul class="pros">${pl.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul><ul class="cons">${pl.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div class="row"><button type="button" class="btn primary small" data-act="vaccine" data-arg="${pl.id}" data-arg2="standard" ${live < 3 && g.budget >= first ? '' : 'disabled'}>Launch · ${money(first)}</button>
          <button type="button" class="btn small" data-act="vaccine" data-arg="${pl.id}" data-arg2="accelerated" ${live < 3 && g.budget >= firstA ? '' : 'disabled'}>Launch accelerated · ${money(firstA)}</button></div></div>`;
      }).join('');
  }

  vaxDistribution() {
    const g = this.game;
    const v = g.vaccine;
    const auth = g.authorizedCandidates();
    const stock = auth.reduce((s, c) => s + c.stock, 0);
    const prod = auth.reduce((s, c) => s + productionRate(c, g.day) + (c.bonusRate || 0), 0);
    const usesMrna = auth.some(c => c.platform === 'mrna');
    const capNote = usesMrna && !v.upgrades.has('coldChain') ? ' (−15% ultra-cold penalty)' : '';
    return `
      ${auth.length ? '' : '<p class="note warn">No authorized vaccine yet. You can still prepare distribution capacity now so you\'re ready on day one.</p>'}
      <div class="kpis">
        ${k('Doses in stock', fmtBig(stock), 'authorized vaccines')}
        ${k('Production', prod.toFixed(2) + 'M', 'doses / day')}
        ${k('Given yesterday', fmtBig(v.todayGiven), 'people')}
        ${k('Capacity', (v.adminCapacity).toFixed(2) + 'M', 'people / day' + capNote)}
        ${k('Vaccinated', pct(g.vaccineCoverage(), 1), fmtBig(g.vaccinatedTotal()) + ' people')}
      </div>
      <div class="section"><h3>Coverage by age</h3>
        ${AGE_GROUPS.map((a, i) => `<div><div class="row" style="justify-content:space-between"><span>${a.label}</span><span class="num">${pct(g.ageCoverage(i), 1)}</span></div><div class="bar"><i style="width:${g.ageCoverage(i) * 100}%;background:var(--good)"></i></div></div>`).join('')}
        <p class="note">${v.pediatric === 'authorized' ? 'Children are eligible.' : 'Children are not eligible until a pediatric trial finishes.'} Willingness to get vaccinated depends on public trust and misinformation.</p>
      </div>
      <div class="section"><h3>Who gets doses first</h3>
        <div class="levels l4">${STRATEGIES.map(s => `<button type="button" data-act="strategy" data-arg="${s.id}" class="${v.strategy === s.id ? 'rec eff' : ''}"><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></button>`).join('')}</div>
      </div>
      <div class="section"><h3>Delivery capacity</h3>
        ${ADMIN_UPGRADES.map(u => `<div class="card"><div class="proj"><div><div class="card-title">${esc(u.name)}</div><p class="note">${esc(u.desc)}${u.capacity ? ` +${u.capacity}M/day.` : ''}${u.uptake ? ` Uptake +${Math.round(u.uptake * 100)}%.` : ''}</p></div>
          <div>${v.upgrades.has(u.id) ? '<span class="chip good">funded</span>' : `<button type="button" class="btn small" data-act="upgrade" data-arg="${u.id}" ${g.budget >= u.cost ? '' : 'disabled'}>Fund ${money(u.cost)}</button>`}</div></div></div>`).join('')}
      </div>
      <div class="grid2">
        <div class="card"><div class="card-title">Pediatric trial</div>
          <p class="note">${v.pediatric === 'authorized' ? 'Done: ages 5–17 are eligible.' : v.pediatric ? `Underway, results in about ${Math.max(0, v.pediatric.start + v.pediatric.days - g.day)} days.` : 'About 70 days, $60M. Lets children be vaccinated.'}</p>
          ${!v.pediatric ? `<button type="button" class="btn small" data-act="pediatric" ${auth.length && g.budget >= 60 ? '' : 'disabled'}>Start trial</button>` : ''}</div>
        <div class="card"><div class="card-title">Variant-adapted vaccine</div>
          <p class="note">${v.variantUpdate === 'done' ? 'Updated doses are shipping.' : v.variantUpdate ? `In development, ready in about ${Math.max(0, v.variantUpdate.start + v.variantUpdate.days - g.day)} days.` : g.variant && g.variant.detected ? `${esc(g.variant.name)} partly escapes vaccine protection. $120M, about 42 days. Needs genomic surveillance.` : 'Only needed if a vaccine-escape variant shows up.'}</p>
          ${!v.variantUpdate && g.variant && g.variant.detected ? `<button type="button" class="btn small" data-act="variantVax">Develop update</button>` : ''}</div>
      </div>`;
  }

  // ======================= PRESS =======================
  render_press() {
    const g = this.game;
    const ready = g.day >= g.briefing.cooldownUntil;
    const meters = [
      ['Public trust', g.trust / 100, '#4cc3ff', 'Drives compliance, local adoption of your recommendations, and vaccine uptake.'],
      ['Compliance', g.compliance, '#3ddc97', 'How closely people follow the measures in effect. Fear raises it; fatigue erodes it.'],
      ['Misinformation', g.misinfo / 100, '#ff5d5d', 'Slowly wears down trust and makes people refuse the vaccine.'],
      ['Pandemic fatigue', g.fatigue / 0.32, '#ffb547', 'Builds up during long, strict restrictions and eases when they lift.'],
    ];
    const tones = [
      ['transparent', 'Transparent & science-led', 'Share what we know and what we don\'t. Trust goes up steadily. The safe choice.'],
      ['reassuring', 'Reassuring', 'Calm the public. Bigger short-term boost to trust and leadership, but it backfires badly if cases surge within 3 weeks.'],
      ['urgent', 'Urgent warning', 'Sound the alarm. Compliance rises for about 30 days, but the White House won\'t love it.'],
    ];
    return `
      <div class="persona"><div class="avatar" style="background:${CHARACTERS.comms.color}">JR</div>
        <div><b>${CHARACTERS.comms.name}</b><div class="note">${CHARACTERS.comms.role}</div><div class="quote">${esc(pressQuote(g))}</div></div></div>
      <div class="grid2">${meters.map(([n, v, c, d]) => `<div class="card"><div class="card-top"><span class="card-title">${n}</span><span class="num">${Math.round(v * 100)}%</span></div>
        <div class="bar"><i style="width:${Math.min(100, v * 100)}%;background:${c}"></i></div><p class="note">${d}</p></div>`).join('')}</div>
      <div class="section"><h3>Press briefing ${ready ? '' : `· next possible day ${g.briefing.cooldownUntil}`}</h3>
        <div class="levels l3">${tones.map(([id, n, d]) => `<button type="button" data-act="brief" data-arg="${id}" ${ready ? '' : 'disabled'}><b>${n}</b><small>${d}</small></button>`).join('')}</div>
      </div>
      <div class="section"><h3>Public campaigns</h3>
        ${CAMPAIGNS.map(c => {
          const run = g.campaigns.find(x => x.id === c.id && x.until > g.day);
          return `<div class="card"><div class="proj"><div><div class="card-title">${esc(c.name)}</div><p class="note">${esc(c.desc)}</p></div>
            <div>${run ? `<span class="chip good">${run.until - g.day} days left</span>` : `<button type="button" class="btn small" data-act="campaign" data-arg="${c.id}" ${g.budget >= c.cost ? '' : 'disabled'}>${money(c.cost)} · ${c.days}d</button>`}</div></div></div>`;
        }).join('')}
      </div>
      <div class="section"><h3>Today's headlines</h3>
        <ul class="note" style="margin:0;padding-left:18px;display:grid;gap:4px">${headlines(g).slice(0, 6).map(hl => `<li>${esc(hl)}</li>`).join('')}</ul>
      </div>`;
  }

  // ======================= DIRECTOR =======================
  render_director() {
    const g = this.game;
    const c = g.dailyCosts();
    const runway = c.total > 0.01 ? Math.floor(g.budget / c.total) : Infinity;
    const f = g.funding;
    const fundStatus = f.pending ? `Before Congress: decision around day ${f.pending.decideDay}.` : g.day < f.cooldownUntil ? `Congress won't take another request until day ${f.cooldownUntil}.` : 'Ready to ask Congress.';
    return `
      <div class="persona"><div class="avatar" style="background:${CHARACTERS.director.color}">MH</div>
        <div><b>${CHARACTERS.director.name}</b><div class="note">${CHARACTERS.director.role}</div><div class="quote">${esc(directorQuote(g))}</div></div></div>
      <div class="kpis">
        ${k('Budget', money(g.budget), g.budget < 0 ? 'in deficit!' : 'available')}
        ${k('Burn rate', money(c.total) + '/day', runway === Infinity ? 'no daily costs' : runway > 999 ? '' : `~${Math.max(0, runway)} days of runway`)}
        ${k('Spent so far', money(g.spentTotal), '')}
        ${k('Leadership confidence', Math.round(g.leadership) + '%', g.leadership < 25 ? 'your job is at risk' : 'White House & HHS')}
      </div>
      <div class="card"><div class="card-title">What leadership is watching</div>
        <p class="note">Deaths (${fmtBig(g.nationalReported7('repDeaths'))}/day), overwhelmed hospitals (${g.overflowCities()} metros), economic disruption (${Math.round(g.disruption)}/100), budget deficits, and whether things are improving. If confidence hits zero, you're replaced.</p>
        <div class="bar"><i style="width:${g.leadership}%;background:${g.leadership < 25 ? 'var(--bad)' : g.leadership < 50 ? 'var(--warn)' : 'var(--gold)'}"></i></div>
      </div>
      <div class="grid2">
        <div class="card"><div class="card-title">Emergency supplemental funding</div><p class="note">${fundStatus} Approval is likelier when the threat is obvious and leadership trusts you.</p>
          <button type="button" class="btn primary small" data-act="requestFunding" ${!f.pending && g.day >= f.cooldownUntil ? '' : 'disabled'}>Ask Congress</button></div>
        <div class="card"><div class="card-title">More field teams</div><p class="note">You have ${g.teams.total} EIS teams. Recruit 2 more for $18M (max 12).</p>
          <button type="button" class="btn small" data-act="hire" ${g.teams.total < 12 && g.budget >= 18 ? '' : 'disabled'}>Recruit +2</button></div>
        <div class="card"><div class="card-title">Lab capacity</div><p class="note">${g.research.slots} projects can run at once. Add one for ${g.research.slots === 2 ? '$45M' : '$80M'} (max 4).</p>
          <button type="button" class="btn small" data-act="lab" ${g.research.slots < 4 ? '' : 'disabled'}>Expand lab</button></div>
        <div class="card"><div class="card-title">Strategic National Stockpile</div><p class="note">${g.sns.units} shipments of ventilators & PPE left. Replenish 3 for $60M.</p>
          <button type="button" class="btn small" data-act="restock" ${g.sns.units < 6 ? '' : 'disabled'}>Replenish</button></div>
      </div>`;
  }

  // ======================= OFFICE =======================
  render_office() {
    const g = this.game;
    if (this.tab === 'sitrep') {
      const k2 = g.knowledge;
      return `<div class="grid2">
          <div class="chart-box"><div class="chart-label">Reported cases / day</div><canvas data-chart="cases"></canvas></div>
          <div class="chart-box"><div class="chart-label">Reported deaths / day</div><canvas data-chart="deaths"></canvas></div>
          <div class="chart-box"><div class="chart-label">Hospitalized vs capacity</div><canvas data-chart="hosp"></canvas></div>
          <div class="chart-box"><div class="chart-label">Rt estimate (dashed = 1)</div><canvas data-chart="rt"></canvas></div>
        </div>
        <div class="chart-box"><div class="chart-label">Population vaccinated (%)</div><canvas data-chart="vax"></canvas></div>
        <div class="card"><div class="card-title">What we know</div>
          <p class="note">${k2.sequenced ? `Pathogen: ${esc(g.pathogen.name)}.` : 'Pathogen not yet identified.'} ${k2.assay ? 'PCR testing is available.' : 'No diagnostic test yet.'} ${k2.transmission ? `R0 ≈ ${g.pathogen.R0.toFixed(1)}.` : 'Transmissibility uncertain.'} ${k2.severity ? `IFR ≈ ${(g.pathogen.ifr * 100).toFixed(2)}%.` : 'Severity uncertain.'} ${k2.therapeutics ? 'An effective treatment exists.' : ''}</p></div>`;
    }
    if (this.tab === 'guide') return GUIDE;
    if (this.tab === 'settings') {
      return `<div class="card"><label class="check"><input type="checkbox" data-change="autopause" ${g.settings.autoPauseConsoles ? 'checked' : ''}> Pause time while a console is open</label>
        <p class="note">Turn this off for a tougher, more real-time game: the outbreak keeps moving while you read.</p></div>
        <div class="card"><div class="card-title">Scenario</div><p class="note">${g.mode === 'story' ? 'Story: Vesper' : 'Outbreak generator'} · ${esc(g.diff.name)} · seed ${g.seed}</p>
        <button type="button" class="btn danger small" data-act="restart">${this.confirmRestart ? 'Click again to abandon this outbreak' : 'Abandon & return to title'}</button></div>`;
    }
    if (!g.messages.length) return '<p class="note">No messages yet.</p>';
    return g.messages.slice(0, 60).map((m, i) => `<details class="msg ${m.read ? '' : 'unread'}" data-msg="${i}" ${i === 0 && !m.read ? 'open' : ''}>
      <summary><span class="swatch" style="background:${m.from.color || '#888'}"></span><span><span class="subj">${esc(m.subject)}</span><div class="who">${esc(m.from.name)}${m.from.role ? ' · ' + esc(m.from.role) : ''}</div></span><span class="card-meta">Day ${m.day}</span></summary>
      <div class="msg-body">${esc(m.body)}</div></details>`).join('');
  }
}

function k(label, value, sub = '') {
  return `<div class="k"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

function avg(h, i, key) {
  let s = 0, n = 0;
  for (let j = Math.max(0, i - 6); j <= i; j++) { s += h[j][key]; n++; }
  return s / n;
}

function labQuote(g) {
  if (!g.research.done.has('sequencing') && !g.research.active.some(a => a.id === 'sequencing')) return 'Samples are in the freezer. Say the word and we start sequencing. That unlocks everything else.';
  if (!g.knowledge.assay) return 'Once we have the genome, a PCR test is about ten days away. Until then we can only count the sickest patients.';
  if (!g.knowledge.transmission) return 'We still don\'t really know how contagious this is. A transmission study would tell us whether isolating sick people is enough.';
  if (!g.knowledge.therapeutics && g.day > 60) return 'A treatment wouldn\'t stop the spread, but it would keep more people alive in the ICU.';
  return 'The bench is humming. Tell me what you need to know next.';
}

function vaxQuote(g) {
  const auth = g.authorizedCount;
  if (!g.knowledge.sequenced) return 'Get me a genome and I\'ll get you a vaccine. Probably.';
  if (!g.vaccine.candidates.length) return 'We\'re ready. My advice: mRNA for speed, plus a second platform as insurance.';
  if (g.vaccine.candidates.some(c => c.waitingFunds)) return 'We\'re stalled. The next trial phase is funded or it isn\'t. Talk to the Director.';
  if (auth && g.vaccine.upgrades.size === 0) return 'A vial in a warehouse protects nobody. We need pharmacies and mass vaccination sites.';
  if (g.vaccine.candidates.some(c => c.stage === 'phase3')) return 'Phase III needs cases among volunteers to read out. Ironically, the better you control the outbreak, the slower the trial goes.';
  return 'Every day we shave off this timeline is lives saved.';
}

function pressQuote(g) {
  if (!g.flags.briefed) return 'Reporters are camped in the lobby. If we don\'t tell the story, someone else will.';
  if (g.misinfo > 50) return 'Misinformation is beating us on reach. We need trusted local messengers, not more podiums.';
  if (g.trust < 40) return 'People have stopped listening. Be honest, admit uncertainty, and earn trust back.';
  return 'Trust is built slowly and lost fast. Say what we know, what we don\'t, and what we\'re doing about it.';
}

function directorQuote(g) {
  if (g.leadership < 25) return 'The White House is asking me if you\'re the right person for this. Give me a reason to say yes.';
  if (g.budget < 150) return 'We\'re running on fumes. Make the case to Congress while people are still paying attention.';
  if (g.overflowCities() > 0) return 'Hospitals are overflowing. That\'s where people die who didn\'t have to. Fix it.';
  if (g.authorizedCount) return 'We have a vaccine. Now the hard part: getting it into arms.';
  if (g.day < 15) return 'Early moves matter most. Every doubling we prevent now is thousands of lives later.';
  return 'You have my support. Keep the data honest and the response ahead of the curve.';
}

const GUIDE = `
  <div class="card"><div class="card-title">How to win</div>
  <p>Stop the outbreak with as few deaths as possible. It's over after 28 straight days with no new reported cases. You get fired if leadership confidence hits zero, and after two years the review board grades whatever you have.</p>
  <p class="note">A strong opening: sequence the pathogen right away, build the PCR test, send field teams and testing to the first hotspots, hold a transparent briefing, and launch a vaccine (ideally two platforms). Use stronger measures when hospitals start filling up, then ease off before fatigue sets in.</p></div>
  <dl class="glossary">
    <dt>R0 (basic reproduction number)</dt><dd>Average number of people one case infects in a population with no immunity and no precautions. Above 1, outbreaks grow.</dd>
    <dt>Rt (effective reproduction number)</dt><dd>The same thing right now, after immunity and interventions. Get Rt below 1 and the outbreak shrinks.</dd>
    <dt>Herd immunity threshold</dt><dd>About 1 − 1/R0 of people need immunity before spread declines on its own. For R0 = 3 that's 67%.</dd>
    <dt>Incubation & presymptomatic spread</dt><dd>Time from infection to symptoms. If much of the spread happens before symptoms, isolating sick people isn't enough, so contact tracing and broader measures matter.</dd>
    <dt>IFR vs. CFR</dt><dd>Infection fatality rate counts every infection; case fatality rate counts only confirmed cases. CFR is usually much higher because mild cases go untested.</dd>
    <dt>Ascertainment</dt><dd>The share of infections that get reported. Serosurveys measure it; wastewater shows hidden spread.</dd>
    <dt>NPIs</dt><dd>Non-pharmaceutical interventions: masks, distancing, closures. They work, but people tire of them.</dd>
    <dt>Phase I / II / III</dt><dd>Safety in dozens → dosing and immune response in hundreds → efficacy in tens of thousands. Phase III needs real infections among volunteers to show the vaccine works.</dd>
    <dt>EUA</dt><dd>Emergency Use Authorization: FDA's fast-track approval during a public health emergency.</dd>
    <dt>EIS</dt><dd>Epidemic Intelligence Service, CDC's "disease detectives," deployed to investigate and trace outbreaks.</dd>
  </dl>`;
