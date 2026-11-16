// Static world data: metro areas, age structure, contact patterns, US outline.

export const AGE_GROUPS = [
  { id: 'kid', label: 'Children 0–17', short: '0–17' },
  { id: 'adult', label: 'Adults 18–64', short: '18–64' },
  { id: 'elder', label: 'Seniors 65+', short: '65+' },
];

// Average daily contacts a person in row-group has with column-group.
// Shaped after POLYMOD-style surveys; reciprocity holds for ~[0.22, 0.61, 0.17] age shares.
export const CONTACTS = [
  [8.0, 4.5, 0.8],
  [1.6, 9.5, 1.4],
  [1.0, 5.0, 2.8],
];

// The 26 largest US metro regions (~135M people). Populations in millions.
// beds = outbreak-ready hospital beds per 100k residents (staffed + surge).
// hub = air/ground connectivity multiplier.
export const CITY_DATA = [
  { id: 'NYC', name: 'New York', state: 'NY', lon: -74.0, lat: 40.71, pop: 19.5, beds: 38, hub: 1.4, elder: 0.17 },
  { id: 'LAX', name: 'Los Angeles', state: 'CA', lon: -118.24, lat: 34.05, pop: 12.8, beds: 30, hub: 1.3, elder: 0.15 },
  { id: 'CHI', name: 'Chicago', state: 'IL', lon: -87.63, lat: 41.88, pop: 9.3, beds: 36, hub: 1.4, elder: 0.16 },
  { id: 'DFW', name: 'Dallas–Fort Worth', state: 'TX', lon: -96.8, lat: 32.78, pop: 8.1, beds: 31, hub: 1.4, elder: 0.13 },
  { id: 'HOU', name: 'Houston', state: 'TX', lon: -95.37, lat: 29.76, pop: 7.5, beds: 33, hub: 1.2, elder: 0.13 },
  { id: 'ATL', name: 'Atlanta', state: 'GA', lon: -84.39, lat: 33.75, pop: 6.3, beds: 32, hub: 1.6, elder: 0.14 },
  { id: 'WAS', name: 'Washington', state: 'DC', lon: -77.04, lat: 38.9, pop: 6.3, beds: 33, hub: 1.2, elder: 0.15 },
  { id: 'PHL', name: 'Philadelphia', state: 'PA', lon: -75.16, lat: 39.95, pop: 6.2, beds: 40, hub: 1.0, elder: 0.18 },
  { id: 'MIA', name: 'Miami', state: 'FL', lon: -80.19, lat: 25.76, pop: 6.1, beds: 34, hub: 1.2, elder: 0.2 },
  { id: 'PHX', name: 'Phoenix', state: 'AZ', lon: -112.07, lat: 33.45, pop: 5.0, beds: 29, hub: 1.0, elder: 0.18 },
  { id: 'BOS', name: 'Boston', state: 'MA', lon: -71.06, lat: 42.36, pop: 4.9, beds: 42, hub: 1.0, elder: 0.17 },
  { id: 'SFO', name: 'San Francisco Bay', state: 'CA', lon: -122.42, lat: 37.77, pop: 4.6, beds: 31, hub: 1.2, elder: 0.17 },
  { id: 'DET', name: 'Detroit', state: 'MI', lon: -83.05, lat: 42.33, pop: 4.3, beds: 37, hub: 0.9, elder: 0.18 },
  { id: 'SEA', name: 'Seattle', state: 'WA', lon: -122.33, lat: 47.61, pop: 4.0, beds: 28, hub: 1.1, elder: 0.15 },
  { id: 'MSP', name: 'Minneapolis', state: 'MN', lon: -93.27, lat: 44.98, pop: 3.7, beds: 35, hub: 1.0, elder: 0.16 },
  { id: 'SAN', name: 'San Diego', state: 'CA', lon: -117.16, lat: 32.72, pop: 3.3, beds: 29, hub: 0.9, elder: 0.16 },
  { id: 'TPA', name: 'Tampa', state: 'FL', lon: -82.46, lat: 27.95, pop: 3.3, beds: 34, hub: 0.9, elder: 0.22 },
  { id: 'DEN', name: 'Denver', state: 'CO', lon: -104.99, lat: 39.74, pop: 3.0, beds: 30, hub: 1.3, elder: 0.14 },
  { id: 'STL', name: 'St. Louis', state: 'MO', lon: -90.2, lat: 38.63, pop: 2.8, beds: 39, hub: 0.8, elder: 0.18 },
  { id: 'CLT', name: 'Charlotte', state: 'NC', lon: -80.84, lat: 35.23, pop: 2.8, beds: 31, hub: 1.1, elder: 0.15 },
  { id: 'PDX', name: 'Portland', state: 'OR', lon: -122.68, lat: 45.52, pop: 2.5, beds: 27, hub: 0.8, elder: 0.16 },
  { id: 'LAS', name: 'Las Vegas', state: 'NV', lon: -115.14, lat: 36.17, pop: 2.3, beds: 26, hub: 1.0, elder: 0.16 },
  { id: 'MCI', name: 'Kansas City', state: 'MO', lon: -94.58, lat: 39.1, pop: 2.2, beds: 36, hub: 0.8, elder: 0.16 },
  { id: 'BNA', name: 'Nashville', state: 'TN', lon: -86.78, lat: 36.16, pop: 2.1, beds: 37, hub: 0.9, elder: 0.14 },
  { id: 'SLC', name: 'Salt Lake City', state: 'UT', lon: -111.89, lat: 40.76, pop: 1.3, beds: 27, hub: 0.9, elder: 0.11 },
  { id: 'MSY', name: 'New Orleans', state: 'LA', lon: -90.07, lat: 29.95, pop: 1.0, beds: 41, hub: 0.8, elder: 0.17 },
];

export const TOTAL_POP_M = CITY_DATA.reduce((s, c) => s + c.pop, 0);

export function ageShares(city) {
  const elder = city.elder;
  const kid = 0.22 + (0.16 - elder) * 0.4; // younger metros skew slightly toward kids
  return [kid, 1 - kid - elder, elder];
}

export function haversineKm(a, b) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Equirectangular projection centred on the lower 48, in "map units" (~degrees).
export function project(lon, lat) {
  return { x: (lon + 96) * 0.788, y: lat - 37.5 };
}

// Simplified outline of the contiguous United States (lon, lat), clockwise from Cape Flattery.
// Lake Michigan / Huron are traced as an inlet; Superior, Erie and Ontario stay outside.
export const US_OUTLINE = [
  [-124.7, 48.4], [-123.6, 48.15], [-122.75, 48.4], [-122.75, 49.0], [-95.15, 49.0], [-94.7, 48.75],
  [-93.4, 48.6], [-92.0, 48.35], [-90.8, 48.1], [-89.6, 48.0], [-90.5, 47.65], [-91.5, 47.1],
  [-92.1, 46.75], [-91.0, 46.9], [-90.2, 46.6], [-89.0, 46.85], [-88.0, 47.42], [-88.4, 46.95],
  [-87.4, 46.55], [-86.4, 46.45], [-85.0, 46.75], [-84.4, 46.5], [-83.95, 46.05], [-84.7, 45.95],
  [-85.4, 46.08], [-86.3, 45.95], [-87.06, 45.75], [-87.6, 45.1], [-87.7, 43.75], [-87.9, 43.04],
  [-87.6, 41.88], [-87.3, 41.62], [-86.9, 41.72], [-86.45, 42.1], [-86.25, 43.23], [-86.45, 43.95],
  [-86.05, 44.9], [-85.6, 45.2], [-85.0, 45.37], [-84.73, 45.78], [-84.45, 45.65], [-83.8, 45.42],
  [-83.43, 45.06], [-83.33, 44.42], [-83.85, 43.65], [-82.98, 44.05], [-82.42, 42.98], [-83.05, 42.33],
  [-83.45, 41.7], [-82.7, 41.45], [-81.7, 41.5], [-80.8, 41.9], [-80.1, 42.13], [-78.9, 42.88],
  [-79.05, 43.25], [-77.6, 43.25], [-76.5, 43.46], [-76.3, 44.13], [-74.9, 44.99], [-71.5, 45.01],
  [-71.08, 45.3], [-70.25, 45.95], [-70.0, 46.7], [-69.2, 47.45], [-68.3, 47.35], [-67.8, 47.07],
  [-67.8, 45.7], [-67.0, 44.9], [-68.2, 44.3], [-69.8, 43.8], [-70.2, 43.6], [-70.7, 43.0],
  [-70.8, 42.6], [-71.0, 42.3], [-70.5, 41.8], [-70.0, 42.05], [-69.95, 41.7], [-70.6, 41.55],
  [-71.4, 41.45], [-72.9, 41.25], [-73.7, 40.9], [-74.0, 40.6], [-74.0, 40.0], [-74.4, 39.4],
  [-74.95, 38.93], [-75.1, 38.4], [-75.6, 37.5], [-75.95, 36.9], [-75.5, 35.25], [-76.5, 34.7],
  [-77.9, 33.9], [-79.1, 33.4], [-79.9, 32.8], [-80.8, 32.1], [-81.4, 31.0], [-81.5, 30.3],
  [-81.0, 29.2], [-80.6, 28.4], [-80.1, 27.0], [-80.1, 26.0], [-80.4, 25.2], [-81.1, 25.1],
  [-81.8, 26.1], [-82.6, 27.5], [-82.8, 28.2], [-83.4, 29.4], [-84.0, 30.0], [-85.3, 29.7],
  [-86.5, 30.4], [-87.6, 30.3], [-88.1, 30.4], [-89.4, 30.3], [-89.4, 29.2], [-90.1, 29.1],
  [-91.3, 29.3], [-92.3, 29.6], [-93.8, 29.7], [-94.8, 29.3], [-96.4, 28.4], [-97.2, 27.6],
  [-97.4, 26.8], [-97.15, 25.95], [-98.3, 26.1], [-99.1, 26.5], [-99.5, 27.5], [-100.3, 28.3],
  [-101.4, 29.8], [-102.4, 29.8], [-103.1, 29.0], [-104.5, 29.6], [-104.9, 30.6], [-106.5, 31.8],
  [-108.2, 31.8], [-108.2, 31.33], [-111.1, 31.33], [-114.8, 32.5], [-114.7, 32.72], [-117.1, 32.53],
  [-117.3, 33.1], [-118.3, 33.7], [-118.8, 34.0], [-119.7, 34.4], [-120.6, 34.6], [-120.9, 35.4],
  [-121.9, 36.3], [-121.9, 36.6], [-122.4, 37.2], [-122.5, 37.8], [-123.0, 38.0], [-123.7, 38.9],
  [-123.8, 39.8], [-124.4, 40.4], [-124.2, 41.8], [-124.5, 42.8], [-124.1, 44.0], [-123.9, 46.2],
  [-124.1, 47.0],
];

// NPI recommendation levels the CDC can recommend to state & local officials.
export const NPI_LEVELS = [
  { level: 0, name: 'Baseline', short: 'None', desc: 'No special measures. Routine public health guidance.', disruption: 0 },
  { level: 1, name: 'Advisory', short: 'Advisory', desc: 'Stay home when sick, hand hygiene, voluntary distancing.', disruption: 3 },
  { level: 2, name: 'Masks & Limits', short: 'Masks', desc: 'Indoor masking, gathering limits, remote work encouraged.', disruption: 12 },
  { level: 3, name: 'Schools & Venues Closed', short: 'Closures', desc: 'Schools go remote; bars, gyms and venues close.', disruption: 34 },
  { level: 4, name: 'Stay-at-Home', short: 'Stay home', desc: 'Stay-at-home order; essential travel and work only.', disruption: 68 },
];

export const TRAVEL_LEVELS = [
  { level: 0, name: 'Open travel', mobility: 1.0, disruption: 0 },
  { level: 1, name: 'Travel advisory + airport screening', mobility: 0.55, disruption: 5 },
  { level: 2, name: 'Domestic travel restrictions', mobility: 0.22, disruption: 15 },
];

export const DIFFICULTIES = {
  recruit: { id: 'recruit', name: 'Recruit', budget: 2600, trust: 66, leadership: 82, seedMult: 0.6, r0Mult: 0.92, eventRate: 0.05, misinfo: 8 },
  officer: { id: 'officer', name: 'Field Officer', budget: 1700, trust: 60, leadership: 76, seedMult: 1.0, r0Mult: 1.0, eventRate: 0.07, misinfo: 12 },
  director: { id: 'director', name: 'Incident Director', budget: 1100, trust: 52, leadership: 62, seedMult: 1.6, r0Mult: 1.08, eventRate: 0.09, misinfo: 20 },
};

export const START_DATE = Date.UTC(2027, 2, 3); // March 3, 2027

export function dateForDay(day) {
  return new Date(START_DATE + day * 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(day) {
  const d = dateForDay(day);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function dayOfYear(day) {
  const d = dateForDay(day);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86400000);
}
