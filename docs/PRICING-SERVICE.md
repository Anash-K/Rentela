# Pricing service — step-by-step (how it works & what we built)

This document explains **only** the **pricing-service**: what problem it solves, how data is stored, how a price is calculated step by step, what APIs exist, and how **booking-service** uses it. Written in **English**.

---

## 1. Why this service exists

Before pricing-service, rental amounts could be typed manually or duplicated across apps. This service gives you:

- **One place** for rules (per vehicle kind: bike, car, e-rickshaw, tempo, loader).
- **Versioned rules** so you can change tariffs tomorrow without rewriting history for past bookings.
- **Automated quotes** from vehicle attributes (engine CC, load capacity, etc.) plus rental dates and estimated km.
- An **immutable snapshot** attached to a booking so billing stays consistent after the booking is created.

---

## 2. What we stored in the database

### 2.1 Rule version (`AutoPricingRuleVersion`)

Each row is a **named release** of pricing (for example `2026.05.default`):

- **`versionLabel`** — unique human-readable id for support and logs.
- **`effectiveFrom` / `effectiveTo`** — optional window when this version is valid in time.
- **`isActive`** — whether this version participates in “active rule” selection (you normally activate **one** version for production).

### 2.2 Tiers (`AutoPricingTier`)

Each row is one **band** inside a version, for one **`vehicleKind`**:

| Vehicle kinds | How a tier is matched |
|---------------|------------------------|
| **BIKE / CAR** | **`minEngineCc`** and **`maxEngineCc`** — vehicle’s **`engineCC`** must fall in range. |
| **TEMPO / LOADER** | **`capacityCeilingKg`** — we sort tiers by ceiling and pick the **smallest ceiling** that is still **≥** the vehicle’s **`loadCapacityKg`**. |
| **ERICKSHAW** | Usually a **single** tier row (no CC bands). |

Each tier also stores:

- **`basePricePerDay`**, **`includedKmPerDay`**, **`extraKmPrice`**
- **`weekendMultiplier`** (e.g. 1.2 for Saturday/Sunday in UTC day loop)
- **`hourlyFromDailyDivisor`** — used to derive **hourly rate** from daily base (default divide by 10 for late-return fee style calculations)
- **`segmentLabel`** (e.g. ECONOMY, STANDARD) for display and reporting

A **seed migration** inserted default tiers matching the product’s original tier table (bike/car bands, tempo/loader capacity rows, e-rickshaw).

---

## 3. Step-by-step: how a quote is calculated

When someone calls **`POST /v1/quote/booking`** (or booking-service does it internally), this chain runs:

### Step A — Load active rules

1. **`rule-version.service`** loads the **active** `AutoPricingRuleVersion` (filters `isActive`, inside effective dates).
2. It loads **all** `AutoPricingTier` rows for that version.
3. Results may come from **Redis** cache first (`pricing:activeRulePack:v1`), then **PostgreSQL** if cache is cold or expired — so repeated quotes do not hammer the DB.

### Step B — Pick the right tier (classification)

1. Tiers are **grouped by** `vehicleKind` (BIKE, CAR, …).
2. **`classifyVehicle`** receives the vehicle’s **`vehicleKind`**, **`engineCC`**, **`loadCapacityKg`** and the list for that kind.
3. It returns **exactly one** tier row, or throws a clear error if attributes are missing or no band matches.

### Step C — Turn tier into “pricing vector”

From the tier we build a small structure used in formulas:

- **`basePricePerDay`**, **`baseKmPerDay`** (included km **per day**), **`pricePerExtraKm`**, **`weekendMultiplier`**
- **`hourlyPrice`** ≈ `basePricePerDay / hourlyFromDailyDivisor` (rounded)

### Step D — Rental length

- **`countRentalDays`**: difference between **start** and **end** dates, **ceil** to whole days, **minimum 1 day**.
- If the rental is longer than **`PRICING_QUOTE_MAX_DAYS`** (env, default 90), the quote **rejects** — protects abuse and bad input.

### Step E — Money for the rental window (calendar loop)

For **each calendar day** from start (index `i = 0 … days-1`):

- If that day is **Saturday or Sunday** (UTC `getUTCDay()`), multiply that day’s base by **`weekendMultiplier`**.
- Otherwise use plain **`basePricePerDay`**.

Sum those → **base rental subtotal** (before extra km).

### Step F — Extra km

- **Allowed total km** = `includedKmPerDay × number_of_days`.
- **Extra km** = `max(0, estimatedTotalKm - allowed)`.
- **Extra km cost** = `extraKm × pricePerExtraKm`.

### Step G — Totals

- **Quote line total (rental slice)** = base rental subtotal + extra km cost (all rounded sensibly via **`roundMoney`**).

### Step H — Build the **pricing snapshot** (for bookings)

We do **not** only return numbers. We also build a **JSON snapshot** that booking-service can store:

- Which **rule version** and **tier id** were used.
- **Rates** (`basePricePerDay`, `extra km`, weekend multiplier, **hourly**).
- **Inputs** (start, end, estimated km) and **pricedAt** timestamp.

Later, **final bill** logic can use **only this snapshot** plus **actual km** and **actual return time** — so you do not silently switch tiers after the user booked.

---

## 4. Late fee and final bill (same service, snapshot-based)

- **`POST /v1/bill/final`** accepts the **stored snapshot** + **actual km** + **actual end time**.
- **Late fee** = positive whole hours after expected end × **hourly rate from snapshot**.
- **Km charges** recompute from snapshot rates and **actual** km (same formula as quote, but with actuals).

So: **rules DB** is for **new quotes**; **snapshot** is for **honouring an existing booking**.

---

## 5. HTTP APIs (summary)

| Method | Path | Who uses it | Purpose |
|--------|------|-------------|---------|
| GET | `/health` | Ops | Liveness. |
| GET | `/v1/rules/active` | Anyone | Which version is active + coarse metadata. |
| POST | `/v1/quote/booking` | Apps / **booking-service** | Full quote + **pricingSnapshot**. |
| POST | `/v1/bill/final` | Booking/payment completion flows | Bill from **snapshot** + actuals. |
| POST | `/internal/v1/cache/bust` | Ops | Clear Redis rule cache (optional secret). |
| **Admin** (API key) | `/admin/v1/rule-versions` … | Admin tools | CRUD versions & tiers, **activate** one version. |

Admin routes require **`PRICING_ADMIN_API_KEY`** (header `x-pricing-admin-key` or `Authorization: Bearer …`). See main Readme.

---

## 6. How booking-service uses it (integration)

- On **create booking**, if the client sends **`useAutoPricing: true`**:
  1. Booking-service **loads the vehicle** from **vehicle-service** (needs **`vehicleKind`**, **`engineCC`** or **`loadCapacityKg`** as required).
  2. It calls **`POST …/v1/quote/booking`** on pricing-service.
  3. It saves **`pricingSnapshot`** and **`pricingVersionLabel`** on the booking row and copies rate fields into **`baseAmount`**, **`extraAmount`**, **`includedKm`**, **`extraPerKm`**, **`extraPerHour`** for the rest of the platform.

After that, **changing rules in the admin** does **not** change that booking’s economics unless you deliberately re-quote (business decision).

---

## 7. What we implemented in code (file map)

| Area | Location (under `services/pricing-service/`) |
|------|-----------------------------------------------|
| Env & port | `src/config/env.js` |
| Prisma client | `src/libs/prisma.js` |
| Redis (optional cache) | `src/libs/redis.js` |
| Classification rules | `src/domain/classify.js` |
| Day / km / late / final bill math | `src/domain/calculate.js`, `src/domain/money.js` |
| Load active version + cache | `src/services/rule-version.service.js` |
| Quote + snapshot + final bill orchestration | `src/services/pricing-engine.service.js` |
| Public HTTP handlers | `src/controllers/pricing.controller.js` |
| Admin CRUD | `src/controllers/admin-pricing.controller.js`, `src/services/admin-pricing.service.js` |
| Auth middleware for admin | `src/middlewares/adminAuth.js` |
| Zod validation | `src/schemas/quote.schema.js`, `src/schemas/admin.schema.js` |
| Routes | `src/routes/pricing.routes.js`, `src/routes/admin.routes.js` |
| App entry | `src/app.js`, `src/server.js` |
| DB schema & migrations | `prisma/schema.prisma`, `prisma/migrations/` |

---

## 8. Gateway URL (local)

If the API gateway runs on port **5000**, pricing is usually reached as:

- `http://localhost:5000/pricing/v1/quote/booking`
- `http://localhost:5000/pricing/admin/v1/...` (with admin key)

---

## Related docs

- [FLOWS.md](FLOWS.md) — pricing inside the wider booking and payment story.  
- [ARCHITECTURE.md](ARCHITECTURE.md) — scaling and stack.  
- Root [Readme.md](../Readme.md) — run and migrate.
