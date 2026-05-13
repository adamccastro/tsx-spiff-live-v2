import assert from 'assert/strict';
import { buildAgentData, getBlockId, getEasternHour, parseTpvMinutes } from '../update-spiff.js';

assert.equal(parseTpvMinutes('4 min 30 s'), 4.5);
assert.equal(parseTpvMinutes('3 min 59 s'), 4);
assert.equal(parseTpvMinutes(''), 0);

assert.equal(getBlockId(10), '10-12');
assert.equal(getBlockId(17), '16-18');
assert.equal(getBlockId(18), null);

const rows = [
  ['2026-05-13T14:05:00.000Z', '', '', '', '', '', 'Alex A.', 'no', '', '', '4 min 30 s'],
  ['2026-05-13T14:35:00.000Z', '', '', '', '', '', 'Alex A.', 'yes', '', '', '9 min 00 s'],
  ['2026-05-13T16:10:00.000Z', '', '', '', '', '', 'Blair B.', 'no', '', '', '3 min 30 s'],
  ['2026-05-13T16:15:00.000Z', '', '', '', '', '', 'Blair B.', 'no', '', '', '5 min 00 s'],
];

assert.equal(getEasternHour('2026-05-13T14:05:00.000Z'), 10);

const agents = buildAgentData(rows);
assert.equal(agents.length, 2);
assert.equal(agents[0].agentName, 'Blair B.');
assert.equal(agents[0].qualifiedXfers, 1);
assert.equal(agents[0].hourlyXfers['12-13'], 1);
assert.equal(agents[1].agentName, 'Alex A.');
assert.equal(agents[1].qualifiedXfers, 1);
assert.equal(agents[1].hourlyXfers['10-12'], 1);
assert.equal(agents[1].qaApproved, true);

console.log('logic tests OK');
