# REAL LIFE TYCOON: Café Empire

> Permainan simulasi perniagaan mudah alih: urus kafe kecil di Malaysia, tetapkan harga, beli stok, ambil staf, hadapi peristiwa harian dan kembangkan empayar kafe anda. Bahasa Melayu, mata wang RM.

A single-player, mobile-first browser game built with React, TypeScript (strict), Vite, Tailwind CSS and Recharts. The game runs entirely in the browser. There is no backend, no account and no payment, and progress is saved only in the current browser's `localStorage`.

All prices, costs, demand figures and events are **fictional game-balancing values**, not real market data.

---

## Quick start

Requires Node.js 20.19 or newer.

```bash
npm install          # install pinned dependencies
npm run dev          # start the dev server (http://localhost:5173)
npm test             # run the Vitest suite once
npm run typecheck    # strict TypeScript check
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build (http://localhost:4173)
```

The build uses a relative base (`./`), so you can host `dist/` from any static host or sub-path.

---

## How to play

1. **Prepare (Persediaan).** Buy stock under *Menu → Inventori*, set prices under *Menu → Menu & harga*, hire staff or buy upgrades under *Urus*, and choose a promotion under *Operasi*.
2. **Open the café (Buka kafe).** The day is simulated hour by hour from 08:00 to 20:00. Footfall depends on reputation, weekday, promotion, upgrades and events. Each customer picks an item, decides whether the price is acceptable, and may be turned away by stock-outs, queues (service capacity) or closures.
3. **Close.** Wages, rent and utilities are paid. Unsold croissants (≈40%) and latte milk (≈5%) spoil overnight.
4. **Review the report.** It includes P&L, cash flow, customer breakdown, product performance, event outcome, timeline, transactions, reconciliation checks and a shareable result card. Then start the next day.

Objectives award XP. XP raises the café level (Kafe Kecil → Kafe Kejiranan → Kafe Popular → Empayar Kafe), which unlocks higher-tier upgrades and the influencer promotion. If cash stays negative after **3 consecutive closes**, the café goes bankrupt.

### Starting state

| Item | Value |
|---|---|
| Cash | RM5,000.00 |
| Reputation | 50 / 100 |
| Staff | 1 barista (Aiman, RM90/day, 8 orders/hour) |
| Stock | none (buying it is your first decision) |

| Product | Unit cost | Price | Notes |
|---|---|---|---|
| Kopi O | RM1.00 | RM3.50 | |
| Americano | RM1.50 | RM5.00 | |
| Latte | RM2.20 | RM7.00 | 5% overnight spoilage (milk) |
| Teh Ais | RM1.20 | RM3.50 | |
| Croissant | RM2.00 | RM5.50 | Add-on to drinks; 40% overnight spoilage |

Daily fixed costs: rent RM120, utilities RM30 + RM0.10 per customer served (+ upgrade extras), and wages.

---

## Features

- **Pricing and menu:** per-product price editor with a live margin and price-perception preview, plus menu on/off toggles.
- **Inventory:** purchases with quick quantities, bulk discounts (50+ units 5%, 100+ units 8%), a one-tap restock to the forecast, low/out-of-stock warnings and insufficient-funds states.
- **Demand model:** reputation, weekday, price elasticity, promotions, upgrades, events, substitution on stock-outs and price objections, and drink→croissant add-ons.
- **Service capacity:** hourly order capacity from staff (baristas and cashiers) and upgrades. Customers beyond capacity leave.
- **Staff:** three deterministic candidates each day, a hiring fee, daily wages, firing with confirmation, and staff slots (2, or 4 with an upgrade). The team's names are recorded at the start of each day, so hiring or firing never renames or duplicates the day's candidates.
- **Upgrades (9):** capital investments that affect capacity, footfall, demand, spoilage, reputation, utilities, staff slots or supplier cost, gated by café level.
- **Promotions (5):** none, social media, flyers, a 10% discount, and an influencer (level 2).
- **Events (15):** forecast events are visible during preparation and apply from opening (weather, festivals, a supplier price spike and more). Surprise events are revealed on opening and take effect from the hour they happen; for example, the espresso machine breaks at 11:00 and the viral post lands at 12:00 (others include a food reviewer, health inspection, bulk office order and power outage). Some are mitigated by upgrades.
- **Objectives (14) and levels (4).**
- **Reports:** a reconciled P&L, cash flow, an inventory bridge, 10 automatic reconciliation checks, a shareable PNG result card (Web Share API with a download fallback) and copyable text.
- **Finance:** revenue vs net-profit chart, cash chart, table view, expense breakdown, report history and a transaction ledger.
- **Persistence:** a versioned save with autosave after every action, validation, migration, corrupt-save backup and recovery, and confirmed reset (also when restarting after bankruptcy).
- **Multi-tab safety:** every save write carries a random `saveId`. A tab adopts progress saved by another tab when the `storage` event arrives and re-checks whenever it becomes visible again. Before any game-changing action or manual save it also checks the stored `saveId`, so a stale or suspended tab adopts the newer save and shows a toast instead of overwriting it or settling a day twice.
- **UX:** portrait-first, works from 360px wide, ≥40px touch targets, five-tab bottom navigation, confirmation dialogs for destructive or expensive actions, toasts for every action outcome, and loading, empty, error and insufficient-funds states. Honours `prefers-reduced-motion`.

---

## Architecture

```
src/
  main.tsx                 entry: StrictMode + error boundary
  index.css                Tailwind v4 theme tokens (cream / espresso / sage)
  app/                     shell, navigation (hash-based), GameProvider (load/autosave/reset)
  components/              reusable UI: Button, Card, Badge, Money, Modal/Sheet, ConfirmDialog,
                           Segmented, Switch, Toast, Notice, Stat, ProgressBar, CafeScene (SVG)
  features/
    dashboard/             KPIs, today, alerts, 7-day profit, next objectives
    operations/            prep checklist, promotion picker, open café, live day playback
    menu/                  prices & menu toggles
    inventory/             stock purchasing and restock plan
    business/              staff, upgrades, objectives
    finance/               summary charts (lazy-loaded Recharts), reports list, ledger
    reports/               end-of-day report, result card, share image renderer
    settings/              settings sheet, game-over dialog
  game/                    ── pure TypeScript engine, no React ──
    types.ts               typed game state, reports, transactions, results
    constants.ts           balancing constants
    data/                  static products, promotions, upgrades, staff, events, objectives
    money.ts               integer-sen helpers and formatting
    rng.ts                 seeded PRNG, per (seed, day, purpose) streams
    economy.ts             weighted-average inventory, purchase quotes, expenses
    demand.ts              footfall, price response, capacity, day simulation, reputation
    events.ts              event roll and mitigation
    staff.ts               capacity, slots, daily candidates
    objectives.ts          XP, levels, objective evaluation
    engine.ts              player actions + once-per-day settlement
    reducer.ts             pure reducer mapping UI actions to the engine
    selectors.ts           read-only views for the UI (estimates, quotes, margins, checklists)
    reports.ts             reconciliation, cash-flow summary, chart series
    validate.ts            runtime validation of loaded saves
    save.ts                versioned save manager and migrations
    __tests__/             Vitest suites
```

### Key design rules

- **Money is integer sen everywhere** (`…Sen` fields). Rates are applied with integer basis-point maths and rounded immediately (`applyBps`, `mulDivRound`). Ringgit floats appear only in chart axis labels.
- **The UI never calculates financial results.** Components render values from `engine.ts`, `selectors.ts`, `economy.quotePurchase` and `reports.ts`.
- **Each day is processed exactly once.** `openCafe(state, day)` is rejected unless `day === state.day`, the phase is `prep`, and `lastSettledDay < day`. The reducer is pure, so React StrictMode double-invocation is harmless. Repeated taps are ignored silently, and the button also disables itself.
- **Determinism.** Events, demand and candidates come from `hash(seed, day, purpose)`. Reloading cannot re-roll a day, and tests use fixed seeds.
- **Accounting.** Stock purchases reduce cash immediately and increase inventory value. COGS is recognised only when units sell, using weighted-average cost. When the last unit leaves, the remaining value is released, so no rounding residue is left. Spoilage is a non-cash write-off shown under *Lain-lain*. Upgrades are capital spending: they reduce cash but are not expensed.

### Report reconciliation

`reconcileReport()` verifies every report (shown in the UI under *Semakan laporan*):

- opening cash + Σ transactions = closing cash
- sale transactions = revenue = Σ product-line revenue
- Σ product-line COGS = COGS
- expense lines add up, and cash expenses match their transactions
- net profit = revenue + other income − COGS − expenses
- opening inventory + purchases − COGS − spoilage = closing inventory
- net profit − Δinventory − capex = Δcash

### Save format

- Key: `rlt-cafe-empire/save`. Envelope: `{ schemaVersion: 2, savedAt, game }`.
- **Migration:** `migrateSave()` upgrades known older formats step by step. The v1 prototype format (money in ringgit decimals, no ledger) is migrated to v2 and covered by tests. Newer-than-supported versions are rejected.
- **Validation:** `validateGameState()` checks types, integer money, ranges, known IDs, phase consistency and report structure.
- **Write ids:** each write stores a random `saveId` before the game data, so `peekSaveId()` can detect another tab's write without parsing the whole save.
- **Recovery:** if the save is malformed or invalid, the raw text is copied to `rlt-cafe-empire/save-rosak`, a new game starts and the player sees a notice. If `localStorage` is unavailable (for example in private mode), the game still runs in memory and shows a warning.

---

## Tests

```bash
npm test
```

There are 93 tests in 7 suites (`src/game/__tests__`):

| Suite | Covers |
|---|---|
| `money.test.ts` | formatting, input parsing, integer rounding |
| `economy.test.ts` | purchase quotes, bulk discounts, event surcharges, WAC costing, no negative inventory |
| `engine.test.ts` | starting state, purchases and insufficient funds, atomic batch buys, storage limits, price bounds, disabled products, revenue/COGS/net profit, cash balance, unsold stock is not COGS, spoilage, multi-seed 25-day reconciliation, capacity limits, price elasticity, one settlement per day, phase locking, promotions (including free promotions while cash is negative), staff (candidate list unchanged by hires and fires, unique names), upgrades, bankruptcy |
| `events.test.ts` | reproducible rolls, hidden surprises, surprise effects starting at the event hour, effects of rain/festival/heatwave/power outage/breakdown/inspection (+mitigation)/contest/office order/reviewer/price spike |
| `save.test.ts` | save/load round trips, save ids and other-tab write detection, malformed JSON, invalid values, future versions, throwing/unavailable storage, v1 migration, reset |
| `reducer.test.ts` | repeated OPEN_CAFE settles once, StrictMode purity, stale actions, replay watched once, feedback, reset |
| `selectors.test.ts` | stock levels, restock plan, forecast never leaks surprises, price preview, hire capacity gain with upgrades, reputation display, chart series, compact labels |

**Manual verification (Playwright, Chromium, 360×740 touch):** dashboard → restock (confirm + toast) → price edit and save → open café → live playback → report → **browser refresh keeps the report and day** → next day → staff, upgrades, objectives, finance (charts, reports sheet, ledger) → settings → insufficient-funds state → corrupt-save recovery → share-card PNG download → negative-cash warning → bankruptcy → confirmed restart. Two tabs on one save were also checked: the second tab follows the first live, and a tab that missed the update adopts the newer save instead of acting on stale data. In nested dialogs, Escape closes only the top dialog. All screens were checked for horizontal overflow at 360, 390 and 768px (none found), touch targets under 40px (none found), and console errors (none). Text colour pairs meet WCAG AA contrast.

---

## Decisions on ambiguous requirements

- **"Configurable unit cost":** unit cost lives in the product state and in `data/products.ts`. Players change it indirectly through the supplier-contract upgrade (−10%), bulk discounts and events (+25% coffee price spike). Prices are set directly.
- **Six screens, five tabs:** Menu and Inventory share the *Menu* tab as sub-tabs. Staff, Upgrades and Objectives sit under *Urus*. Reports and the ledger sit under *Kewangan*. Settings opens from the header.
- **Day flow:** `prep → (open) → closed → next day`. Editing is locked while closed so every transaction belongs to exactly one day's report.
- **Marketing** is charged when the café opens. If cash is no longer sufficient, the promotion is cancelled and noted in the report.
- **Objective rewards** are XP and levels, not cash, to keep the financial statements clean.
- **Hiring** charges a one-off fee (other expenses). Firing is free but requires confirmation, and the last barista cannot be fired.
- **Imagery:** the café scene is a lightweight hand-built SVG illustration (morning and evening variants) instead of photographs. This keeps the app small and offline-friendly, and avoids licensing questions.

---

## Known limitations

- Saves are local to one browser on one device. Clearing site data erases progress, and there is no cloud sync or export. Playing in two tabs is safe but not simultaneous: the most recent save wins and the other tab follows it.
- Single café only. There is no multi-branch "empire" layer, ingredient-level recipes, staff morale, loans or depreciation.
- Report history keeps the latest 60 days. Lifetime totals are kept in stats.
- Balance is tuned with a scripted bot over ~45 days and would benefit from playtesting.
- There are no automated UI/component tests. UI behaviour was verified with scripted Playwright runs and is not part of `npm test`.
- Not a PWA yet, so it does not work offline after first load unless the browser caches it.

## Recommended next steps

1. Add Playwright end-to-end tests to the repo and CI (the manual QA flow above is a ready-made script outline).
2. Add save export/import (JSON file) so players can move between devices without a backend.
3. Add a PWA manifest and service worker for install and offline play.
4. Add a second-branch expansion, ingredient-level inventory (beans, milk, tea, pastry), loans and simple depreciation.
5. Add a weekly summary report and goals for weekends and holidays.
6. Support localisation (English) through a string table.

### Note on dependency pinning

All versions are pinned exactly. `package.json` contains `"overrides": { "vite": "$vite" }` because npm 10's peer resolver otherwise tries to pull Vite 8 (and through it Vitest 5) for Vitest's optional peers and crashes. The override keeps the whole tree on the declared Vite 6.4.5. `npm audit` reports 0 vulnerabilities.
