// Stampback core: pure rules for desks, pieces, stamps and replies.
import { randomBytes } from 'node:crypto';

export const WINDOWS = [3, 7, 14, 30];
export const REPLIES = {
  'got-it': 'Got it',
  'read': 'Opened and read',
  'handling': "I'll take care of it",
  'returning': 'Sending it back',
};
export const MAX_SHEET = 8;
const DAY = 864e5;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function token(n = 12) {
  const b = randomBytes(n);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

export function validNickname(name) {
  const s = String(name ?? '').trim();
  if (!s) return 'Give the piece a nickname.';
  if (s.length > 60) return 'Keep the nickname under 60 characters.';
  if (/@[^\s]+\.[a-z]{2,}/i.test(s)) return 'Use a private nickname, not an email address.';
  if (/\b\d{1,6}\s+[a-z0-9.' ]+\s(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|way|ct|court)\b/i.test(s)) return 'Use a private nickname, not a street address.';
  return null;
}

export function newPiece(name, days, now = Date.now()) {
  const err = validNickname(name);
  if (err) throw new Error(err);
  if (!WINDOWS.includes(Number(days))) throw new Error(`Wait window must be one of ${WINDOWS.join(', ')} days.`);
  return { id: token(8), stamp: token(10), name: String(name).trim(), days: Number(days), created: now, due: now + Number(days) * DAY, replies: [], scans: 0 };
}

export function addReply(piece, kind, now = Date.now(), note = '') {
  if (!REPLIES[kind]) throw new Error('Unknown reply.');
  const late = now > piece.due;
  piece.replies.push({ kind, at: now, late, note: String(note || '').slice(0, 280) });
  return piece;
}

/** waiting | replied | not-received | late-reply */
export function statusOf(piece, now = Date.now()) {
  const last = piece.replies[piece.replies.length - 1];
  if (last) return last.late ? 'late-reply' : 'replied';
  return now > piece.due ? 'not-received' : 'waiting';
}

export function describe(piece, now = Date.now()) {
  const s = statusOf(piece, now);
  const last = piece.replies[piece.replies.length - 1];
  const left = Math.ceil((piece.due - now) / DAY);
  const label = {
    waiting: `Waiting · ${left} day${left === 1 ? '' : 's'} left`,
    replied: last && `${REPLIES[last.kind]}`,
    'late-reply': last && `${REPLIES[last.kind]} (late)`,
    'not-received': 'Not received: no scan before the deadline',
  }[s];
  return { status: s, label, daysLeft: left };
}

export function summary(pieces, now = Date.now()) {
  const c = { waiting: 0, replied: 0, 'not-received': 0, 'late-reply': 0 };
  for (const p of pieces) c[statusOf(p, now)]++;
  return c;
}
