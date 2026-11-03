// ==UserScript==
// @name         xCodex Costs
// @namespace    https://github.com/immerzu
// @version      1.0.26
// @description  Zeigt das 5-Stunden-Limit und das wöchentliche Limit des ChatGPT-Kontos als schwebendes Badge auf chatgpt.com. Kein API-Key, keine Modellaufrufe — liest nur die Werte, die die eigene Nutzungsseite selbst abruft.
// @description:en  Shows the 5-hour limit and the weekly limit of the ChatGPT account as a floating badge on chatgpt.com. No API key and no model calls — it only reads the values your own usage page fetches.
// @description:ru  Показывает 5-часовой лимит и недельный лимит аккаунта ChatGPT в виде плавающего бейджа на chatgpt.com. Без API-ключа и вызовов моделей — читает только значения, которые запрашивает ваша страница использования.
// @author       immerzu
// @match        https://chatgpt.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @license      MIT
// ==/UserScript==

/*
 * xCodex Costs
 * ------------
 * Ein Badge unten rechts auf chatgpt.com: wie viel vom 5-Stunden-Limit und vom
 * wöchentlichen Limit noch übrig ist, samt Zeitpunkt der Rücksetzung.
 *
 *   ⚡ 5h 53% · Mo 11:06
 *   ●  Wo. 22% · Mi 08:08
 *
 * Datenquelle (beides same-origin, also mit den normalen Browser-Cookies):
 *   GET /api/auth/session            → accessToken (NextAuth-Sitzung)
 *   GET /backend-api/wham/usage      → rate_limit.primary_window   (5 h, 18000 s)
 *                                      rate_limit.secondary_window (7 Tage, 604800 s)
 *   Authorization: Bearer <accessToken> ist Pflicht — ohne Header antwortet der
 *   Endpunkt mit HTTP 401 (live geprüft am 02.11.2026).
 *
 * Kein API-Key, keine Modellaufrufe: es sind dieselben Leseaufrufe, die die
 * Seite „Einstellungen → Nutzung" selbst macht — sie kosten keine Tokens.
 * Es werden keine Tokens gespeichert, geloggt oder übertragen (kein Server).
 */

(function () {
    'use strict';

    // =====================================================================
    // Konfiguration
    // =====================================================================
    const CFG = {
        USAGE_PAGE: 'https://chatgpt.com/settings/usage?tab=overview',
        SESSION_URL: '/api/auth/session',
        USAGE_API: '/backend-api/wham/usage',
        CREDITS_API: '/backend-api/wham/rate-limit-reset-credits',
        REFRESH_MS: 60 * 1000,            // regelmäßige Aktualisierung (jede Minute)
        MIN_REFRESH_MS: 15 * 1000,        // Mindestabstand bei Fokus/Start
        STALE_MS: 30 * 60 * 1000,         // ab wann ein Wert als „alt" gilt
        TIMEOUT_MS: 15000,
        DEBUG: false,
        KEY: {
            snapshot: 'xcodex.snapshot',
            pos: 'xcodex.pos'
        }
    };

    const log = (...a) => { if (CFG.DEBUG) console.log('[xCodex Costs]', ...a); };

    function scriptVersion() {
        try {
            const info = (typeof GM_info !== 'undefined' && GM_info) ? GM_info.script : null;
            return info && info.version ? String(info.version) : '';
        } catch (e) {
            return '';
        }
    }

    // =====================================================================
    // #region PURE — reine Funktionen (ohne DOM/GM), testbar in Node
    // =====================================================================

    function clamp(n, lo, hi) {
        return Math.min(hi, Math.max(lo, n));
    }

    /** Ein Zeitfenster aus der Antwort in eine flache, anzeigbare Form bringen. */
    function windowInfo(w) {
        if (!w || typeof w !== 'object') return null;
        const used = Number(w.used_percent);
        if (!Number.isFinite(used)) return null;
        const seconds = Number(w.limit_window_seconds);
        const resetAt = Number(w.reset_at);
        return {
            used: clamp(used, 0, 100),
            left: clamp(100 - used, 0, 100),
            seconds: Number.isFinite(seconds) ? seconds : 0,
            resetIn: Number.isFinite(Number(w.reset_after_seconds)) ? Number(w.reset_after_seconds) : null,
            resetAt: Number.isFinite(resetAt) && resetAt > 0 ? resetAt * 1000 : null
        };
    }

    /**
     * Antwort von /backend-api/wham/usage auswerten.
     * Liefert null, wenn der Kern (rate_limit) fehlt — dann ist die Antwort
     * unbrauchbar und das Badge zeigt einen Fehlerzustand statt Zahlen.
     */
    function parseUsage(json) {
        if (!json || typeof json !== 'object') return null;
        const rl = json.rate_limit;
        if (!rl || typeof rl !== 'object') return null;
        const credits = json.credits && typeof json.credits === 'object' ? json.credits : null;
        const resets = json.rate_limit_reset_credits && typeof json.rate_limit_reset_credits === 'object'
            ? json.rate_limit_reset_credits : null;
        return {
            plan: typeof json.plan_type === 'string' ? json.plan_type : '',
            primary: windowInfo(rl.primary_window),
            secondary: windowInfo(rl.secondary_window),
            limitReached: !!rl.limit_reached,
            hasCredits: !!(credits && credits.has_credits),
            creditBalance: credits && typeof credits.balance === 'string' ? credits.balance : null,
            resetCredits: resets && Number.isFinite(Number(resets.available_count))
                ? Number(resets.available_count) : null
        };
    }

    /** Beschriftung des kurzen Fensters (5 h) für Badge und Tooltip. */
    function shortLabel(w, fallback) {
        if (!w || !w.seconds) return fallback;
        if (w.seconds === 18000) return '5h';
        if (w.seconds === 604800) return 'Wo.';
        const h = Math.round(w.seconds / 3600);
        return h >= 24 ? Math.round(h / 24) + 'T' : h + 'h';
    }

    /** Vollständiger Name eines Fensters für den Tooltip. */
    function longLabel(w, fallback) {
        if (!w || !w.seconds) return fallback;
        if (w.seconds === 18000) return '5-Stunden-Limit';
        if (w.seconds === 604800) return 'Wöchentliches Limit';
        const h = Math.round(w.seconds / 3600);
        return h >= 24 ? 'Limit je ' + Math.round(h / 24) + ' Tage' : 'Limit je ' + h + ' Stunden';
    }

    /** „4 Std., 3 Min." — grobe, gut lesbare Dauer. */
    function fmtDur(sec) {
        const s = Number(sec);
        if (!Number.isFinite(s) || s <= 0) return 'jetzt';
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        if (d > 0) return d + ' Tg., ' + h + ' Std.';
        if (h > 0) return h + ' Std., ' + m + ' Min.';
        if (m > 0) return m + ' Min.';
        return 'weniger als 1 Min.';
    }

    /** „vor 3 Min." für den Tooltip. */
    function relTime(iso, now) {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return 'unbekannt';
        const s = Math.max(0, Math.round(((now || Date.now()) - t) / 1000));
        if (s < 60) return 'gerade eben';
        const m = Math.floor(s / 60);
        if (m < 60) return 'vor ' + m + ' Min.';
        const h = Math.floor(m / 60);
        if (h < 24) return 'vor ' + h + ' Std.';
        return 'vor ' + Math.floor(h / 24) + ' Tg.';
    }

    /**
     * Farbe des Punkts — richtet sich ausschließlich nach dem 5-Stunden-Limit:
     * grün ab 20 % übrig, gelb 5–19 %, rot unter 5 %.
     * Fehlt das kurze Fenster, zählt ersatzweise das Wochenfenster.
     */
    function severity(data) {
        if (!data) return 'none';
        if (data.limitReached) return 'crit';
        const w = data.primary || data.secondary;
        if (!w) return 'none';
        if (w.left >= 20) return 'ok';
        if (w.left >= 5) return 'warn';
        return 'crit';
    }

    /** „Mi 08:08" — kurzer Reset-Zeitpunkt aus einem Millisekunden-Stempel. */
    function fmtReset(ms) {
        const t = Number(ms);
        if (!Number.isFinite(t) || t <= 0) return '';
        try {
            const d = new Date(t);
            const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace(/\.$/, '');
            const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return wd + ' ' + hm;
        } catch (e) {
            return '';
        }
    }

    /**
     * „Pace" des Wochenfensters: wie viel Prozent des Wochenkontingents **heute noch**
     * drin sind, wenn der Rest gleichmäßig über die verbleibende Zeit verteilt wird.
     *
     *   Tagesrate  = übrig / Resttage (bis reset_at)
     *   heute      = Tagesrate × (Rest des heutigen Kalendertags / 24 h)
     *
     * Der heutige Tag zählt also nur mit seinen verbleibenden Stunden — um 8 Uhr ist
     * die Zahl größer als um 22 Uhr. Liegt der Reset vor Mitternacht, endet „heute"
     * dort. Ohne Wochendaten oder nach dem Reset: null bzw. 0.
     */
    function paceLeft(data, now) {
        const w = data && data.secondary;
        if (!w || !w.resetAt) return null;
        const t = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        if (!(w.resetAt > t)) return 0;
        const restTage = (w.resetAt - t) / 86400000;
        const ratePerDay = w.left / restTage;

        const midnight = new Date(t);
        midnight.setHours(24, 0, 0, 0);
        const bisMitternacht = Math.min(midnight.getTime(), w.resetAt) - t;
        const heute = ratePerDay * (Math.max(0, bisMitternacht) / 86400000);

        return Math.max(0, Math.min(w.left, heute));
    }

    /**
     * Antwort von /backend-api/wham/rate-limit-reset-credits auswerten.
     * Liefert die Anzahl verfügbarer Gutscheine und den frühesten Ablauf.
     */
    function parseResetCredits(json) {
        const list = json && Array.isArray(json.credits) ? json.credits : [];
        const verfuegbar = list.filter((c) => c && c.status === 'available');
        const zeiten = verfuegbar
            .map((c) => Date.parse(c.expires_at))
            .filter((t) => Number.isFinite(t));
        return {
            count: verfuegbar.length,
            nextExpiry: zeiten.length ? Math.min.apply(null, zeiten) : null
        };
    }

    /** „30.11., 20:40" — Datum + Uhrzeit für Fristen. */
    function fmtDate(ms) {
        const t = Number(ms);
        if (!Number.isFinite(t) || t <= 0) return '';
        try {
            const d = new Date(t);
            const day = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return day + ', ' + hm;
        } catch (e) {
            return '';
        }
    }

    /**
     * Inhalt des Badges in vier Spalten: Symbol | Label | Wert | Reset.
     * Dadurch stehen Labels, Prozentwerte und Reset-Zeiten zeilenweise untereinander.
     *
     * Im Limit-Fall bleiben die Zahlen stehen (so sieht man, welches Fenster leer ist);
     * die dritte Zeile trägt dann den Status statt des Ø-Werts.
     */
    function badgeParts(data, now) {
        if (!data) return { top: { label: '', value: '…', reset: '' }, bottom: null, pace: null, status: null };
        const resetW = data.secondary && data.secondary.resetAt ? '· ' + fmtReset(data.secondary.resetAt) : '';
        const resetH = data.primary && data.primary.resetAt ? '· ' + fmtReset(data.primary.resetAt) : '';
        const top = {
            label: shortLabel(data.primary, '5h'),
            value: data.primary ? Math.round(data.primary.left) + '%' : '–',
            reset: resetH
        };
        const bottom = {
            label: shortLabel(data.secondary, 'Wo.'),
            value: data.secondary ? Math.round(data.secondary.left) + '%' : '–',
            reset: resetW
        };
        if (data.limitReached) {
            const n = data.resetCredits;
            const extra = n > 0 ? '· ' + n + (n === 1 ? ' Gutschein' : ' Gutscheine') : '';
            return { top, bottom, pace: null, status: { text: 'Limit', extra } };
        }
        return { top, bottom, pace: paceLeft(data, now), status: null };
    }

    // #endregion PURE

    // =====================================================================
    // Speicher (GM, mit localStorage-Rückfall)
    // =====================================================================
    function storeGet(key, fallback) {
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(key, fallback);
                return v === undefined ? fallback : v;
            }
        } catch (e) { /* weiter unten */ }
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function storeSet(key, value) {
        try {
            if (typeof GM_setValue === 'function') { GM_setValue(key, value); return; }
        } catch (e) { /* weiter unten */ }
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorieren */ }
    }

    // =====================================================================
    // Netzwerk (same-origin, Cookies gehen automatisch mit)
    // =====================================================================
    async function httpJson(url, headers) {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, CFG.TIMEOUT_MS) : null;
        try {
            const res = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: Object.assign({ Accept: 'application/json' }, headers || {}),
                signal: ctrl ? ctrl.signal : undefined
            });
            const text = await res.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { /* kein JSON */ }
            return { status: res.status, json, text };
        } catch (e) {
            return { status: 0, json: null, text: '', error: String((e && e.message) || e) };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function accessToken() {
        const s = await httpJson(CFG.SESSION_URL);
        if (s.status !== 200 || !s.json) {
            return { ok: false, kind: s.status === 0 ? 'error' : 'auth', note: s.status === 0 ? (s.error || 'Netzwerkfehler') : 'Sitzung HTTP ' + s.status };
        }
        const tok = s.json.accessToken || (s.json.session && s.json.session.accessToken);
        if (!tok) return { ok: false, kind: 'auth', note: 'nicht angemeldet' };
        return { ok: true, token: tok };
    }

    /**
     * Holt die beiden Limits.
     * Sind Reset-Gutscheine vorhanden, wird zusätzlich deren Ablaufdatum geholt.
     * @returns {Promise<{ok:true, data:object} | {ok:false, kind:'auth'|'error', note:string}>}
     */
    async function fetchUsage() {
        const t = await accessToken();
        if (!t.ok) return t;
        const r = await httpJson(CFG.USAGE_API, { Authorization: 'Bearer ' + t.token });
        if (r.status !== 200) {
            const kind = (r.status === 401 || r.status === 403) ? 'auth' : 'error';
            return { ok: false, kind, note: r.status === 0 ? (r.error || 'Netzwerkfehler') : 'HTTP ' + r.status };
        }
        const data = parseUsage(r.json);
        if (!data) return { ok: false, kind: 'error', note: 'Antwort ohne rate_limit' };

        // Zusatzabruf nur, wenn es überhaupt Gutscheine gibt.
        if (data.resetCredits > 0) {
            const g = await httpJson(CFG.CREDITS_API, { Authorization: 'Bearer ' + t.token });
            if (g.status === 200) {
                const info = parseResetCredits(g.json);
                data.resetExpiry = info.nextExpiry;
            }
        }
        return { ok: true, data };
    }

    // =====================================================================
    // Badge
    // =====================================================================
    const BADGE_ID = 'xcodex-costs-badge';
    const COLORS = { ok: '#3ddc84', warn: '#e8c341', crit: '#ff6b6b', none: '#8a8a8a' };
    let badgeEl = null;
    let snapshot = null;

    function applySavedPosition(el) {
        const pos = storeGet(CFG.KEY.pos, null);
        if (!pos || typeof pos !== 'object') return;
        const right = clamp(Number(pos.right), 4, Math.max(4, window.innerWidth - 60));
        const bottom = clamp(Number(pos.bottom), 4, Math.max(4, window.innerHeight - 40));
        if (Number.isFinite(right)) el.style.right = right + 'px';
        if (Number.isFinite(bottom)) el.style.bottom = bottom + 'px';
        el.dataset.dragged = '1';
    }

    /**
     * Fläche des Eingabefelds (Composer). Auf der Chat-Seite liegt sie unten
     * zentriert und ist oft so breit, dass ein Badge unten rechts hineinragt.
     * Mehrere Selektoren, weil ChatGPT das Markup schon gewechselt hat
     * (`#prompt-textarea` → `contenteditable` im `form`).
     */
    function composerBox() {
        const ed = document.querySelector('form [contenteditable="true"]')
            || document.querySelector('form textarea')
            || document.querySelector('#prompt-textarea');
        if (!ed) return null;
        const box = ed.closest('form') || ed;
        const r = box.getBoundingClientRect();
        if (!r || r.width < 80 || r.height < 20) return null;
        return r;
    }

    /**
     * Setzt das Badge unten rechts — und schiebt es über das Eingabefeld, wenn es
     * damit kollidieren würde. Eine vom Nutzer gezogene Position bleibt unberührt.
     */
    function placeBadge(el) {
        if (!el || el.dataset.dragged === '1') return;
        const gap = 10;
        const set = (prop, val) => { if (el.style[prop] !== val) el.style[prop] = val; };
        set('right', gap + 'px');
        set('bottom', gap + 'px');

        const c = composerBox();
        if (!c) return;
        const b = el.getBoundingClientRect();
        const hitter = b.left < c.right + gap && b.right > c.left - gap && b.bottom > c.top - gap && b.top < c.bottom + gap;
        if (!hitter) return;

        const overTop = window.innerHeight - c.top + gap;
        set('bottom', Math.round(Math.min(overTop, window.innerHeight * 0.6)) + 'px');
    }

    function ensureBadge() {
        if (badgeEl && document.body && document.body.contains(badgeEl)) return badgeEl;
        if (!document.body) return null;

        badgeEl = document.createElement('div');
        badgeEl.id = BADGE_ID;
        badgeEl.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'display:flex',
            'align-items:center',
            'gap:6px',
            'padding:4px 10px 4px 8px',
            'border-radius:9px',
            'border:1px solid rgba(255,255,255,0.10)',
            'background:rgba(13,13,13,0.82)',
            'color:#fff',
            'font:500 11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
            'letter-spacing:0.02em',
            'box-shadow:0 2px 10px rgba(0,0,0,0.28)',
            'backdrop-filter:blur(6px)',
            'cursor:pointer',
            'user-select:none',
            'opacity:0.94',
            'transition:opacity .2s ease'
        ].join(';');

        const text = document.createElement('span');
        text.dataset.role = 'text';
        text.style.cssText = [
            'display:grid',
            'grid-template-columns:auto auto auto auto',
            'column-gap:5px',
            'row-gap:2px',
            'align-items:center',
            'justify-items:start',
            'white-space:nowrap'
        ].join(';');

        const mk = (role, extra, area) => {
            const el = document.createElement('span');
            el.dataset.role = role;
            el.style.cssText = (extra || '') + (area ? ';grid-area:' + area : '');
            return el;
        };

        // Der Blitz trägt die Statusfarbe — dafür muss er als Textzeichen
        // gerendert werden, nicht als farbiges Emoji (font-variant-emoji).
        const bolt = document.createElement('span');
        bolt.dataset.role = 'bolt';
        bolt.textContent = '⚡';
        bolt.style.cssText = 'font-variant-emoji:text;color:#8a8a8a;line-height:1;justify-self:center;grid-area:1/1';
        bolt.setAttribute('aria-hidden', 'true');

        const l1label = mk('l1label', '', '1/2');
        const l1val = mk('l1val', 'font-variant-numeric:tabular-nums', '1/3');
        const l1reset = mk('l1reset', 'opacity:0.85', '1/4');
        const dot = mk('dot', 'width:8px;height:8px;border-radius:50%;background:#8a8a8a;justify-self:center', '2/1');
        const l2label = mk('l2label', '', '2/2');
        const l2val = mk('l2val', 'font-variant-numeric:tabular-nums', '2/3');
        const l2reset = mk('l2reset', 'opacity:0.85', '2/4');
        const paceIcon = mk('paceicon', 'justify-self:center;opacity:0.75', '3/1');
        paceIcon.textContent = 'Ø';
        const statLabel = mk('statlabel', '', '3/2');
        const paceVal = mk('paceval', 'font-variant-numeric:tabular-nums', '3/3');
        const statExtra = mk('statextra', 'opacity:0.85', '3/4');

        [bolt, l1label, l1val, l1reset, dot, l2label, l2val, l2reset,
            paceIcon, statLabel, paceVal, statExtra].forEach((n) => text.appendChild(n));
        badgeEl.appendChild(text);
        document.body.appendChild(badgeEl);

        applySavedPosition(badgeEl);
        placeBadge(badgeEl);
        installInteractions(badgeEl);
        return badgeEl;
    }

    function render(view) {
        const el = ensureBadge();
        if (!el) return;
        const dot = el.querySelector('[data-role="dot"]');
        const color = COLORS[view.kind] || COLORS.none;
        if (dot) {
            dot.style.background = color;
            dot.style.boxShadow = view.kind === 'ok' ? '0 0 6px rgba(61,220,132,0.6)' : 'none';
        }
        const parts = view.parts || { top: { label: '', value: '…', reset: '' }, bottom: null, pace: null };
        const set = (role, v) => {
            const n = el.querySelector('[data-role="' + role + '"]');
            if (n) n.textContent = v;
        };
        const t = parts.top || { label: '', value: '', reset: '' };
        const b = parts.bottom || { label: '', value: '', reset: '' };
        set('l1label', t.label);
        set('l1val', t.value);
        set('l1reset', t.reset || '');
        set('l2label', b.label);
        set('l2val', b.value);
        set('l2reset', b.reset || '');
        const hasPace = parts.pace !== null && parts.pace !== undefined;
        const hasStatus = !!parts.status;
        set('paceval', hasPace ? Math.round(parts.pace) + '%' : '');
        set('statlabel', hasStatus ? parts.status.text : '');
        set('statextra', hasStatus ? (parts.status.extra || '') : '');
        const pa = el.querySelector('[data-role="paceicon"]');
        if (pa) {
            const show = hasPace || hasStatus;
            pa.style.display = show ? '' : 'none';
            pa.textContent = hasStatus ? '⊘' : 'Ø';
            pa.style.color = hasStatus ? COLORS.crit : '';
        }
        const bolt = el.querySelector('[data-role="bolt"]');
        if (bolt) bolt.style.color = color;
        el.title = view.title;
        el.style.opacity = (view.kind === 'ok' || view.kind === 'warn') ? '0.94' : '0.8';
        placeBadge(el);
    }

    function installInteractions(el) {
        let drag = null;

        el.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0) return;
            const r = el.getBoundingClientRect();
            drag = {
                x: ev.clientX,
                y: ev.clientY,
                right: window.innerWidth - r.right,
                bottom: window.innerHeight - r.bottom,
                moved: false,
                last: null
            };
            ev.preventDefault();
        });

        window.addEventListener('mousemove', (ev) => {
            if (!drag) return;
            const dx = ev.clientX - drag.x;
            const dy = ev.clientY - drag.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
            const right = clamp(drag.right - dx, 4, Math.max(4, window.innerWidth - 60));
            const bottom = clamp(drag.bottom - dy, 4, Math.max(4, window.innerHeight - 40));
            el.style.right = right + 'px';
            el.style.bottom = bottom + 'px';
            el.dataset.dragged = '1';
            drag.last = { right: Math.round(right), bottom: Math.round(bottom) };
        });

        window.addEventListener('mouseup', () => {
            if (!drag) return;
            const moved = drag.moved;
            if (moved && drag.last) storeSet(CFG.KEY.pos, drag.last);
            drag = null;
            if (!moved) openUsagePage();
        });

        el.addEventListener('mouseenter', () => { el.style.opacity = '1'; });
        el.addEventListener('mouseleave', () => { el.style.opacity = '0.94'; });
    }

    /**
     * Öffnet die Nutzungsseite in einem neuen Tab — über einen echten Link-Klick.
     * `location.assign` scheitert (SPA-Router landet bei `/c/undefined`),
     * `window.open(..., 'noopener')` öffnet hier nur einen leeren Tab.
     */
    function openUsagePage() {
        if (location.pathname.startsWith('/settings/usage')) return;
        const a = document.createElement('a');
        a.href = CFG.USAGE_PAGE;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { try { a.remove(); } catch (e) { /* egal */ } }, 0);
    }

    // =====================================================================
    // Anzeigezustände
    // =====================================================================
    function fmtClock(ms) {
        try {
            return new Date(ms).toLocaleString('de-DE', {
                weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return new Date(ms).toLocaleString();
        }
    }

    function windowLines(label, w) {
        if (!w) return [label + ': –'];
        const lines = [
            label + ': ' + Math.round(w.used) + ' % verbraucht · ' + Math.round(w.left) + ' % übrig'
        ];
        if (w.resetAt) {
            lines.push('  zurückgesetzt ' + fmtClock(w.resetAt) + ' (in ' + fmtDur(w.resetIn) + ')');
        } else if (w.resetIn !== null) {
            lines.push('  zurückgesetzt in ' + fmtDur(w.resetIn));
        }
        return lines;
    }

    function buildTitle(data, at) {
        const lines = ['ChatGPT-Planlimits' + (data.plan ? ' (' + data.plan + ')' : '')];
        lines.push('');
        lines.push.apply(lines, windowLines(longLabel(data.primary, '5-Stunden-Limit'), data.primary));
        lines.push.apply(lines, windowLines(longLabel(data.secondary, 'Wöchentliches Limit'), data.secondary));
        const pace = paceLeft(data, Date.now());
        if (pace !== null) {
            const restMs = data.secondary && data.secondary.resetAt ? data.secondary.resetAt - Date.now() : 0;
            const rate = restMs > 0 && data.secondary ? data.secondary.left / (restMs / 86400000) : 0;
            lines.push('Ø heute: ' + Math.round(pace) + ' % (Budget ' + rate.toFixed(1).replace('.', ',')
                + ' % pro Tag, heute zählt die Restzeit bis Mitternacht)');
        }
        lines.push('');
        lines.push('Credits: ' + (data.hasCredits ? (data.creditBalance || 'vorhanden') : 'keine'));
        if (data.resetCredits !== null) {
            lines.push('Reset-Gutscheine: ' + data.resetCredits + ' verfügbar'
                + (data.resetExpiry ? ' (nächster Ablauf ' + fmtDate(data.resetExpiry) + ')' : ''));
        }
        lines.push('Aktualisiert: ' + relTime(at));
        lines.push('');
        lines.push('Klick: Nutzungsseite öffnen · Ziehen: Position ändern');
        const ver = scriptVersion();
        if (ver) lines.push('', 'xCodex Costs v' + ver);
        return lines.join('\n');
    }

    function freshView(snap) {
        const age = Date.now() - Date.parse(snap.at);
        const stale = age > CFG.STALE_MS;
        const parts = badgeParts(snap.data);
        if (stale && parts.top) parts.top.value += ' ⏳';
        return {
            kind: stale ? 'warn' : severity(snap.data),
            parts,
            title: buildTitle(snap.data, snap.at) + (stale ? '\n\n⏳ Letzter bekannter Stand.' : '')
        };
    }

    function staleView(snap, note) {
        if (!snap || !snap.data) return null;
        const parts = badgeParts(snap.data);
        if (parts.top) parts.top.value += ' ⏳';
        return {
            kind: 'warn',
            parts,
            title: buildTitle(snap.data, snap.at) + '\n\nAktualisierung fehlgeschlagen: ' + (note || 'unbekannt')
        };
    }

    function authView(note) {
        return {
            kind: 'crit',
            parts: { top: { label: '', value: 'Login nötig', reset: '' }, bottom: null, pace: null, status: null },
            title: 'Kein gültiger ChatGPT-Login in diesem Browser.\n' + (note ? '(' + note + ')\n' : '') +
                '\nBitte auf chatgpt.com anmelden — danach aktualisiert sich das Badge selbst.'
        };
    }

    function errorView(note) {
        return {
            kind: 'crit',
            parts: { top: { label: '', value: (note || 'Fehler'), reset: '' }, bottom: null, pace: null, status: null },
            title: 'Die Planlimits konnten nicht geladen werden:\n' + (note || 'unbekannter Fehler')
        };
    }

    // =====================================================================
    // Ablauf
    // =====================================================================
    let lastAttempt = 0;
    let timer = null;

    async function refresh(reason) {
        lastAttempt = Date.now();
        log('refresh', reason);
        const res = await fetchUsage();
        if (res.ok) {
            snapshot = { at: new Date().toISOString(), data: res.data };
            storeSet(CFG.KEY.snapshot, snapshot);
            render(freshView(snapshot));
            return;
        }
        if (res.kind === 'auth') {
            render(authView(res.note));
            return;
        }
        const stale = staleView(snapshot, res.note);
        render(stale || errorView(res.note));
    }

    function schedule() {
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
            if (!document.hidden) refresh('interval');
        }, CFG.REFRESH_MS);
    }

    function onVisible() {
        if (document.hidden) return;
        if (Date.now() - lastAttempt < CFG.MIN_REFRESH_MS) return;
        refresh('fokus');
    }

    function boot() {
        if (location.pathname.startsWith('/auth/')) return;

        const saved = storeGet(CFG.KEY.snapshot, null);
        if (saved && saved.data) {
            snapshot = saved;
            render(freshView(snapshot));
        } else {
            render({ kind: 'none', parts: { top: { label: '', value: 'lädt …', reset: '' }, bottom: null, pace: null, status: null }, title: 'Planlimits werden geladen …' });
        }

        refresh('start');
        schedule();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        window.addEventListener('resize', () => placeBadge(badgeEl));
        // Der Composer wandert beim Wechsel zwischen Leer- und Chat-Ansicht.
        setInterval(() => { if (!document.hidden) placeBadge(badgeEl); }, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
