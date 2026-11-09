// parse.test.mjs — Tests der reinen Funktionen aus xcodex-costs.user.js.
//
// Die reinen Funktionen stehen im Userscript zwischen den Markern
// "// #region PURE" und "// #endregion PURE" (keine DOM-/GM-Abhängigkeiten).
// Der Test extrahiert genau diesen Block und prüft ihn direkt — so bleibt eine
// einzige Quelle der Wahrheit (das Userscript selbst).
//
// Aufruf: node test/parse.test.mjs
//
// Die Fixture bildet die echte Antwort von GET /backend-api/wham/usage ab
// (live geprüft am 02.11.2026; Kennungen entfernt).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, '..', 'xcodex-costs.user.js');
const src = fs.readFileSync(scriptPath, 'utf8');

const match = src.match(/\/\/ #region PURE[^\n]*\n([\s\S]*?)\/\/ #endregion PURE/);
if (!match) {
  console.error('FEHLER: PURE-Region im Userscript nicht gefunden.');
  process.exit(2);
}

const PURE = new Function(
  `${match[1]}
   return { clamp, windowInfo, parseUsage, shortLabel, longLabel, fmtDur, fmtReset, fmtDate,
            relTime, severity, badgeParts, parseResetCredits, fmtDay, fmtCredits };`,
)();

// ---------------------------------------------------------------------------
// Fixture: echte Antwortform (02.11.2026)
// ---------------------------------------------------------------------------
const usageFixture = {
  plan_type: 'plus',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 45,
      limit_window_seconds: 18000,
      reset_after_seconds: 14543,
      reset_at: 1793613983,
    },
    secondary_window: {
      used_percent: 78,
      limit_window_seconds: 604800,
      reset_after_seconds: 176680,
      reset_at: 1793776120,
    },
  },
  credits: { has_credits: false, unlimited: false, balance: '0' },
  rate_limit_reset_credits: { available_count: 2, applicable_available_count: 0 },
};

let fails = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    fails++;
    console.log(`  FAIL ${name}\n       erwartet: ${e}\n       bekommen: ${a}`);
  }
}

// ---------------------------------------------------------------------------
console.log('parseUsage');
const d = PURE.parseUsage(usageFixture);
eq(d.plan, 'plus', 'Plan übernommen');
eq(d.primary.left, 55, '5h: 45 % verbraucht → 55 % übrig');
eq(d.secondary.left, 22, 'Woche: 78 % verbraucht → 22 % übrig');
eq(d.limitReached, false, 'Limit nicht erreicht');
eq(d.hasCredits, false, 'keine Credits');
eq(d.resetCredits, 2, 'Reset-Gutscheine gelesen');
eq(d.primary.resetAt, 1793613983 * 1000, 'reset_at Sekunden → Millisekunden');
eq(d.secondary.seconds, 604800, 'Fensterlänge Woche');

eq(PURE.parseUsage(null), null, 'null → null');
eq(PURE.parseUsage({}), null, 'ohne rate_limit → null');
eq(PURE.parseUsage({ rate_limit: {} }).primary, null, 'leeres rate_limit → Fenster null');

const reached = PURE.parseUsage({
  rate_limit: { limit_reached: true, primary_window: { used_percent: 100, limit_window_seconds: 18000 } },
});
eq(reached.limitReached, true, 'limit_reached erkannt');
eq(reached.primary.left, 0, '100 % verbraucht → 0 % übrig');

// ---------------------------------------------------------------------------
console.log('windowInfo — Grenzen');
eq(PURE.windowInfo({ used_percent: 140, limit_window_seconds: 18000 }).left, 0, 'über 100 % wird geklemmt');
eq(PURE.windowInfo({ used_percent: -5, limit_window_seconds: 18000 }).left, 100, 'unter 0 % wird geklemmt');
eq(PURE.windowInfo({ limit_window_seconds: 18000 }), null, 'ohne used_percent → null');
eq(PURE.windowInfo(null), null, 'null → null');

// ---------------------------------------------------------------------------
console.log('Beschriftungen');
eq(PURE.shortLabel(d.primary, '5h'), '5h', 'Kurzlabel 5 h');
eq(PURE.shortLabel(d.secondary, 'Wo.'), 'Wo.', 'Kurzlabel Woche');
eq(PURE.shortLabel(null, '5h'), '5h', 'fehlendes Fenster → Rückfall');
eq(PURE.longLabel(d.primary, 'x'), '5-Stunden-Limit', 'Langlabel 5 h');
eq(PURE.longLabel(d.secondary, 'x'), 'Wöchentliches Limit', 'Langlabel Woche');
eq(PURE.longLabel({ seconds: 86400 }, 'x'), 'Limit je 1 Tage', 'unbekanntes Fenster 1 Tag');

// ---------------------------------------------------------------------------
console.log('Dauer');
eq(PURE.fmtDur(14543), '4 Std., 2 Min.', '14543 s');
eq(PURE.fmtDur(176680), '2 Tg., 1 Std.', '176680 s');
eq(PURE.fmtDur(90), '1 Min.', '90 s');
eq(PURE.fmtDur(30), 'weniger als 1 Min.', '30 s');
eq(PURE.fmtDur(0), 'jetzt', '0 s');
eq(PURE.fmtDur(null), 'jetzt', 'null');

// ---------------------------------------------------------------------------
console.log('Zeitangabe');
const now = Date.parse('2026-11-02T10:00:00Z');
eq(PURE.relTime('2026-11-02T10:00:00Z', now), 'gerade eben', 'jetzt');
eq(PURE.relTime('2026-11-02T09:57:00Z', now), 'vor 3 Min.', '3 Minuten');
eq(PURE.relTime('2026-11-02T08:00:00Z', now), 'vor 2 Std.', '2 Stunden');
eq(PURE.relTime('2026-10-31T10:00:00Z', now), 'vor 2 Tg.', '2 Tage');
eq(PURE.relTime('kaputt', now), 'unbekannt', 'ungültig');

// ---------------------------------------------------------------------------
console.log('Farbe (nur 5-Stunden-Limit)');
eq(PURE.severity(d), 'ok', '55 % im 5h-Fenster → grün, obwohl die Woche bei 22 % liegt');
eq(PURE.severity(PURE.parseUsage({ rate_limit: { primary_window: { used_percent: 80, limit_window_seconds: 18000 } } })), 'ok', '20 % übrig → grün (Grenze)');
eq(PURE.severity(PURE.parseUsage({ rate_limit: { primary_window: { used_percent: 81, limit_window_seconds: 18000 } } })), 'warn', '19 % übrig → gelb');
eq(PURE.severity(PURE.parseUsage({ rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 18000 } } })), 'warn', '5 % übrig → gelb (Grenze)');
eq(PURE.severity(PURE.parseUsage({ rate_limit: { primary_window: { used_percent: 96, limit_window_seconds: 18000 } } })), 'crit', '4 % übrig → rot');
eq(PURE.severity(PURE.parseUsage({ rate_limit: { primary_window: { used_percent: 100, limit_window_seconds: 18000 } } })), 'crit', '0 % übrig → rot');
const nurWoche = PURE.parseUsage({ rate_limit: { secondary_window: { used_percent: 90, limit_window_seconds: 604800 } } });
eq(PURE.severity(nurWoche), 'warn', 'ohne 5h-Fenster zählt die Woche (10 % übrig)');
eq(PURE.severity(reached), 'crit', 'Limit erreicht → crit');
eq(PURE.severity(null), 'none', 'keine Daten → none');

// ---------------------------------------------------------------------------
console.log('Badge-Raster');
const parts = PURE.badgeParts(d);
eq(parts.top.label, '5h', 'Zeile 1: Label');
eq(parts.top.value, '55%', 'Zeile 1: Wert');
eq(/^· .{2} \d{2}:\d{2}$/.test(parts.top.reset), true, 'Zeile 1: Reset ' + parts.top.reset);
eq(parts.bottom.label, 'Wo.', 'Zeile 2: Label');
eq(parts.bottom.value, '22%', 'Zeile 2: Wert');
eq(/^· .{2} \d{2}:\d{2}$/.test(parts.bottom.reset), true, 'Zeile 2: Reset ' + parts.bottom.reset);
const lim = PURE.badgeParts(reached);
eq(lim.status, { text: 'Limit', extra: '' }, 'Limit erreicht → Status statt Ø');
eq(lim.top.value, '0%', 'Limit erreicht → Zahlen bleiben stehen');
eq(lim.credits, null, 'Limit erreicht ohne Gutscheine → kein Gutschein-Objekt');
eq(PURE.badgeParts({ ...reached, resetCredits: 2 }).status.extra, '· 2 Gutscheine', 'Gutscheine im Limit-Fall');
eq(PURE.badgeParts({ ...reached, resetCredits: 1 }).status.extra, '· 1 Gutschein', 'Einzahl bei 1');
eq(PURE.badgeParts(null).top.value, '…', 'ohne Daten');

const bal = PURE.badgeParts({ ...d, hasCredits: true, creditValue: 212.364975 });
eq(bal.balance.text, '212', 'Credits-Zeile: gerundet');
eq(PURE.badgeParts({ ...d, hasCredits: true, creditValue: 12.5 }).balance.text, '12,5', 'Credits: eine Dezimale unter 100');
 eq(PURE.badgeParts({ ...d, hasCredits: true, creditValue: 99.94 }).balance.text, '99,9', 'Credits: 99,94 → 99,9');
eq(PURE.badgeParts({ ...d, hasCredits: true, creditValue: 0.8 }).balance.text, '0,80', 'Credits: zwei Dezimalen unter 1');
eq(PURE.badgeParts({ ...d, hasCredits: false, creditValue: 0 }).balance, null, 'ohne Credits → keine Zeile');
eq(PURE.fmtCredits(0), '', 'fmtCredits 0 → leer');

const cr = PURE.badgeParts(d).credits;
eq(cr.text, 'Gutscheine verfügbar', 'Gutschein-Zeile: ' + cr.text);

eq(PURE.badgeParts({ ...d, resetCredits: 1 }).credits.text, 'Gutschein verfügbar', 'Einzahl bei 1');
eq(PURE.badgeParts({ ...d, resetCredits: 0 }).credits, null, 'ohne Gutscheine → keine Zeile');

 eq(PURE.fmtDay(Date.parse('2026-11-30T19:40:33Z')), '30.11.', 'fmtDay');
 eq(PURE.fmtDay(0), '', 'fmtDay 0 → leer');

const ohneReset = PURE.parseUsage({
  rate_limit: {
    primary_window: { used_percent: 20, limit_window_seconds: 18000 },
    secondary_window: { used_percent: 30, limit_window_seconds: 604800 },
  },
});
eq(PURE.badgeParts(ohneReset), {
  top: { label: '5h', value: '80%', reset: '' },
  bottom: { label: 'Wo.', value: '70%', reset: '' },
  status: null,
  credits: null,
  balance: null
}, 'ohne reset_at → keine Reset-Spalten und kein Ø');

// ---------------------------------------------------------------------------
console.log('Reset-Gutscheine');
const creditsFixture = {
  credits: [
    { id: 'a', status: 'available', expires_at: '2026-11-30T19:40:33.960710Z' },
    { id: 'b', status: 'available', expires_at: '2026-12-01T22:18:12.486290Z' },
    { id: 'c', status: 'redeemed', expires_at: '2026-12-05T00:00:00Z' },
  ],
};
const rc = PURE.parseResetCredits(creditsFixture);
eq(rc.count, 2, 'nur verfügbare zählen');
eq(rc.nextExpiry, Date.parse('2026-11-30T19:40:33.960710Z'), 'frühester Ablauf');
eq(PURE.parseResetCredits({}).count, 0, 'leere Antwort: keine Gutscheine');
eq(PURE.parseResetCredits(null).items.length, 0, 'null: keine Gutscheine');
eq(/^\d{2}\.\d{2}\., \d{2}:\d{2}$/.test(PURE.fmtDate(Date.parse('2026-11-30T19:40:33Z'))), true, 'Format „TT.MM., HH:MM"');
eq(PURE.fmtDate(0), '', '0 → leer');

console.log('Reset-Zeitpunkt');
eq(PURE.fmtReset(0), '', '0 → leer');
eq(PURE.fmtReset(null), '', 'null → leer');
eq(/^.{2} \d{2}:\d{2}$/.test(PURE.fmtReset(1793776120 * 1000)), true, 'Format „Wt HH:MM"');

// ---------------------------------------------------------------------------
console.log('');
if (fails) {
  console.log(`${fails} Test(s) FEHLGESCHLAGEN.`);
  process.exit(1);
}
console.log('Alle Tests grün.');
