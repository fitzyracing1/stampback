import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPiece, addReply, statusOf, describe, summary, validNickname, WINDOWS } from '../lib/core.js';

const DAY = 864e5, T0 = Date.parse('2026-10-01T12:00:00Z');

test('nicknames must not be addresses or emails', () => {
  assert.equal(validNickname("Mom's birthday card"), null);
  assert.match(validNickname('bob@example.com'), /email/);
  assert.match(validNickname('221 Baker Street'), /street address/);
  assert.match(validNickname('  '), /nickname/);
});

test('wait windows are 3, 7, 14 or 30 days', () => {
  assert.deepEqual(WINDOWS, [3, 7, 14, 30]);
  assert.throws(() => newPiece('card', 5, T0), /Wait window/);
  const p = newPiece('card', 7, T0);
  assert.equal(p.due, T0 + 7 * DAY);
  assert.match(p.stamp, /^[a-z2-9]{10}$/);
});

test('status: waiting → replied, or not received after the deadline, late reply still allowed', () => {
  const p = newPiece('rent check', 3, T0);
  assert.equal(statusOf(p, T0 + DAY), 'waiting');
  assert.equal(describe(p, T0 + DAY).label, 'Waiting · 2 days left');
  assert.equal(statusOf(p, T0 + 4 * DAY), 'not-received');
  addReply(p, 'got-it', T0 + 5 * DAY);
  assert.equal(statusOf(p, T0 + 5 * DAY), 'late-reply');
  const q = newPiece('card', 7, T0);
  addReply(q, 'read', T0 + DAY, 'thanks');
  assert.equal(statusOf(q, T0 + 30 * DAY), 'replied');
  assert.equal(describe(q).label, 'Opened and read');
  assert.throws(() => addReply(q, 'nope'), /Unknown reply/);
  assert.deepEqual(summary([p, q, newPiece('x', 30, T0)], T0 + 5 * DAY), { waiting: 1, replied: 1, 'not-received': 0, 'late-reply': 1 });
});
