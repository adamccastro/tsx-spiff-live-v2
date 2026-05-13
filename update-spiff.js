#!/usr/bin/env node
/**
 * Pull the NRM Google Sheet and publish the current spiff data.
 *
 * Local troubleshooting:
 *   npm run update -- --no-push
 *
 * Production publishing:
 *   npm run update:push
 */

import { readFileSync, renameSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_CLI = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const TIME_ZONE = 'America/New_York';

const NRM_SHEET_ID = process.env.NRM_SHEET_ID || '1EONQqcaDV0WhqohShd1YB8alzwnTWEKWGexc-W8Q2MQ';
const KEY_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  '/Users/adamcastro/.openclaw/workspace/.service-account-key.json';
const HTML_PATH = join(__dirname, 'index.html');
const DATA_PATH = join(__dirname, 'data.json');
const SHOULD_PUSH = process.argv.includes('--push') || process.env.SPIFF_PUSH === 'true';

const BLOCKS = [
  { id: '10-12', startH: 10, endH: 12 },
  { id: '12-13', startH: 12, endH: 13 },
  { id: '13-14', startH: 13, endH: 14 },
  { id: '14-15', startH: 14, endH: 15 },
  { id: '15-16', startH: 15, endH: 16 },
  { id: '16-18', startH: 16, endH: 18 },
];

export function parseTpvMinutes(tpvStr) {
  if (!tpvStr) return 0;
  const minMatch = String(tpvStr).match(/(\d+)\s*min/i);
  const secMatch = String(tpvStr).match(/(\d+)\s*s/i);
  const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
  const secs = secMatch ? parseInt(secMatch[1], 10) : 0;
  return Math.round((mins + secs / 60) * 10) / 10;
}

export function getEasternHour(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return -1;
  const etStr = d.toLocaleString('en-US', { timeZone: TIME_ZONE, hour: 'numeric', hour12: false });
  return parseInt(etStr, 10);
}

export function getBlockId(hour) {
  for (const b of BLOCKS) {
    if (hour >= b.startH && hour < b.endH) return b.id;
  }
  return null;
}

function cleanName(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ');
}

async function fetchTodayRows() {
  const { google } = await import('googleapis');
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: NRM_SHEET_ID,
    range: 'A:K',
  });

  const rows = res.data.values || [];
  const today = new Date().toLocaleDateString('en-US', { timeZone: TIME_ZONE });

  return rows.slice(1).filter((row) => {
    const d = new Date(row[0] || '');
    return !isNaN(d) && d.toLocaleDateString('en-US', { timeZone: TIME_ZONE }) === today;
  });
}

export function buildAgentData(rows) {
  // Col indices: 0=Timestamp, 6=Fronter, 7=CallInterference, 10=TPV
  const agents = {};

  for (const row of rows) {
    const name = cleanName(row[6]);
    if (!name) continue;

    const tpvMins = parseTpvMinutes(row[10]);
    if (tpvMins < 4) continue;

    const noInterference = (row[7] || '').toLowerCase().trim() === 'no';
    if (!noInterference) continue;

    const hour = getEasternHour(row[0]);
    const blockId = getBlockId(hour);

    if (!agents[name]) {
      agents[name] = {
        agentName: name,
        qualifiedXfers: 0,
        hourlyXfers: { '10-12': 0, '12-13': 0, '13-14': 0, '14-15': 0, '15-16': 0, '16-18': 0 },
        hourlyTpvTotal: { '10-12': 0, '12-13': 0, '13-14': 0, '14-15': 0, '15-16': 0, '16-18': 0 },
        tpv: 0,
        qaApproved: true,
      };
    }

    agents[name].qualifiedXfers++;
    agents[name]._tpvTotal = Math.round(((agents[name]._tpvTotal || 0) + tpvMins) * 10) / 10;

    if (blockId) {
      agents[name].hourlyXfers[blockId]++;
      agents[name].hourlyTpvTotal[blockId] = Math.round((agents[name].hourlyTpvTotal[blockId] + tpvMins) * 10) / 10;
    }
  }

  for (const a of Object.values(agents)) {
    a.tpv = a.qualifiedXfers > 0 ? Math.round((a._tpvTotal / a.qualifiedXfers) * 10) / 10 : 0;
    delete a._tpvTotal;
  }

  return Object.values(agents).sort((a, b) => {
    if (b.qualifiedXfers !== a.qualifiedXfers) return b.qualifiedXfers - a.qualifiedXfers;
    return (b.tpv || 0) - (a.tpv || 0);
  });
}

function buildPayload(agentData) {
  const generatedAt = new Date();
  return {
    generatedAt: generatedAt.toISOString(),
    generatedAtEastern: generatedAt.toLocaleString('en-US', { timeZone: TIME_ZONE, hour12: false }),
    timezone: TIME_ZONE,
    agentCount: agentData.length,
    agents: agentData,
  };
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tmpPath, filePath);
}

function updateHtml(agentData) {
  const html = readFileSync(HTML_PATH, 'utf8');
  const START = '/* AGENT_DATA_START */';
  const END = '/* AGENT_DATA_END */';
  const si = html.indexOf(START);
  const ei = html.indexOf(END);
  if (si === -1 || ei === -1) throw new Error('AGENT_DATA replacement failed: sentinel markers not found');
  const newBlock = `${START}\nlet AGENT_DATA = ${JSON.stringify(agentData, null, 2)};\n${END}`;
  const updated = html.slice(0, si) + newBlock + html.slice(ei + END.length);
  writeFileSync(HTML_PATH, updated);
  return agentData.length;
}

function gitPush(agentCount) {
  const now = new Date().toLocaleString('en-US', { timeZone: TIME_ZONE, hour12: false });
  execSync('git add index.html data.json', { cwd: __dirname });

  const staged = execSync('git diff --cached --name-only', { cwd: __dirname, encoding: 'utf8' }).trim();
  if (!staged) {
    console.log(`[${now}] No changes: skipping push`);
    return false;
  }

  execSync(`git commit -m "data: ${agentCount} agents, updated ${now}"`, { cwd: __dirname });
  execSync('git push origin main', { cwd: __dirname });
  console.log(`[${now}] Pushed: ${agentCount} agents`);
  return true;
}

async function main() {
  try {
    const rows = await fetchTodayRows();
    const agentData = buildAgentData(rows);
    writeJsonAtomic(DATA_PATH, buildPayload(agentData));
    const count = updateHtml(agentData);

    if (SHOULD_PUSH) {
      gitPush(count);
    } else {
      console.log(`Updated local data for ${count} agents. Use --push or SPIFF_PUSH=true to publish.`);
    }
  } catch (err) {
    console.error('update-spiff error:', err.message);
    process.exit(1);
  }
}

if (IS_CLI) main();
