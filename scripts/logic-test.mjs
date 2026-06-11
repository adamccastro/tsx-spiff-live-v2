import assert from 'assert/strict';
import { buildAgentData, getBlockId, getEasternHour, parseTpvMinutes, parseTpvSeconds } from '../update-spiff.js';

assert.equal(parseTpvMinutes('4 min 30 s'), 4.5);
assert.equal(parseTpvMinutes(''), 0);

// Qualification threshold uses RAW seconds — rounding must not let short calls in.
assert.equal(parseTpvSeconds('3 min 59 s'), 239); // under 4 min -> must NOT qualify
assert.equal(parseTpvSeconds('4 min'), 240);      // exactly 4 min -> qualifies
assert.equal(parseTpvSeconds('1 hr 2 min 5 s'), 3725);
assert.equal(parseTpvSeconds(''), 0);

// Over-an-hour calls must count, in every format the dialer might use.
assert.equal(parseTpvSeconds('1hr 3m'), 3780);
assert.equal(parseTpvSeconds('5m 34s'), 334);
assert.equal(parseTpvSeconds('1:03:20'), 3800);  // clock-style h:mm:ss
assert.equal(parseTpvSeconds('01:03:20'), 3800);
assert.equal(parseTpvSeconds('5:34'), 334);      // clock-style m:ss
assert.equal(parseTpvSeconds('1:03'), 63);

// Plural and long-word formats (flagged in review — verified working, now locked in).
assert.equal(parseTpvSeconds('4 mins 30 s'), 270);
assert.equal(parseTpvSeconds('4 mins 30 secs'), 270);
assert.equal(parseTpvSeconds('2 hrs 4 mins'), 7440);
assert.equal(parseTpvSeconds('4 minutes 30 seconds'), 270);

assert.equal(getBlockId(10), '10-12');
assert.equal(getBlockId(17), '16-18');
assert.equal(getBlockId(18), null);

const rows = [
  ['2026-05-13T14:05:00.000Z', '', '', '', '', '', 'Alex A.', 'no', '', '', '4 min 30 s'],
  ['2026-05-13T14:35:00.000Z', '', '', '', '', '', 'Alex A.', 'yes', '', '', '9 min 00 s'],
  ['2026-05-13T16:10:00.000Z', '', '', '', '', '', 'Blair B.', 'no', '', '', '3 min 30 s'],
  ['2026-05-13T16:15:00.000Z', '', '', '', '', '', 'Blair B.', 'no', '', '', '5 min 00 s'],
  ['2026-05-13T16:20:00.000Z', '', '', '', '', '', 'Blair B.', 'no', '', '', '3 min 59 s'], // just under 4 min: must not count
  ['2026-05-13T16:25:00.000Z', '', '', '', '', '', 'Blair B.', 'no', '', '', '1:03:20'],    // over an hour, clock format: MUST count
];

assert.equal(getEasternHour('2026-05-13T14:05:00.000Z'), 10);

const agents = buildAgentData(rows);
assert.equal(agents.length, 2);
assert.equal(agents[0].agentName, 'Blair B.');
assert.equal(agents[0].qualifiedXfers, 2); // the 5-min call + the 1:03:20 call
assert.equal(agents[0].hourlyXfers['12-13'], 2);
assert.equal(agents[1].agentName, 'Alex A.');
assert.equal(agents[1].qualifiedXfers, 1);
assert.equal(agents[1].hourlyXfers['10-12'], 1);
assert.equal(agents[1].qaApproved, true);

console.log('logic tests OK');
