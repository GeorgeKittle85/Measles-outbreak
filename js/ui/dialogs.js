// Event/story dialogs and the end-of-game after-action report.
import { fmtBig } from '../core/game.js';
import { chart } from '../world/screens.js';
import { esc, money } from './consoles.js';

export class Modal {
  constructor(app) {
    this.app = app;
    this.wrap = document.getElementById('modal-wrap');
    this.from = document.getElementById('modal-from');
    this.title = document.getElementById('modal-title');
    this.body = document.getElementById('modal-body');
    this.choices = document.getElementById('modal-choices');
    this.current = null;
    this.choices.addEventListener('click', e => {
      const b = e.target.closest('button[data-choice]');
      if (!b || b.disabled || !this.current) return;
      this.resolve(Number(b.dataset.choice));
    });
  }

  get open() { return !!this.current; }

  // Show the next pending game event, if any.
  pump() {
    const g = this.app.game;
    if (this.current || !g || !g.pendingEvents.length) return;
    const inst = g.pendingEvents[0];
    this.current = inst;
    const f = inst.from;
    this.from.innerHTML = f ? `<div class="avatar" style="background:${f.color}">${esc(initials(f.name))}</div><div><b>${esc(f.name)}</b>${esc(f.role)}</div>` : '';
    this.title.textContent = inst.title;
    this.body.innerHTML = String(inst.body).split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('');
    if (inst.choices) {
      this.choices.innerHTML = inst.choices.map((c, i) => `<button type="button" class="choice" data-choice="${i}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b>${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</button>`).join('');
    } else {
      this.choices.innerHTML = `<button type="button" class="btn primary big" data-choice="0">${inst.def.id === 'intro' ? "I'm on it" : 'Continue'}</button>`;
    }
    this.wrap.hidden = false;
    setTimeout(() => this.choices.querySelector('button:not(:disabled)')?.focus(), 50);
  }

  resolve(idx) {
    const g = this.app.game;
    const inst = this.current;
    const res = g.resolveEvent(inst.id, idx);
    if (res && res.msg) this.app.hud.toast(res.msg, 'info');
    this.current = null;
    this.wrap.hidden = true;
    this.app.hud.update(true);
    this.app.onDayVisuals();
    setTimeout(() => this.pump(), 200);
  }

  reset() {
    this.current = null;
    this.wrap.hidden = true;
  }
}

function initials(name) {
  return name.replace(/^(Dr\.|CDR)\s+/, '').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
}

export function showEnd(app, outcome) {
  const g = app.game;
  const el = document.getElementById('end');
  const titles = {
    contained: ['Outbreak contained', `Day ${outcome.day}: 28 days without a new reported case. The emergency declaration has been lifted.`],
    fired: ['Relieved of command', `Day ${outcome.day}: the White House has lost confidence in the response. Another incident manager takes over from here.`],
    timeout: ['The long haul', `Two years in, ${g.knowledge.sequenced ? g.pathogen.name : 'the virus'} is still circulating. The review board grades your response as it stands.`],
  };
  const [title, summary] = titles[outcome.kind];
  document.getElementById('end-kicker').textContent = `After-action report · ${g.mode === 'story' ? 'Vesper' : g.pathogen.name} · ${g.diff.name}`;
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-summary').textContent = summary + ' ' + verdict(outcome);
  const grade = document.getElementById('end-grade');
  grade.textContent = outcome.grade;
  const gc = outcome.grade.startsWith('A') ? 'var(--good)' : outcome.grade === 'B' ? 'var(--accent)' : outcome.grade === 'C' ? 'var(--warn)' : 'var(--bad)';
  grade.style.borderColor = gc;
  grade.style.color = gc;
  const asc = outcome.reportedCases > 0 ? outcome.infections / outcome.reportedCases : null;
  const stats = [
    ['True infections', fmtBig(outcome.infections), `${fmtBig(outcome.reportedCases)} reported${asc ? ` (1 in ${asc.toFixed(0)})` : ''}`],
    ['Deaths', fmtBig(outcome.deaths), `${outcome.per100k.toFixed(0)} per 100k · ${fmtBig(outcome.reportedDeaths)} reported`],
    ['Without a response', fmtBig(outcome.cfDeaths), outcome.kind === 'contained' ? 'deaths if nobody had acted' : `deaths by day ${outcome.day} if nobody had acted`],
    ['Lives saved', fmtBig(outcome.saved), `${(outcome.savedFrac * 100).toFixed(0)}% of projected deaths averted`],
    ['Vaccinated', fmtBig(outcome.vaccinated), `${((outcome.vaccinated / g.totalPop) * 100).toFixed(0)}% of residents`],
    ['Money spent', money(outcome.spent), `final trust ${Math.round(g.trust)}%`],
  ];
  document.getElementById('end-stats').innerHTML = stats.map(([l, v, s]) => `<div class="k"><span>${l}</span><b>${v}</b><small>${s}</small></div>`).join('');

  const cv = document.getElementById('end-canvas');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const h = g.history;
  const series = [
    { data: h.map(d => d.cfInf), color: 'rgba(255,93,93,0.85)', dash: [7, 5], width: 2 },
    { data: h.map(d => d.trueInf), color: '#ffb547', fill: 'rgba(255,181,71,0.18)' },
    { data: h.map(d => d.repCases), color: '#4cc3ff', width: 2 },
  ];
  let max = 10;
  for (const s of series.slice(1)) for (const v of s.data) max = Math.max(max, v);
  max = Math.max(max * 1.15, Math.min(Math.max(...series[0].data), max * 4));
  ctx.font = '13px "IBM Plex Mono", monospace';
  chart(ctx, 0, 6, cv.width, cv.height - 12, series, { max });
  document.getElementById('end-legend').innerHTML =
    '<span><i class="swatch" style="background:#ffb547"></i>True infections</span><span><i class="swatch" style="background:#4cc3ff"></i>Reported cases</span><span><i class="swatch" style="background:#ff5d5d"></i>No response (projection, clipped)</span>';
  el.hidden = false;
}

function verdict(o) {
  if (o.kind === 'fired') return 'History will remember the lives you saved, though not as many as it might have.';
  if (o.grade === 'A+') return 'A textbook response that will be taught at the EIS conference for years.';
  if (o.grade === 'A') return 'An outstanding response. The country owes your team a lot.';
  if (o.grade === 'B') return 'A solid response with some painful lessons.';
  if (o.grade === 'C') return 'The country got through it, at a heavy cost.';
  return 'Too many lives were lost. The after-action review will be long.';
}
