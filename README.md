# xCodex Costs

Userscript für **Tampermonkey**: zeigt im ChatGPT-Web (chatgpt.com) ein schwebendes Badge
mit beiden Planlimits — **5-Stunden-Limit** und **wöchentliches Limit** — plus einem
Tagesbudget für heute.

![Badge](docs/badge.png)

| Zeile | Symbol | Bedeutung |
|---|---|---|
| 1 | ⚡ | 5-Stunden-Limit: Rest in % · Zeitpunkt der Rücksetzung |
| 2 | ● | Wöchentliches Limit: Rest in % · Zeitpunkt der Rücksetzung |
| 3 | Ø | wie viel des Wochenkontingents **heute noch** drin ist |

Ist das Limit erreicht, bleiben die Zahlen stehen und Zeile 3 zeigt den Status:

![Limit erreicht](docs/badge-limit.png)

- **`Ø`** = Tagesrate aus `übrig ÷ Resttage`, davon nur die Restzeit bis Mitternacht
  (bzw. bis zum Reset, falls der früher liegt). Sinkt mit dem Verbrauch, steigt, wenn der
  Reset näher rückt.
- Farbe der Symbole nach dem **5-Stunden-Limit**: **grün ab 20 %**, **gelb 5–19 %**, **rot unter 5 %**.
- Raster: Labels, Prozentwerte und Zeiten stehen zeilenweise exakt untereinander.
- `· Mo 11:06` / `· Mi 08:08` = Rücksetz-Zeitpunkte (Format `Wt HH:MM`).
- **Limit erreicht:** `⊘ Limit · N Gutscheine` — man sieht, welches Fenster leer ist und ob
  Reset-Gutscheine bereitliegen.
- Bricht das Badge mit dem Eingabefeld an, rutscht es automatisch darüber.
- Tooltip (Maus darüber) zeigt beide Limits mit Verbrauch, Restzeit, Reset-Zeitpunkt,
  Plan, Credits und den Ablauf der Reset-Gutscheine.

## Wie es funktioniert

Ein Skript, eine Rolle — es läuft nur auf `chatgpt.com` und liest zwei Endpunkte, die die
Nutzungsseite selbst aufruft:

```
GET /api/auth/session        → accessToken (NextAuth-Sitzung)
GET /backend-api/wham/usage  → rate_limit.primary_window   (5 h,   18000 s)
                               rate_limit.secondary_window (7 Tage, 604800 s)
```

`Authorization: Bearer <accessToken>` ist Pflicht — ohne Header antwortet der Endpunkt mit
HTTP 401 (live geprüft am 02.11.2026). Beide Aufrufe sind same-origin, die normalen
Browser-Cookies gehen mit.

**Kein API-Key, keine Modellaufrufe — das kostet keine Tokens.** Es sind dieselben
Leseaufrufe, die „Einstellungen → Nutzung" beim Öffnen macht. Es gibt keinen Server, kein
Tracking; der Token wird nur im Speicher gehalten und nie geschrieben oder geloggt.

## Aktualisierung

| Wann | Wie oft |
|---|---|
| im Hintergrund/Vordergrund | jede **Minute** |
| Tab bekommt Fokus | sofort, aber frühestens **15 s** nach dem letzten Versuch |
| ohne frischen Wert | nach **30 Minuten** markiert ⏳ den letzten Stand |

Die Intervalle stehen als Konstanten oben im Skript (`CFG.REFRESH_MS`, `CFG.MIN_REFRESH_MS`,
`CFG.STALE_MS`). Der Reset-Zeitpunkt ist statisch — es läuft kein Sekundenticker.

Zum Vergleich: Die ChatGPT-Nutzungsseite selbst lädt die Werte **nur beim Öffnen** und
aktualisiert danach nicht mehr (gemessen am 02.11.2026: 139 s beobachtet, kein weiterer
Abruf, auch nicht nach Tab-Wechsel).

## Badge-Zustände

| Anzeige | Bedeutung |
|---|---|
| 🟢 `⚡ 5h 55% / Wo. 22% · Mi 08:08` | Werte frisch (jünger als 30 Min) |
| 🟡 `… ⏳` | letzter bekannter Stand; Aktualisierung schlug fehl (Grund im Tooltip) |
| 🔴 `⊘ Limit · 2 Gutscheine` | `limit_reached` — die Zahlen bleiben sichtbar, Status in Zeile 3 |
| 🔴 `⚡ Login nötig` | keine gültige ChatGPT-Sitzung |
| ⚪ `⚡ lädt …` | vor dem ersten Abruf |

Bedienung: **Klick** öffnet `chatgpt.com/settings/usage?tab=overview` in einem neuen Tab,
**Ziehen** verschiebt das Badge (Position wird gemerkt), **Tooltip** zeigt die Details.

## Installation

**Am einfachsten über Greasy Fork:**
<https://greasyfork.org/de/scripts/603426-xcodex-costs> → „Installieren" (Tampermonkey
zeigt den üblichen Bestätigungsdialog).

Aus dem Repo:

1. Tampermonkey im Browser.
2. `xcodex-costs.user.js` importieren (Tampermonkey → Hilfsmittel → „Aus Datei importieren").
3. `chatgpt.com` öffnen — das Badge erscheint unten rechts.

**Wichtig — Tampermonkey-Sperrliste:** Steht `chatgpt.com` in der Negativliste
(Einstellungen → Sicherheit → „Filtere Seiten nach"), startet **kein** Userscript auf der
Seite und das Badge bleibt unsichtbar. Der Eintrag muss raus (oder der Filter auf
„Deaktiviert").

## Test

```bash
node test/parse.test.mjs      # Parser-, Format- und Farbregeln (reine Funktionen)
```

Die reinen Funktionen stehen im Skript zwischen `// #region PURE` und `// #endregion PURE`;
der Test extrahiert genau diesen Block — eine Quelle der Wahrheit.

## Bekannte Grenzen

- `/backend-api/wham/usage` ist ein **interner** Endpunkt, nicht dokumentiert. Ändert er sich,
  zeigt das Badge einen Fehlerzustand statt Zahlen.
- Die Anzeige hängt an der angemeldeten Browser-Sitzung. Nach Abmelden: „Login nötig".
- Bei anderen Plänen können Fensterlängen abweichen; die Beschriftung richtet sich nach
  `limit_window_seconds` (18000 → 5 h, 604800 → Woche).

## Dateien

| Datei | Zweck |
|---|---|
| `xcodex-costs.user.js` | **Das Skript** (Quelle) |
| `test/parse.test.mjs` | Tests der reinen Funktionen gegen die echte Antwortform |
| `memory/` | Projektgedächtnis (Endpunkt-Analyse, Belege) |
| `out/` | Screenshots der Prüfläufe |
| `description.md` | Kurzbeschreibung DE/EN/RU (für eine spätere Veröffentlichung) |

MIT-Lizenz.
