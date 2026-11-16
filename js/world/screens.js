// Canvas drawings for the in-world screens (EOC wall, lab, vaccine wing, lobby, break-room TV).
import { fmtBig } from '../core/game.js';
import { PLATFORMS, STAGE_LABEL, ENDPOINTS_NEEDED } from '../core/vaccine.js';
import { headlines, topStage } from '../ui/news.js';
import { incidenceCss } from './holomap.js';

const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = '"Public Sans", Arial, sans-serif';

function clear(ctx, W, H, top = '#06101a', bottom = '#030810') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function header(ctx, W, text, sub, color = '#4cc3ff') {
  ctx.fillStyle = 'rgba(76,195,255,0.08)';
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = color;
  ctx.fillRect(0, 42, W, 2);
  ctx.font = `700 28px ${COND}`;
  ctx.fillStyle = '#e8f6ff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, 16, 23);
  if (sub) {
    ctx.font = `500 18px ${MONO}`;
    ctx.fillStyle = '#8fb6cf';
    ctx.textAlign = 'right';
    ctx.fillText(sub, W - 16, 23);
    ctx.textAlign = 'left';
  }
}

export function chart(ctx, x, y, w, h, series, { max = null, grid = 4, labelColor = '#6f8ea6', label = true } = {}) {
  let m = max;
  if (m == null) { m = 1; for (const s of series) for (const v of s.data) if (v > m) m = v; }
  ctx.save();
  ctx.strokeStyle = 'rgba(120,170,210,0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= grid; i++) {
    const gy = y + h - (h * i) / grid;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
    if (label && i > 0) {
      ctx.fillStyle = labelColor;
      ctx.font = `500 14px ${MONO}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmtBig((m * i) / grid), x + 4, gy - 2);
    }
  }
  for (const s of series) {
    const n = s.data.length;
    if (n < 2) continue;
    const px = i => x + (w * i) / (n - 1);
    const py = v => y + h - (h * Math.min(v, m)) / m;
    ctx.beginPath();
    ctx.moveTo(px(0), py(s.data[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(s.data[i]));
    if (s.fill) {
      ctx.lineTo(px(n - 1), y + h);
      ctx.lineTo(px(0), y + h);
      ctx.closePath();
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px(0), py(s.data[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(px(i), py(s.data[i]));
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width || 2.5;
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function stat(ctx, x, y, label, value, color = '#e8f6ff', size = 40) {
  ctx.font = `600 15px ${COND}`;
  ctx.fillStyle = '#7f9bb0';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label.toUpperCase(), x, y);
  ctx.font = `600 ${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y + size + 2);
}

function tex(panel) { panel.tex.needsUpdate = true; }

export function drawStandby(hq) {
  for (const key in hq.screens) {
    const s = hq.screens[key];
    const { ctx, canvas } = s;
    clear(ctx, canvas.width, canvas.height);
    ctx.fillStyle = '#4cc3ff';
    ctx.font = `700 ${Math.round(canvas.height * 0.12)}px ${COND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STANDBY', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    tex(s);
  }
}

export function drawScreens(hq, game) {
  const S = hq.screens;
  const h = game.history;
  const last = h.slice(-150);

  // --- EOC main wall: national epi curve ---
  if (S.eocMain) {
    const { ctx, canvas } = S.eocMain;
    const W = canvas.width, H = canvas.height;
    clear(ctx, W, H);
    header(ctx, W, `NATIONAL SITUATION · ${game.knowledge.sequenced ? game.pathogen.disease.toUpperCase() : 'UNIDENTIFIED PATHOGEN'}`, `DAY ${game.day} · ${game.dateLabel.toUpperCase()}`);
    const cases = last.map(d => d.repCases7);
    const hosp = last.map(d => d.hosp);
    const cap = last.map(d => d.cap);
    const max = Math.max(10, ...cases, ...hosp.map(v => v * 0.25));
    chart(ctx, 24, 70, W * 0.62, H - 100, [
      { data: cases, color: '#4cc3ff', fill: 'rgba(76,195,255,0.18)' },
      { data: hosp.map(v => v * 0.25), color: '#ffb547', width: 2 },
      { data: cap.map(v => v * 0.25), color: 'rgba(255,93,93,0.7)', dash: [8, 6], width: 2 },
    ], { max });
    ctx.font = `500 16px ${MONO}`;
    ctx.fillStyle = '#4cc3ff'; ctx.fillText('— reported cases/day (7d avg)', 34, H - 14);
    ctx.fillStyle = '#ffb547'; ctx.fillText('— hospitalized ÷4', 380, H - 14);
    ctx.fillStyle = '#ff7a7a'; ctx.fillText('- - capacity ÷4', 580, H - 14);
    const x0 = W * 0.68;
    stat(ctx, x0, 90, 'Reported cases', fmtBig(game.totalReportedCases()));
    stat(ctx, x0 + 200, 90, 'Deaths', fmtBig(game.totalReportedDeaths()), '#ff8a8a');
    stat(ctx, x0, 190, 'In hospital', fmtBig(game.hospitalized()), game.hospitalized() > game.totalCapacity() * 0.8 ? '#ffb547' : '#e8f6ff');
    const rt = game.rtEstimate;
    stat(ctx, x0 + 200, 190, 'Rt estimate', rt == null ? '—' : rt.toFixed(2), rt == null ? '#e8f6ff' : rt > 1 ? '#ff8a8a' : '#6fe3a6');
    stat(ctx, x0, 290, 'Vaccinated', (game.vaccineCoverage() * 100).toFixed(1) + '%', '#6fe3a6');
    stat(ctx, x0 + 200, 290, 'Metros affected', String(game.cities.filter(c => c.repCum > 0).length) + '/26');
    tex(S.eocMain);
  }

  // --- EOC left: hospital capacity by metro ---
  if (S.eocLeft) {
    const { ctx, canvas } = S.eocLeft;
    const W = canvas.width, H = canvas.height;
    clear(ctx, W, H);
    header(ctx, W, 'HOSPITAL LOAD', 'TOP 8 METROS', '#ffb547');
    const list = game.cities.map(c => ({ c, l: game.cityHospitalLoad(c.idx) })).sort((a, b) => b.l - a.l).slice(0, 8);
    list.forEach(({ c, l }, i) => {
      const y = 64 + i * 38;
      ctx.font = `600 20px ${COND}`;
      ctx.fillStyle = '#cfe3f2';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.name.toUpperCase().slice(0, 16), 14, y + 12);
      const bx = 220, bw = W - 320;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(bx, y + 2, bw, 20);
      ctx.fillStyle = l > 1 ? '#ff4d4d' : l > 0.8 ? '#ffb547' : '#3ddc97';
      ctx.fillRect(bx, y + 2, bw * Math.min(1, l), 20);
      ctx.font = `600 18px ${MONO}`;
      ctx.fillStyle = '#e8f6ff';
      ctx.fillText(`${Math.round(l * 100)}%`, bx + bw + 12, y + 12);
    });
    tex(S.eocLeft);
  }

  // --- EOC right: vaccine pipeline ---
  if (S.eocRight) drawVaccineBoard(S.eocRight, game, 'VACCINE PIPELINE');
  if (S.vaxWall) drawVaccineBoard(S.vaxWall, game, 'CANDIDATE STATUS');

  // --- Lab sequencer + wall ---
  if (S.sequencer) {
    const { ctx, canvas } = S.sequencer;
    const W = canvas.width, H = canvas.height;
    clear(ctx, W, H, '#03121a', '#020a10');
    const cols = ['#4cc3ff', '#ff6b6b', '#ffd166', '#06d6a0'];
    const busy = game.research.active.length > 0;
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 9; j++) {
        ctx.fillStyle = cols[(i * 7 + j * 3 + game.day * (busy ? 5 : 0)) % 4];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(8 + i * 9.4, 30 + j * 13, 7, 9);
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = `600 18px ${MONO}`;
    ctx.fillStyle = '#9fe6ff';
    ctx.fillText(game.knowledge.sequenced ? `${game.pathogen.short} · GENOME` : busy ? 'SEQUENCING…' : 'IDLE', 8, 18);
    tex(S.sequencer);
  }
  if (S.labWall) {
    const { ctx, canvas } = S.labWall;
    const W = canvas.width, H = canvas.height;
    clear(ctx, W, H);
    header(ctx, W, 'LAB PROJECTS', `${game.research.active.length}/${game.research.slots} TEAMS BUSY`, '#7fe0ff');
    if (!game.research.active.length) {
      ctx.font = `500 22px ${SANS}`;
      ctx.fillStyle = '#8fb6cf';
      ctx.fillText('No active projects. Visit the lab terminal.', 18, 100);
    }
    game.research.active.forEach((r, i) => {
      const y = 70 + i * 54;
      ctx.font = `600 22px ${COND}`;
      ctx.fillStyle = '#e8f6ff';
      ctx.fillText(r.id.toUpperCase(), 18, y + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(18, y + 24, W - 36, 14);
      ctx.fillStyle = '#7fe0ff';
      ctx.fillRect(18, y + 24, (W - 36) * Math.min(1, r.progress / r.days), 14);
    });
    tex(S.labWall);
  }

  // --- Lobby status ---
  if (S.lobby) {
    const { ctx, canvas } = S.lobby;
    const W = canvas.width, H = canvas.height;
    clear(ctx, W, H, '#0b1a2a', '#06101a');
    header(ctx, W, 'OUTBREAK RESPONSE STATUS', `EOC LEVEL ${game.policy.eoc}`);
    stat(ctx, 30, 96, 'Day', String(game.day), '#e8f6ff', 64);
    stat(ctx, 230, 96, 'Reported cases', fmtBig(game.totalReportedCases()), '#4cc3ff', 64);
    stat(ctx, 560, 96, 'Deaths', fmtBig(game.totalReportedDeaths()), '#ff8a8a', 64);
    stat(ctx, 30, 236, 'Vaccinated', (game.vaccineCoverage() * 100).toFixed(1) + '%', '#6fe3a6', 52);
    stat(ctx, 300, 236, 'Vaccine status', topStage(game), '#e8f6ff', 30);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, H - 44, W, 44);
    ctx.font = `500 20px ${SANS}`;
    ctx.fillStyle = '#cfe3f2';
    ctx.fillText(game.dateLabel + ' · Atlanta, GA', 20, H - 20);
    tex(S.lobby);
  }

  // --- News screens ---
  const heads = headlines(game);
  for (const key of ['tv', 'lobbyNews']) {
    if (!S[key]) continue;
    const { ctx, canvas } = S[key];
    const W = canvas.width, H = canvas.height;
    clear(ctx, W, H, '#1a2c4a', '#0d1626');
    // fake broadcast: map silhouette area + lower third
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 8; i++) ctx.fillRect(0, i * (H / 8), W, 1);
    ctx.font = `800 ${Math.round(H * 0.075)}px ${COND}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NNC', 18, 36);
    ctx.fillStyle = '#d62828';
    ctx.fillRect(84, 16, 70, 26);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(H * 0.05)}px ${COND}`;
    ctx.fillText('LIVE', 96, 30);
    ctx.font = `700 ${Math.round(H * 0.09)}px ${COND}`;
    ctx.fillStyle = '#ffffff';
    wrap(ctx, heads[(game.day + key.length) % heads.length].toUpperCase(), 18, H * 0.36, W - 36, H * 0.1);
    ctx.fillStyle = '#d62828';
    ctx.fillRect(0, H - H * 0.16, W, H * 0.16);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(H * 0.06)}px ${SANS}`;
    ctx.fillText(heads[(game.day + 1) % heads.length], 16, H - H * 0.055);
    tex(S[key]);
  }
}

function drawVaccineBoard(panel, game, title) {
  const { ctx, canvas } = panel;
  const W = canvas.width, H = canvas.height;
  clear(ctx, W, H);
  header(ctx, W, title, `${(game.vaccineCoverage() * 100).toFixed(1)}% VACCINATED`, '#6fe3a6');
  const list = game.vaccine.candidates.slice(-4);
  if (!list.length) {
    ctx.font = `500 22px ${SANS}`;
    ctx.fillStyle = '#8fb6cf';
    ctx.fillText(game.knowledge.sequenced ? 'Ready to launch a candidate.' : 'Waiting on genome sequence.', 16, 100);
  }
  const order = ['design', 'preclinical', 'phase1', 'phase2', 'phase3', 'review', 'authorized'];
  list.forEach((c, i) => {
    const y = 62 + i * ((H - 70) / 4);
    ctx.font = `600 22px ${COND}`;
    ctx.fillStyle = c.stage === 'failed' ? '#ff8a8a' : '#e8f6ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${c.name.toUpperCase()}`, 14, y + 12);
    ctx.font = `500 16px ${MONO}`;
    ctx.fillStyle = '#8fb6cf';
    const extra = c.stage === 'phase3' ? ` · ${Math.floor(c.endpoints)}/${ENDPOINTS_NEEDED} endpoints` : c.stage === 'authorized' ? ` · ${fmtBig(c.stock)} doses in stock` : '';
    ctx.fillText(`${STAGE_LABEL[c.stage]}${extra}`, 14, y + 38);
    const si = order.indexOf(c.stage);
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = c.stage === 'failed' ? 'rgba(255,90,90,0.4)' : k < si ? '#6fe3a6' : k === si ? '#ffd23f' : 'rgba(255,255,255,0.1)';
      ctx.fillRect(W - 250 + k * 34, y + 4, 28, 14);
    }
  });
  tex(panel);
}

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  let lines = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
      if (++lines >= 3) return;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
}

export { incidenceCss, PLATFORMS };
