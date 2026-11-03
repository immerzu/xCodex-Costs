# ChatGPT-Planlimits — Endpunkte und Belege (2026-11-02)

Live gegen das echte Konto im Chrome-for-Testing-Profil ermittelt (Plan `plus`).

## Kette

```
GET https://chatgpt.com/api/auth/session
    → 200, JSON mit accessToken (JWT), account, user, expires

GET https://chatgpt.com/backend-api/wham/usage
    Authorization: Bearer <accessToken>
    → 200, JSON mit rate_limit.primary_window / .secondary_window
```

Ohne `Authorization` antwortet `wham/usage` mit **HTTP 401**; die Session-Cookies allein
authentifizieren nicht (live geprüft, Antwort nur `{"detail": ...}`).

## Antwortform (gekürzt, Kennungen entfernt)

```json
{
  "plan_type": "plus",
  "rate_limit": {
    "allowed": true,
    "limit_reached": false,
    "primary_window":   { "used_percent": 45, "limit_window_seconds": 18000,  "reset_after_seconds": 14543, "reset_at": 1793613983 },
    "secondary_window": { "used_percent": 78, "limit_window_seconds": 604800, "reset_after_seconds": 176680, "reset_at": 1793776120 }
  },
  "credits": { "has_credits": false, "balance": "0" },
  "rate_limit_reset_credits": { "available_count": 2, "applicable_available_count": 0 }
}
```

- `primary_window` = 5-Stunden-Limit (18000 s), `secondary_window` = Wochenlimit (604800 s).
- `reset_at` sind **Unix-Sekunden** (×1000 für `Date`).
- Angezeigt wird `100 − used_percent` („übrig"), passend zur Seite: 45 → „55 % übrig",
  78 → „22 % übrig". Gegenprobe auf der Seite: 55 % und 22 %.

## Weitere Aufrufe der Seite (nicht benötigt)

`plan_limit_history`, `credit-usage-events`, `daily-token-usage-breakdown`,
`rate-limit-reset-credits`, `daily-workspace-usage-counts` — nur für Diagramme und
Historie. Für das Badge reichen die zwei Aufrufe oben.

## Warum das Badge zuerst nicht erschien

`chatgpt.com` stand in Tampermonkeys **Negativliste**, deshalb startete dort **kein**
Userscript (Popup: „Teilweise durch Einstellungen eingeschränkt", „Kein Userscript
gestartet"). Ein Mini-Skript mit einer `console.log`-Zeile bewies: es liegt nicht am Code.
Nach Entfernen der Regel lief das Badge sofort.

Nebenbefund: Wird die Negativliste per JS manipuliert (`value =` + `change`), schreibt
Tampermonkey beim Neustart die alte Fassung zurück; nur eine echte Eingabe bleibt.
