# Rental platform

A **pnpm monorepo** of Node.js **microservices** for a vehicle rental product: vehicles, bookings, payments, pricing, notifications, invoices, and an API **gateway** that fronts the public HTTP API.

**Deeper detail:**  
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — microservice roles, scaling (including high traffic / lakhs of users), technology stack, and design notes.  
- [docs/FLOWS.md](docs/FLOWS.md) — **how requests and events flow** (gateway, booking, pricing snapshot, payment → Kafka → invoice/notifications).  
- [docs/PRICING-SERVICE.md](docs/PRICING-SERVICE.md) — **pricing-service only**: rules DB, tier classification, quote math, snapshot, APIs, admin.

## What’s in the repo

| Area | Services (examples) |
|------|------------------------|
| **Edge** | `gateway` — HTTP proxy to downstream services |
| **Core** | `booking-service`, `vehicle-service`, `payment-service`, `pricing-service` |
| **Async** | Kafka consumers in `booking-service`, `invoice-service`, `payment-service` relay; `notification-service` subscribes to **Redis** for real-time in-app notifications |
| **Other** | `auth-service`, `notification-service`, `invoice-service`, `telematics-service`, `tracking-worker`, etc. |
| **Shared** | `shared/*` — helpers used by services |

Default **local** service ports (override with `PORT` per service):

| Service | Port |
|---------|------|
| Gateway | 5000 |
| Auth | 5003 |
| Booking | 5004 |
| Payment | 5006 |
| Notification | 5007 |
| Vehicle | 5010 |
| Invoice | 5012 |
| Pricing | 5015 |
| Telemetries / telemetry | 5020 |

## Prerequisites

- **Node.js** (LTS recommended)
- **pnpm** 10+ (`packageManager` in root `package.json`)
- **PostgreSQL** and **Redis** (or use Docker — see below)
- **Kafka** (and Zookeeper) for payment/booking/invoice event flows
- For full flows: run migrations and configure `DATABASE_URL` / `REDIS_URL` / `KAFKA_BROKERS` in each service’s environment

## Install

From the repository root:

```bash
pnpm install
```

## Local infrastructure (Docker)

Bring up shared dependencies (Postgres, Redis, Kafka, etc.):

```bash
cd infra
docker compose up -d
```

Postgres (default in compose): `localhost:5432`, user `postgres`, password `password`, database `rental_platform`. **Create per-service PostgreSQL schemas** (or separate DBs) as your `DATABASE_URL` strings expect.

Redis: `redis://localhost:6379`  
Kafka: `localhost:9092`

## Database (Prisma)

Each service that uses Prisma has its own `prisma/schema.prisma` and migrations under `services/<name>/prisma/migrations`.

Typical pattern after infra is up:

```bash
cd services/booking-service && pnpm exec prisma migrate deploy && pnpm exec prisma generate
```

Repeat for **payment**, **vehicle**, **notification**, **invoice**, **pricing**, etc., using each service’s `.env` `DATABASE_URL`.

## Run services

Run from the repo root with **pnpm workspaces** (examples):

```bash
pnpm --filter gateway dev
pnpm --filter booking-service dev
pnpm --filter payment-service dev
pnpm --filter pricing-service dev
```

Or use each package’s `start` / `dev` script:

```bash
cd services/gateway && pnpm dev
```

Point services at the same **Redis** and **Kafka** URLs so notifications and payment completion propagate correctly.

### Booking inventory hold

New bookings default to **`PENDING`** with a time-boxed **`holdExpiresAt`** (default **15 minutes** via `BOOKING_HOLD_MINUTES`) so the vehicle cannot be double-booked by another overlapping window. **BullMQ** runs a **delayed job** per hold to cancel if unpaid (no cron). When **`payment.completed`** sets **`PAID`**, the booking becomes **`CONFIRMED`** and the hold job is removed. B2B or tests can pass **`immediateConfirm: true`** on `POST /bookings` to skip the hold, or set **`BOOKING_HOLD_ENABLED=false`** to restore legacy behavior. See `services/booking-service/src/config/hold.js` and `src/queues/holdExpiry.queue.js`.

### Gateway as single entry

Clients usually call **only** the gateway, e.g. `http://localhost:5000`, which proxies paths such as `/bookings`, `/vehicles`, `/payments`, `/pricing`, `/notifications` (see `services/gateway/src/routes/index.js`).

## Notification + booking smoke (optional)

With Redis and notification + booking services running:

```bash
pnpm e2e:notification-smoke
```

Full booking → mock payment → notification checks need Kafka, payment relay, and configured mock payment flags — see `scripts/e2e-booking-notification.mjs` header comments.

## Pricing admin API

`pricing-service` exposes **`/admin/v1/*`** behind **`PRICING_ADMIN_API_KEY`** (≥ 16 characters) in `services/pricing-service/.env`. See `services/pricing-service/.env.example`.

**Auth (either is fine):**

- Header: **`x-pricing-admin-key: <your key>`**
- Or: **`Authorization: Bearer <your key>`**

**Test URLs** (gateway `PORT` defaults to **5000**; pricing-service defaults to **5015** — use your actual `PORT` if overridden):

| Where | List rule versions (GET) |
|--------|---------------------------|
| Direct to pricing-service | `http://localhost:5015/admin/v1/rule-versions` |
| Via gateway | `http://localhost:5000/pricing/admin/v1/rule-versions` |

**Example (replace the key if yours differs):**

```bash
curl -sS -H 'x-pricing-admin-key: dev-rental-pricing-admin-key-2026' \
  http://localhost:5015/admin/v1/rule-versions
```

## Environment variables

Each service ships with its own `.env` expectations (database URL, ports, optional Redis/Kafka). Copy patterns from existing `services/*/.env` or docs inside services — never commit real secrets.

Common patterns:

- **`DATABASE_URL`** — PostgreSQL connection string (often per-schema).
- **`REDIS_URL`** — must match across publishers and **notification-service** consumers.
- **`KAFKA_BROKERS`** — comma-separated, e.g. `localhost:9092`.

## License

See repository license file if present; otherwise treat as private/internal unless stated otherwise.
