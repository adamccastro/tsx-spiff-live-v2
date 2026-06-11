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
// Safety net: if a sheet timestamp has no timezone info, Node parses it in the
// machine's local zone. Pinning TZ means this script behaves identically on the
// Mac mini, a cloud server, or anyone's laptop.
process.env.TZ = TIME_ZONE;

const NRM_SHEET_ID = process.env.NRM_SHEET_ID || '1EONQqcaDV0WhqohShd1YB8alzwnTWEKWGexc-W8Q2MQ';
const KEY_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  '/Users/adamcastro/.openclaw/workspace/.service-account-key.json';
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

export function parseTpvSeconds(tpvStr) {
  if (!tpvStr) return 0;
  const s = String(tpvStr).trim();

  // Clock-style formats (Readymode switches to these on longer calls):
  //   "1:03:20" = 1 hr 3 min 20 sec     "5:34" = 5 min 34 sec
  const hms = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (hms) return (+hms[1]) * 3600 + (+hms[2]) * 60 + (+hms[3]);
  const ms = s.match(/^(\d+):(\d{1,2})$/);
  if (ms) return (+ms[1]) * 60 + (+ms[2]);

  // Word-style formats: "5m 34s", "1hr 3m", "4 min 30 s", "1 hour 3 min 20 sec"
  const hrMatch  = s.match(/(\d+)\s*h(?:r|our)?s?/i);
  const minMatch = s.match(/(\d+)\s*m(?:in)?(?!\s*s)/i);
  const secMatch = s.match(/(\d+)\s*s(?:ec)?/i);
  const hrs  = hrMatch  ? parseInt(hrMatch[1],  10) : 0;
  const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
  const secs = secMatch ? parseInt(secMatch[1], 10) : 0;
  return hrs * 3600 + mins * 60 + secs;
}

export function parseTpvMinutes(tpvStr) {
  // Rounded to 1 decimal — for DISPLAY ONLY. Never use this for the
  // qualification threshold (3 min 55 s would round up to 4.0).
  return Math.round((parseTpvSeconds(tpvStr) / 60) * 10) / 10;
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
  const unreadable = new Set();

  for (const row of rows) {
    const name = cleanName(row[6]);
    if (!name) continue;

    // Qualification: must be a true 4+ minutes (240 seconds), unrounded.
    const rawTpv = String(row[10] || '').trim();
    const tpvSecs = parseTpvSeconds(rawTpv);
    if (tpvSecs === 0 && rawTpv !== '') unreadable.add(rawTpv);
    if (tpvSecs < 240) continue;
    const tpvMins = parseTpvMinutes(row[10]);

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

  if (unreadable.size > 0) {
    console.warn(
      '⚠️  WARNING: skipped rows with TPV durations I could not read.\n' +
      '   If any of these look like real calls, the parser needs a new format added:\n' +
      '   ' + [...unreadable].join('  |  ')
    );
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

function gitPush(agentCount) {
  const now = new Date().toLocaleString('en-US', { timeZone: TIME_ZONE, hour12: false });
  execSync('git add data.json', { cwd: __dirname });

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
    const count = agentData.length;

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
