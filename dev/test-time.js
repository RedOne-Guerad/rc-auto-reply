#!/usr/bin/env node
/**
 * Unit tests for the pure time helpers (parseWhen / wall-clock conversion /
 * window bounds / formatting) — no server needed.
 *
 * Usage: npm run test:time   (compiles helpers with dev/tsconfig.test.json,
 * then runs this file against the emitted .testout)
 */
const assert = require('assert');
const path = require('path');

const h = require(path.join(__dirname, '..', '.testout', 'src', 'utils', 'helpers.js'));

// ---- parseWhen -------------------------------------------------------------

// fixed "now": Thursday 2026-10-08 15:30 UTC
const NOW = Date.UTC(2026, 9, 8, 15, 30);
const TZ = 120; // UTC+2

function local(dayOffset, hh, mm) {
    const d = new Date(NOW + TZ * 60000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (dayOffset || 0), hh, mm) - TZ * 60000;
}

assert.strictEqual(h.parseWhen('2026-10-12', TZ, NOW), Date.UTC(2026, 9, 12, 0, 0) - TZ * 60000, 'ISO date, midnight local');
assert.strictEqual(h.parseWhen('2026-10-12 17:00', TZ, NOW), Date.UTC(2026, 9, 12, 17, 0) - TZ * 60000, 'ISO date + time');

assert.strictEqual(h.parseWhen('18:00', TZ, NOW), local(0, 18, 0), 'bare time later today');
assert.strictEqual(h.parseWhen('14:00', TZ, NOW), local(1, 14, 0), 'bare time already passed -> tomorrow');

assert.strictEqual(h.parseWhen('tomorrow', TZ, NOW), local(1, 0, 0), 'tomorrow midnight');
assert.strictEqual(h.parseWhen('tomorrow 09:00', TZ, NOW), local(1, 9, 0), 'tomorrow at 9');
assert.strictEqual(h.parseWhen('today 20:00', TZ, NOW), local(0, 20, 0), 'today later');

// "thursday" said on a Thursday (with no time) means NEXT week
assert.strictEqual(h.parseWhen('thursday', TZ, NOW), local(7, 0, 0), 'same weekday, no time -> next week');
assert.strictEqual(h.parseWhen('friday', TZ, NOW), local(1, 0, 0), 'next weekday');
assert.strictEqual(h.parseWhen('monday', TZ, NOW), local(4, 0, 0), 'monday from thursday');
assert.strictEqual(h.parseWhen('friday 10:00', TZ, NOW), local(1, 10, 0), 'weekday with time');

assert.strictEqual(h.parseWhen('nonsense', TZ, NOW), null, 'unparseable -> null');
assert.strictEqual(h.parseWhen('18:00 bin', TZ, NOW), null, 'time followed by a word is not a time');
assert.strictEqual(h.parseWhen('tomorrow 09:00 bin', TZ, NOW), null, 'day + time followed by a word is not a time');
assert.strictEqual(h.parseWhen('', TZ, NOW), null, 'empty -> null');
assert.strictEqual(h.parseWhen('2026-13-40', TZ, NOW), null, 'invalid date -> null');

// half-hour timezone (+5:30)
const TZ55 = 330;
assert.strictEqual(h.parseWhen('2026-10-12 09:00', TZ55, NOW), Date.UTC(2026, 9, 12, 9, 0) - TZ55 * 60000, 'half-hour tz');

// ---- wall clock round-trip ---------------------------------------------------

const wall = '2026-10-12T17:45';
const epoch = h.wallToEpoch(wall, TZ);
assert.strictEqual(h.epochToWall(epoch, TZ), wall, 'wall <-> epoch round-trip');
assert.strictEqual(new Date(epoch).toISOString(), '2026-10-12T15:45:00.000Z', 'wall in UTC+2 -> UTC');

// ---- windowBounds: DST-proof reinterpretation --------------------------------

const window = { start: 0, end: h.wallToEpoch('2026-10-12T17:00', TZ), endWall: '2026-10-12T17:00' };
// same offset -> stored epoch
assert.strictEqual(h.windowBounds(window, TZ).end, window.end, 'same tz -> stored epoch');
// DST ended (offset dropped to +1) -> end re-interpreted as 17:00 in the new tz
const afterDst = h.windowBounds(window, 60).end;
assert.strictEqual(new Date(afterDst).toISOString(), '2026-10-12T16:00:00.000Z', 'window follows wall clock across DST');
// no wall fields -> epochs used as-is
assert.deepStrictEqual(h.windowBounds({ start: 1, end: 2 }, 60), { start: 1, end: 2 }, 'no walls -> epochs');

// ---- shouldAutoReply: a planned window is its own enable period ------------

const S = Date.UTC(2026, 9, 12, 8, 0);
const planned = { mode: 'until', message: 'm', frequency: 'once', enabledAt: S, until: { start: S, end: S + 8 * 3600000 } };
assert.strictEqual(h.shouldAutoReply(planned, { lastReplyAt: S - 86400000 }, 0, S + 60000), true, 'once: first reply in a planned window');
assert.strictEqual(h.shouldAutoReply(planned, { lastReplyAt: S + 60000 }, 0, S + 120000), false, 'once: no second reply in the window');
const plannedCooldown = { ...planned, frequency: 'cooldown', cooldownHours: 24 };
assert.strictEqual(h.shouldAutoReply(plannedCooldown, { lastReplyAt: S - 3600000 }, 0, S + 60000), true, 'cooldown restarts with a planned window');

// ---- migration from 2.1 --------------------------------------------------------

function readerWith(record) {
    return { getPersistenceReader: () => ({ readByAssociation: async () => (record ? [record] : []) }) };
}

// ---- formatting ---------------------------------------------------------------

assert.strictEqual(h.formatInTz(Date.UTC(2026, 9, 12, 15, 0), 120), 'Mon 12 Oct, 17:00', 'formatInTz with offset');
assert.strictEqual(h.formatOffsetMinutes(330), 'UTC+05:30', 'half-hour offset label');
assert.strictEqual(h.formatDurationUntil(Date.now() + 2 * 86400000 + 3 * 3600000), '2d 3h', 'duration days+hours');
assert.strictEqual(h.formatDurationUntil(Date.now() + 5 * 60000), '5m', 'duration minutes');

(async () => {
    assert.strictEqual((await h.getAutoReplySettings('u', readerWith({ on: true }))).mode, 'always', '2.1 on without schedulers stays on');
    assert.strictEqual((await h.getAutoReplySettings('u', readerWith({ on: true, schedulers: [{ id: 's' }] }))).mode, 'off', '2.1 on set by a scheduler starts off');
    assert.strictEqual((await h.getAutoReplySettings('u', readerWith({ on: false, schedulers: [{ id: 's' }] }))).mode, 'off', '2.1 off with schedulers stays off');
    assert.strictEqual((await h.getAutoReplySettings('u', readerWith({ mode: 'always', schedulers: [{ id: 's' }] }))).mode, 'always', '2.2 mode wins over leftover schedulers');
    console.log('All time-helper unit tests passed.');
})().catch((e) => { console.error(e); process.exit(1); });
