// Age-structured metapopulation epidemic model.
//
// Each metro area has 3 age groups and these compartments:
//   S   susceptible (unvaccinated)
//   Sv  vaccinated but not protected (breakthrough possible, milder)
//   V   protected by vaccine
//   Em/Es exposed (latent), on a mild or severe course
//   Im/Is infectious, mild/asymptomatic or heading to hospital
//   H   hospitalized
//   R   recovered (immune)
//   D   dead
// Cities are coupled through a gravity-model travel matrix. Small flows are drawn
// from a Poisson distribution, so sparks can fizzle out or take off as they do in real outbreaks.

import { CONTACTS, ageShares, haversineKm } from './data.js';
import { spectralRadius } from './disease.js';

export const A = 3;
export const COMPARTMENTS = ['S', 'Sv', 'V', 'Em', 'Es', 'Im', 'Is', 'H', 'R', 'D'];
const SUBSTEPS = 2;
const BREAKTHROUGH_SEVERITY = 0.3;
const OVERFLOW_DEATH_MULT = 2.1;
const ASYMP_INFECTIOUSNESS = 0.55;

export function buildCoupling(cities) {
  const n = cities.length;
  const m = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    let total = 0;
    const w = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = Math.max(150, haversineKm(cities[i], cities[j]));
      w[j] = Math.pow(cities[j].pop, 0.85) * cities[j].hub / Math.pow(d, 1.05);
      total += w[j];
    }
    const outbound = 0.0065 * cities[i].hub; // share of a resident's contacts made with other metros
    for (let j = 0; j < n; j++) m[i * n + j] = i === j ? 0 : (outbound * w[j]) / total;
  }
  return m;
}

export class Epidemic {
  constructor({ cities, pathogen, rng, stochastic = true }) {
    this.cities = cities;
    this.n = cities.length;
    this.p = pathogen;
    this.rng = rng;
    this.stochastic = stochastic;
    const size = this.n * A;
    for (const k of COMPARTMENTS) this[k] = new Float64Array(size);
    this.N = new Float64Array(size);
    for (let c = 0; c < this.n; c++) {
      const shares = ageShares(cities[c]);
      for (let a = 0; a < A; a++) {
        const v = cities[c].pop * 1e6 * shares[a];
        this.N[c * A + a] = v;
        this.S[c * A + a] = v;
      }
    }
    this.coupling = buildCoupling(cities);
    // Per-day trackers (reset each day)
    this.daily = {
      inf: new Float64Array(size),
      symOnset: new Float64Array(size),
      asymOnset: new Float64Array(size),
      hosp: new Float64Array(size),
      deaths: new Float64Array(size),
    };
    this.cum = { inf: new Float64Array(size), deaths: new Float64Array(size), hosp: new Float64Array(size) };
    this.lastRt = new Float64Array(this.n);
    this.overflow = new Float64Array(this.n);
  }

  draw(x) {
    if (x <= 0) return 0;
    if (!this.stochastic || x >= 12) return x;
    return this.rng.poisson(x);
  }

  // Introduce infections into a city (default: mostly working-age adults, as with travel-linked spread).
  seed(c, count, stage = 'E', ageDist = [0.1, 0.72, 0.18]) {
    for (let a = 0; a < A; a++) {
      const i = c * A + a;
      const n = Math.min(count * ageDist[a], this.S[i]);
      if (n <= 0) continue;
      this.S[i] -= n;
      const sev = n * this.p.hosp[a];
      if (stage === 'E') { this.Es[i] += sev; this.Em[i] += n - sev; }
      else if (stage === 'I') { this.Is[i] += sev; this.Im[i] += n - sev; }
      else if (stage === 'H') { this.H[i] += n; }
      this.cum.inf[i] += n;
    }
  }

  // ctx: { transMult[c], contactMult[c] (9 numbers), mobility, seasonal, variantMult,
  //        severityMult, hfrMult, capacity[c] }
  step(ctx) {
    const { n } = this;
    const p = this.p;
    const size = n * A;
    for (const k in this.daily) this.daily[k].fill(0);
    const dt = 1 / SUBSTEPS;
    const pE = 1 - Math.exp(-dt / p.latent);
    const pI = 1 - Math.exp(-dt / p.infectious);
    const pS = 1 - Math.exp(-dt / p.severeInfectious);
    const pH = 1 - Math.exp(-dt / p.hospStay);
    const infRelM = (1 - p.asymp) + p.asymp * ASYMP_INFECTIOUSNESS;
    const beta = p.beta * ctx.seasonal * ctx.variantMult;
    const prev = new Float64Array(size);
    const prevEff = new Float64Array(size);
    const mob = ctx.mobility;

    for (let s = 0; s < SUBSTEPS; s++) {
      // 1. Local prevalence (infectiousness-weighted)
      for (let i = 0; i < size; i++) {
        const alive = this.N[i] - this.D[i];
        prev[i] = alive > 0 ? (infRelM * this.Im[i] + this.Is[i]) / alive : 0;
      }
      // 2. Travel-coupled prevalence
      for (let c = 0; c < n; c++) {
        let out = 0;
        for (let j = 0; j < n; j++) out += this.coupling[c * n + j];
        out *= mob;
        for (let b = 0; b < A; b++) {
          let mix = 0;
          for (let j = 0; j < n; j++) {
            const m = this.coupling[c * n + j];
            if (m > 0) mix += m * prev[j * A + b];
          }
          prevEff[c * A + b] = (1 - out) * prev[c * A + b] + mob * mix;
        }
      }
      // 3. Hospital overflow per city
      for (let c = 0; c < n; c++) {
        let h = 0;
        for (let a = 0; a < A; a++) h += this.H[c * A + a];
        const cap = ctx.capacity[c];
        this.overflow[c] = h > cap && h > 0 ? (h - cap) / h : 0;
      }
      // 4. Transitions
      for (let c = 0; c < n; c++) {
        const cm = ctx.contactMult[c];
        const tm = ctx.transMult[c];
        const ofMult = 1 + (OVERFLOW_DEATH_MULT - 1) * this.overflow[c];
        for (let a = 0; a < A; a++) {
          const i = c * A + a;
          let foi = 0;
          for (let b = 0; b < A; b++) foi += CONTACTS[a][b] * cm[a * 3 + b] * prevEff[c * A + b];
          foi *= beta * tm;
          const pInf = 1 - Math.exp(-foi * dt);
          const h = Math.min(0.95, p.hosp[a] * ctx.severityMult);

          const infS = Math.min(this.S[i], this.draw(this.S[i] * pInf));
          const infSv = Math.min(this.Sv[i], this.draw(this.Sv[i] * pInf));
          const sev = infS * h + infSv * h * BREAKTHROUGH_SEVERITY;
          const newInf = infS + infSv;

          const eToIm = Math.min(this.Em[i], this.draw(this.Em[i] * pE));
          const eToIs = Math.min(this.Es[i], this.draw(this.Es[i] * pE));
          const imToR = Math.min(this.Im[i], this.draw(this.Im[i] * pI));
          const isToH = Math.min(this.Is[i], this.draw(this.Is[i] * pS));
          const hOut = Math.min(this.H[i], this.draw(this.H[i] * pH));
          const cfr = Math.min(0.97, p.hfr[a] * ctx.hfrMult * ofMult);
          const deaths = Math.min(hOut, this.draw(hOut * cfr));

          this.S[i] -= infS;
          this.Sv[i] -= infSv;
          this.Es[i] += sev;
          this.Em[i] += newInf - sev;
          this.Em[i] -= eToIm; this.Im[i] += eToIm;
          this.Es[i] -= eToIs; this.Is[i] += eToIs;
          this.Im[i] -= imToR; this.R[i] += imToR;
          this.Is[i] -= isToH; this.H[i] += isToH;
          this.H[i] -= hOut; this.D[i] += deaths; this.R[i] += hOut - deaths;

          this.daily.inf[i] += newInf;
          this.daily.symOnset[i] += eToIm * (1 - p.asymp);
          this.daily.asymOnset[i] += eToIm * p.asymp;
          this.daily.hosp[i] += isToH;
          this.daily.deaths[i] += deaths;
          this.cum.inf[i] += newInf;
          this.cum.deaths[i] += deaths;
          this.cum.hosp[i] += isToH;
        }
      }
    }
    // Clean up numerical dust so outbreaks can truly end ("less than half a person" is nobody).
    const dust = this.stochastic ? 0.5 : 1e-3;
    for (let i = 0; i < size; i++) {
      for (const k of ['Em', 'Es', 'Im', 'Is', 'H']) {
        if (this[k][i] > 0 && this[k][i] < dust) { this.R[i] += this[k][i]; this[k][i] = 0; }
      }
    }
    this.computeRt(ctx);
  }

  computeRt(ctx) {
    const p = this.p;
    const beta = p.beta * ctx.seasonal * ctx.variantMult;
    const D = [0, 1, 2].map(a => {
      const h = Math.min(0.95, p.hosp[a] * ctx.severityMult);
      const infRelM = (1 - p.asymp) + p.asymp * ASYMP_INFECTIOUSNESS;
      return (1 - h) * infRelM * p.infectious + h * p.severeInfectious;
    });
    for (let c = 0; c < this.n; c++) {
      const cm = ctx.contactMult[c];
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let a = 0; a < A; a++) {
        const i = c * A + a;
        const alive = this.N[i] - this.D[i];
        const sus = alive > 0 ? (this.S[i] + this.Sv[i]) / alive : 0;
        for (let b = 0; b < A; b++) {
          // infections in a caused by one infectious person in b
          M[a][b] = beta * ctx.transMult[c] * D[b] * CONTACTS[b][a] * cm[b * 3 + a] * sus;
        }
      }
      this.lastRt[c] = spectralRadius(M);
    }
  }

  // ---- aggregate helpers ----
  cityTotal(key, c) {
    const arr = this[key];
    return arr[c * A] + arr[c * A + 1] + arr[c * A + 2];
  }
  cityActive(c) {
    let s = 0;
    for (let a = 0; a < A; a++) {
      const i = c * A + a;
      s += this.Em[i] + this.Es[i] + this.Im[i] + this.Is[i] + this.H[i];
    }
    return s;
  }
  cityPop(c) { return this.N[c * A] + this.N[c * A + 1] + this.N[c * A + 2]; }
  total(key) { let s = 0; for (const v of this[key]) s += v; return s; }
  totalDaily(key) { let s = 0; for (const v of this.daily[key]) s += v; return s; }
  totalActive() { let s = 0; for (let c = 0; c < this.n; c++) s += this.cityActive(c); return s; }
  totalCum(key) { let s = 0; for (const v of this.cum[key]) s += v; return s; }
  cityDaily(key, c) { const d = this.daily[key]; return d[c * A] + d[c * A + 1] + d[c * A + 2]; }
  cityCum(key, c) { const d = this.cum[key]; return d[c * A] + d[c * A + 1] + d[c * A + 2]; }

  nationalRt() {
    let w = 0, s = 0;
    for (let c = 0; c < this.n; c++) {
      const weight = this.cityActive(c) + 1e-6 * this.cityPop(c);
      w += weight;
      s += weight * this.lastRt[c];
    }
    return w > 0 ? s / w : 0;
  }

  // Move people from S into vaccinated states (called when immunity matures).
  applyVaccination(c, a, protectedN, nonResponders) {
    const i = c * A + a;
    const pr = Math.min(protectedN, this.S[i]);
    this.S[i] -= pr; this.V[i] += pr;
    const nr = Math.min(nonResponders, this.S[i]);
    this.S[i] -= nr; this.Sv[i] += nr;
  }

  // Immune escape: a share of vaccine-protected people become susceptible to breakthrough.
  escape(fraction) {
    for (let i = 0; i < this.V.length; i++) {
      const m = this.V[i] * fraction;
      this.V[i] -= m; this.Sv[i] += m;
    }
  }
}
