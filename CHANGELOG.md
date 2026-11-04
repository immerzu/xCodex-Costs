# CHANGELOG

## 1.0.27 — 2026-11-04

- **Ø-Zeile erneut korrigiert** — zurück zu `übrig ÷ Resttage` (Deckel bei `übrig`).
  1.0.24 hatte die bereits vergangenen Stunden des Kalendertags abgezogen; das bestrafte
  Nutzer, die den Tag noch nicht angefangen hatten: Bei frisch zurückgesetztem Wochenlimit
  (100 %, 7 Tage) stand dort 9 % statt 14 %. „Heute" ist jetzt **die nächsten 24 Stunden ab
  jetzt**, unabhängig von der Uhrzeit.

## 1.0.26 — 2026-11-03

- Tooltip zeigt den **Ablauf der Reset-Gutscheine**: „2 verfügbar (nächster Ablauf 30.11., 20:40)".
  Quelle: `GET /backend-api/wham/rate-limit-reset-credits` (`credits[].expires_at`),
  wird nur abgerufen, wenn `available_count > 0`.
- Neue PURE-Funktionen `parseResetCredits` und `fmtDate`, plus 6 Tests.

## 1.0.25 — 2026-11-03

- **Limit-Fall neu dargestellt.** Vorher ersetzte „Limit erreicht" die Zahlen und lief über
  die Wert-/Reset-Spalten — das Raster brach. Jetzt bleiben beide Limit-Zeilen mit ihren
  Zahlen stehen (`5h 100%` / `Wo. 0%`), die dritte Zeile zeigt `⊘ Limit · N Gutscheine`.
  So sieht man, welches Fenster leer ist, und die verfügbaren Reset-Gutscheine.
- `rate_limit_reached_type` hilft nicht (`details: "default"`); welches Fenster blockiert,
  ergibt sich aus dem Fenster mit 0 % übrig.

## 1.0.24 — 2026-11-02

- **Korrektur der Ø-Zeile:** 1.0.23 rechnete `übrig ÷ Resttage` und nannte das „heute" —
  das ist aber das Budget für einen **vollen** Tag. Jetzt zählt nur die Restzeit bis
  Mitternacht (bzw. bis zum Reset): `Tagesrate × Reststunden/24`.
  Beispiel: 17 % übrig, 1,7 Tage Rest → 10 %/Tag, heute (8,8 h) → **4 %** statt 10 %.

## 1.0.23 — 2026-11-02

- Dritte Zeile **`Ø 11%`**: wie viel des Wochenkontingents heute noch drin ist
  (`übrig ÷ Resttage`, Deckel bei `übrig`). Wird bei jeder Aktualisierung neu gerechnet.
- Der Name im Metablock ist jetzt `xCodex Costs` (ohne Klammerzusatz) — Tampermonkey
  behandelt das als **neues Skript**, der alte Eintrag `xCodex Costs (ChatGPT)` wurde entfernt.

## 1.0.22 — 2026-11-02 — Erstveröffentlichung auf Greasy Fork

- Veröffentlicht als **xCodex Costs**, GF-ID **603426**, Locale `de`
  (<https://greasyfork.org/de/scripts/603426-xcodex-costs>).
- Beschreibung DE/RU/EN, Zusatzinfos als Markdown; Secret-Prüfung ohne Treffer.
- Inhaltlich: Klick-Bugfix (`USAGE_URL` → `USAGE_PAGE`), Nutzungsseite öffnet in neuem Tab.

- **Bugfix Klick:** `CFG.USAGE_URL` existierte nicht (richtig: `USAGE_PAGE`) — der Klick
  navigierte mit `undefined` und landete bei `/c/undefined`. Jetzt öffnet ein echter
  Link-Klick die Nutzungsseite **in einem neuen Tab**.
- Zwischenschritte 1.0.20 (`window.open` mit `noopener`, öffnete leeren Tab) und
  1.0.21 (Link-Klick, aber noch falsche Konstante) sind damit überholt.

## 1.0.19 — 2026-11-02

- Auch die obere Zeile zeigt den Wochentag vor der Uhrzeit (`· Mo 11:06`), gleiches Format
  wie unten. `fmtShortTime` entfällt dadurch.

## 1.0.18 — 2026-11-02

- Vierspaltiges Raster (Symbol | Label | Wert | Reset): Labels, Prozentwerte und
  Reset-Zeiten stehen zeilenweise exakt untereinander (gemessen: alle drei Spalten
  paarweise auf gleicher x-Position).

## 1.0.17 — 2026-11-02

- Obere Zeile zeigt zusätzlich die Uhrzeit des 5-h-Resets: `⚡ 5h 53% · 11:06`.
  Über Mitternacht mit Wochentag (`Do 01:30`).

## 1.0.16 — 2026-11-02

- Rücknahme von 1.0.14/1.0.15: wieder zwei linksbündige Textzeilen mit Symbol davor
  (`⚡ 5h 54%` / `● Wo. 22% · Mi 08:08`) — diese Ausrichtung war die bessere.

## 1.0.15 — 2026-11-02

- Labels rechtsbündig: „5h" und „Wo." enden an derselben Kante, keine Lücke vor dem Wert.
  Die Prozentwerte stehen exakt übereinander (gemessen: beide x = 1812,9).

## 1.0.14 — 2026-11-02

- Drei Spalten (Symbol | Label | Wert) statt einer Textzeile: Prozentwerte beginnen
  an derselben Kante.

## 1.0.13 — 2026-11-02

- Aktualisierung jede **Minute** statt alle 5 (Fokus-Refresh frühestens nach 15 s).
  Grund: Die ChatGPT-Nutzungsseite selbst aktualisiert gar nicht (nur beim Öffnen).

## 1.0.12 — 2026-11-02

- Symbole je Zeile: ⚡ vor dem 5-h-Limit, das farbige Lämpchen vor der Woche.
- Beide Textzeilen linksbündig auf einer Kante.

## 1.0.11 — 2026-11-02

- Zwischenfassung: Raster mit Label-/Wertspalten (verworfen, weil die Zeilen nicht
  linksbündig standen).

## 1.0.10 — 2026-11-02

- Der Blitz trägt jetzt dieselbe Statusfarbe wie der Punkt (`font-variant-emoji: text`,
  damit das Zeichen der CSS-Farbe folgt statt als gelbes Emoji zu rendern).

## 1.0.9 — 2026-11-02

- Farbe richtet sich **nur nach dem 5-Stunden-Limit** (nicht nach dem knappsten der beiden):
  grün ab 20 % übrig, gelb 5–19 %, rot unter 5 %.

## 1.0.8 — 2026-11-02

- Schwellen auf 20 / 5 % gesetzt.

## 1.0.7 — 2026-11-02

- Schwellen zwischenzeitlich auf 80 / 5 % (verworfen).

## 1.0.6 — 2026-11-02

- Statuspunkt vertikal zentriert, zweite Zeile eingerückt — linke Kante ruhiger.

## 1.0.5 — 2026-11-02

- Badge **zweizeilig** und schmal: `⚡ 5h 55%` / `Wo. 22% · Mi 08:08` (146 × 40 px
  statt 247 × 30 px) — passt neben bzw. über das Eingabefeld.

## 1.0.4 — 2026-11-02

- Kollisionsschutz: Überlappt das Badge den Composer, rutscht es über dessen Oberkante.
- Composer-Erkennung auf `form [contenteditable="true"]` umgestellt
  (`#prompt-textarea` existiert im aktuellen ChatGPT nicht mehr).

## 1.0.3 — 2026-11-02

- Badge zeigt den **Reset-Zeitpunkt des Wochenlimits** an: `⚡ 5h 55% · Wo. 22% → Mi 08:08`
  (Variante „fester Zeitpunkt", kein Ticker).

## 1.0.2 — 2026-11-02

- Debug-Ausgaben entfernt (`DEBUG: false`), Fassung für den Alltag.

## 1.0.1 — 2026-11-02

- Diagnosefassung: Start- und Boot-Log, `DEBUG: true` — nur zur Fehlersuche.

## 1.0.0 — 2026-11-02

- Erstfassung: Badge auf `chatgpt.com` mit 5-Stunden-Limit und wöchentlichem Limit.
- Datenquelle: `/api/auth/session` → `accessToken`, dann `/backend-api/wham/usage`.
- Farbstufen, Tooltip, Ziehen, Klick auf die Nutzungsseite, 5-Minuten-Refresh.
- `test/parse.test.mjs` mit 30 Prüfungen gegen die echte Antwortform.
