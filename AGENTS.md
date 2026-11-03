# AGENTS.md — xCodex Costs

Projekt: Userscript, das auf **chatgpt.com** das 5-Stunden- und das Wochenlimit anzeigt.
Vorbild/Referenz für Aufbau und Ton: `F:\001_Coding_Projekte\xDSH_Costs`.

## Harte Regeln

- **Nur lesen, nie schreiben.** Es werden ausschließlich `GET /api/auth/session` und
  `GET /backend-api/wham/usage` aufgerufen. Keine Modellaufrufe, keine Prompts, kein
  Verbrauch von Kontingent.
- **Keine Secrets im Skript.** Der `accessToken` wird zur Laufzeit aus der Sitzung geholt
  und nie gespeichert, geloggt oder an Dritte geschickt.
- **Eine Quelle der Wahrheit.** Parser-Logik steht zwischen `// #region PURE` und
  `// #endregion PURE`; `test/parse.test.mjs` extrahiert genau diesen Block. Keine
  Kopien der Logik in Tests oder Tools.
- **Semantik der Zahl:** angezeigt wird **„übrig"** (`100 − used_percent`), so wie es die
  ChatGPT-Seite tut. Nicht auf „verbraucht" umstellen, ohne die Beschriftung zu ändern.

## Fallstricke (schon einmal teuer erkauft)

1. **Tampermonkey-Negativliste blockiert die ganze Seite.** Steht `chatgpt.com` in
   Einstellungen → Sicherheit → Negativliste, startet dort **kein** Userscript — ohne
   Fehlermeldung. Symptom im Popup: „Teilweise durch Einstellungen eingeschränkt" und
   „Kein Userscript gestartet". Gegenprobe: ein Mini-Skript mit `console.log` importieren.
2. **Änderungen an der Negativliste per JS werden zurückgeschrieben.** Textfeld-Wert per
   `value =` setzen und `change` feuern reicht nicht — Tampermonkey hält die Konfiguration
   im Speicher und schreibt beim Neustart die alte Liste zurück. Nur eine echte Eingabe
   (Playwright `fill` auf dem Feld) überlebt.
3. **`/backend-api/wham/usage` verlangt den Bearer-Header.** Nur Cookies → HTTP 401
   (`{"detail": ...}`). Der Token kommt aus `/api/auth/session` (`accessToken`).
4. **Der Test-Browser ist nicht der Nutzer-Browser.** Der MCP-Browser nutzt
   `Chrome for Testing\User Data`, der Nutzer seinen normalen Chrome. Installationen und
   Einstellungen sind getrennt — nie vom einen auf das andere schließen.
5. **MCP-Upload nur aus dem Arbeitsverzeichnis.** `browser_file_upload` akzeptiert nur
   Pfade unter `...\DSH_Update_Start_Dateien\`; Datei vorher dorthin kopieren.
6. **`setInputFiles` mit derselben Datei zweimal** löst keinen zweiten Import aus — vorher
   `setInputFiles([])` (leeren), sonst bleibt der Bestätigungs-Tab aus.

## Veröffentlichung

| Feld | Wert |
|---|---|
| Greasy Fork | <https://greasyfork.org/de/scripts/603426-xcodex-costs> |
| Skript-ID | **603426** |
| Locale | `de` (für immer festgelegt) |
| Stand | v1.0.22, veröffentlicht 2026-11-02 |

Kein Auto-Sync: Das Projekt hat kein Git-Repo, GF zieht den Code also nicht selbst.
Neue Version = manueller Upload über `https://greasyfork.org/de/script_versions/new`
(Code-Datei + `description.md` als Markdown, DE → RU → EN in einem Feld).

## Prüfen vor „fertig"

```bash
node test/parse.test.mjs
```

Danach live: Badge auf chatgpt.com vorhanden, zweizeilig `⚡ 5h NN%` / `Wo. NN% · Wt HH:MM`,
keine Überlappung mit dem Composer, Tooltip vollständig, Screenshot in `out/`.
