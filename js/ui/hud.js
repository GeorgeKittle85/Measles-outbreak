// Heads-up display: top bar meters, objectives, quick travel, ticker, prompt and toasts.
import { fmtBig } from '../core/game.js';
import { STATIONS } from '../world/hq.js';
import { headlines } from './news.js';
import { esc, money } from './consoles.js';

const NAV = ['eoc', 'lab', 'vaccine', 'press', 'director', 'office'];

export class HUD {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hud');
    this.meters = document.getElementById('hud-meters');
    this.stats = document.getElementById('hud-stats');
    this.dayEl = document.getElementById('hud-day');
    this.dateEl = document.getElementById('hud-date');
    this.pausePill = document.getElementById('pause-pill');
    this.objList = document.getElementById('obj-list');
    this.objBox = document.getElementById('objectives');
    this.toasts = document.getElementById('toasts');
    this.prompt = document.getElementById('prompt');
    this.promptText = document.getElementById('prompt-text');
    this.ticker = document.getElementById('ticker-text');
    this.nav = document.getElementById('quicknav');
    this.lastUpdate = 0;
    this.lastObjKey = '';

    const tb = document.getElementById('topbar');
    const setH = () => document.documentElement.style.setProperty('--topbar-h', `${tb.offsetHeight}px`);
    if (window.ResizeObserver) new ResizeObserver(setH).observe(tb);
    window.addEventListener('resize', setH);
    setH();
    document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => app.setSpeed(Number(b.dataset.speed))));
    document.getElementById('obj-toggle').addEventListener('click', () => {
      this.objBox.classList.toggle('collapsed');
      document.getElementById('obj-toggle').setAttribute('aria-expanded', String(!this.objBox.classList.contains('collapsed')));
    });
    if (window.innerWidth < 600) this.objBox.classList.add('collapsed');
    this.objList.addEventListener('click', e => {
      const b = e.target.closest('button[data-station]');
      if (b) app.goToStation(b.dataset.station, true);
    });
    document.getElementById('prompt-btn').addEventListener('click', () => app.interact());

    this.nav.innerHTML = '<span class="label-go">Go to</span>' + NAV.map(id => {
      const st = STATIONS.find(s => s.id === id);
      return `<button type="button" data-station="${id}" title="Walk to ${esc(st.name)}"><span class="dot" style="background:#${st.color.toString(16).padStart(6, '0')}"></span><span class="qn-name">${esc(st.short)}</span><span class="badge" hidden></span></button>`;
    }).join('');
    this.nav.addEventListener('click', e => {
      const b = e.target.closest('button[data-station]');
      if (b) app.goToStation(b.dataset.station, true);
    });
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; }

  toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.prepend(el);
    const max = window.innerWidth < 820 ? 2 : 5;
    while (this.toasts.children.length > max) this.toasts.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'bad' ? 6500 : 4800);
  }

  setPrompt(station) {
    if (!station) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.promptText.textContent = `${station.verb} · ${station.name}`;
  }

  refreshTicker() {
    const g = this.app.game;
    if (!g) return;
    this.ticker.textContent = headlines(g).join('   •   ');
  }

  update(force = false) {
    const g = this.app.game;
    if (!g) return;
    const now = performance.now();
    if (!force && now - this.lastUpdate < 250) return;
    this.lastUpdate = now;

    this.dayEl.textContent = `Day ${g.day}`;
    this.dateEl.textContent = g.dateLabel;
    const app = this.app;
    document.querySelectorAll('.speed button').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === app.speed));
    const frozen = app.timeFrozen();
    this.pausePill.hidden = !(frozen && !g.over);
    this.pausePill.textContent = app.speed === 0 ? 'PAUSED'
      : app.modal.open ? 'PAUSED · DECISION'
        : app.consoles.station && g.settings.autoPauseConsoles ? 'PAUSED · CONSOLE' : 'PAUSED';

    const meter = (label, v, color, shown, short = label) => `<div class="meter" title="${label}"><div class="meter-top"><span class="ml-long">${label}</span><span class="ml-short">${short}</span><b>${shown}</b></div><div class="meter-bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i></div></div>`;
    const lc = g.leadership < 25 ? 'var(--bad)' : g.leadership < 50 ? 'var(--warn)' : 'var(--gold)';
    this.meters.innerHTML =
      `<div class="meter" title="Budget"><div class="meter-top">Budget</div><div class="money ${g.budget < 0 ? 'neg' : ''}">${money(g.budget)}</div></div>` +
      meter('Trust', g.trust, 'var(--accent)', Math.round(g.trust) + '%') +
      meter('Leadership', g.leadership, lc, Math.round(g.leadership) + '%', 'Lead') +
      meter('Misinfo', g.misinfo, 'var(--bad)', Math.round(g.misinfo) + '%');

    const hospPct = g.hospitalized() / g.totalCapacity();
    const rt = g.rtEstimate;
    this.stats.innerHTML = [
      ['Cases/day', fmtBig(g.nationalReported7()), ''],
      ['Deaths', fmtBig(g.totalReportedDeaths()), 'color:#ff8a8a'],
      ['Hospitals', Math.round(hospPct * 100) + '%', hospPct > 1 ? 'color:var(--bad)' : hospPct > 0.8 ? 'color:var(--warn)' : ''],
      ['Rt', rt == null ? '—' : rt.toFixed(2), rt == null ? '' : rt > 1 ? 'color:#ff8a8a' : 'color:var(--good)'],
      ['Vaccinated', (g.vaccineCoverage() * 100).toFixed(1) + '%', 'color:var(--good)'],
    ].map(([l, v, s]) => `<div class="kpi"><span>${l}</span><b style="${s}">${v}</b></div>`).join('');

    // objectives
    const objs = g.objectives();
    const firstOpen = objs.findIndex(o => !o.done);
    const shown = objs.filter((o, i) => !o.done || (i >= firstOpen - 1 && i < firstOpen)).slice(0, 4);
    const key = shown.map(o => o.id + o.done).join('|');
    if (key !== this.lastObjKey) {
      this.lastObjKey = key;
      this.objList.innerHTML = shown.map(o => `<li class="${o.done ? 'done' : ''} ${objs.indexOf(o) === firstOpen ? 'next' : ''}"><button type="button" data-station="${o.station}"><span class="tick"></span><span>${esc(o.text)}</span></button></li>`).join('');
    }

    // quick nav: where am I + badges
    const here = app.currentRoom();
    const att = app.attention();
    this.nav.querySelectorAll('button[data-station]').forEach(b => {
      const id = b.dataset.station;
      b.classList.toggle('here', STATIONS.find(s => s.id === id).room === here);
      const badge = b.querySelector('.badge');
      const n = att[id];
      badge.hidden = !n;
      badge.textContent = typeof n === 'number' ? String(n) : '!';
    });
  }
}
