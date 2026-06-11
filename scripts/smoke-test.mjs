// Smoke test: actually RUNS the dashboard script (not just a syntax check)
// using fake browser pieces, and confirms it renders without hitting the
// error screen — both with no data and with live-looking data.
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// --- minimal fake browser ---------------------------------------------
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
};
const makeEl = () => ({ _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }, style: {}, value: '' });
const app = makeEl();
const drawerMount = makeEl();
globalThis.document = {
  getElementById: (id) => (id === 'app' ? app : drawerMount),
  createElement: () => ({ style: {}, remove() {}, textContent: '' }),
  body: { appendChild() {} },
};
globalThis.fetch = () => Promise.resolve({
  json: () => Promise.resolve({
    generatedAt: new Date().toISOString(),
    agents: [
      {
        agentName: "Pat O'Neil", // apostrophe on purpose — catches quoting bugs
        qualifiedXfers: 3,
        hourlyXfers:    { '10-12': 1, '12-13': 0, '13-14': 2, '14-15': 0, '15-16': 0, '16-18': 0 },
        hourlyTpvTotal: { '10-12': 5, '12-13': 0, '13-14': 12, '14-15': 0, '15-16': 0, '16-18': 0 },
        tpv: 5.6,
        qaApproved: true,
      },
    ],
  }),
});
globalThis.setInterval = () => {};
globalThis.setTimeout = () => {}; // keep timers dead so the poll loop can't keep the process alive

// --- run the dashboard --------------------------------------------------
(0, eval)(script);

function assertHealthy(label) {
  if (!app._html || !app._html.includes('HOURLY SPIFF')) throw new Error(label + ': dashboard did not render');
  if (app._html.includes('Render error')) throw new Error(label + ': dashboard hit its error screen:\n' + app._html);
  console.log(label + ' OK');
}

assertHealthy('smoke (empty data)');

// Let the fake fetch resolve, then render again with live data in place.
await Promise.resolve();
await Promise.resolve();
globalThis.render();
assertHealthy('smoke (live data incl. apostrophe name)');

console.log('smoke tests OK');
