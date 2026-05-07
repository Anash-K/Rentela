# Architecture, microservices & scaling

This document complements the root **Readme.md** with a deeper view of **what each service does**, **how the system can scale** to very large user bases (including **lakhs** of active users), **technologies in use**, and **design choices** that matter for production.

---

## 1. Microservices — roles and responsibilities

The platform is a **distributed system**: each service owns a bounded context, its own **PostgreSQL schema** (or database), and deploys independently. Clients typically talk only to the **API gateway**; services talk to each other via **HTTP** (sync) and **Kafka / Redis** (async).

| Service | Primary responsibility |
|--------|-------------------------|
| **gateway** | Single HTTP entry: routing, rate limiting, proxy to downstream URLs. Hides internal topology from clients. |
| **auth-service** | Authentication / identity concerns for users and tokens (integrates with your auth model). |
| **vehicle-service** | Vehicles, branches, inventory, documents, transfers, telemetry hooks — operational vehicle master data. |
| **booking-service** | Booking lifecycle (create, start, complete, cancel), overlap checks, bill calculation hooks, optional **auto-pricing** via pricing-service, Kafka consumer for **payment.completed** to update booking payment state. |
| **pricing-service** | Versioned **auto-pricing rules** (vehicle kind → tier → rates), quotes, immutable **pricing snapshots** on bookings, **admin APIs** for rule CRUD, Redis-backed rule cache. |
| **payment-service** | Payments, webhooks (Stripe/Razorpay/mock), ledger / idempotency patterns, **Kafka** publish of `payment.completed` via relay worker; optional dev simulate capture. |
| **invoice-service** | Consumes **payment.completed**, builds **invoices** from envelopes. |
| **notification-service** | Persists in-app notifications; **Redis pub/sub** fan-in; **Socket.IO** for real-time delivery; separate channels for booking vs alerts. |
| **telematics-service** | Telemetry / fleet-facing APIs (port commonly **5020** in local setup). |
| **tracking-worker** | Background worker for tracking / vehicle sync (consumes external or internal streams). |
| **media-service**, **storage-service**, **search-service** | Media assets, object storage integration, search indexing — scale-heavy paths often isolated here. |
| **dashboard-service**, **analytics-service**, **maintenance-service** | Operational dashboards, analytics, maintenance workflows — read-heavy or batch-oriented workloads separated from core transactional APIs. |

**Shared code** lives under `shared/` (e.g. HTTP helpers) to avoid duplication without coupling runtime deployments.

---

## 2. How communication works

- **Synchronous:** Browser/mobile → **gateway** → individual services (REST/JSON). Used for commands and queries that need an immediate response.
- **Asynchronous:** **Kafka** topics (e.g. `payment.completed`) decouple **payment** from **booking** and **invoice**: producers and consumers can scale and deploy separately; failures can retry without blocking HTTP.
- **Real-time notifications:** Services **publish** JSON to **Redis channels**; **notification-service** subscribes, writes to its DB, and pushes over **WebSockets** (Socket.IO). This avoids polling at large scale.

---

## 3. Scaling to lakhs of users (and beyond)

“Lakhs” of users implies **high read/write throughput**, **spiky traffic**, and **fault isolation**. The architecture supports horizontal scale if you operate it with the right infrastructure:

### Horizontal scaling (stateless application tier)

- Run **multiple instances** of **gateway**, **booking-service**, **vehicle-service**, **payment-service**, **pricing-service**, etc., behind a **load balancer** (e.g. cloud LB, NGINX, Kubernetes Service).
- Keep services **stateless**: session and locks live in **Redis** or **DB**, not in process memory, so new instances can join safely.

### Data layer

- **PostgreSQL**: Use **connection pooling** (the repo’s `infra/docker-compose` includes **PgBouncer** for local practice). In production, pool at the app or sidecar, add **read replicas** for read-heavy paths (listings, search, analytics), and **partition** or **archive** old bookings if tables grow very large.
- **Redis**: Use **Redis Cluster** or a managed cache when pub/sub and cache pressure grow; ensure all services use the same logical **Redis** for notification fan-out.
- **Kafka**: Scale **consumer groups** and **partitions** (e.g. partition by `bookingId` or `userId` for ordering where needed). Backpressure and DLQ patterns (as in payment/booking/invoice consumers) protect under load.

### Async and fan-out

- **Payment completed** → **booking** + **invoice** via Kafka reduces **tight coupling** and allows each consumer to scale to process **lacs of events per day** with more partitions and consumer instances.
- **Notifications** via Redis pub/sub + DB + WebSockets avoid hammering the core booking API for every alert.

### Edge and static assets

- Put the **gateway** behind **TLS termination**, **WAF**, and **rate limits** (the gateway already uses rate limiting in code — tune limits and add IP/user rules in the edge layer for abuse).
- Serve **media** and static content from **object storage + CDN** (media/storage services) so application servers are not in the hot path for large files.

### Observability and operations

- The monorepo includes **OpenTelemetry**-related dependencies at the root; in production, export **traces and metrics** to your APM, add **structured logging** (services use **pino** in many places), and define **SLOs** (e.g. p99 booking create latency, Kafka consumer lag).

### What to add for “very large” production

- **Kubernetes** (or managed containers) for autoscaling and rolling deploys.
- **Idempotency** everywhere money or bookings are concerned (already a theme in payment/booking design).
- **Queue depth monitoring** for Kafka; **Redis memory** and **DB connections** alerts.
- **Regional deployment** if users are geographically distributed (read replicas + CDN + possibly multi-region Kafka — advanced).

---

## 4. Technology stack (summary)

| Layer | Technologies |
|-------|----------------|
| **Runtime** | Node.js (ES modules), **pnpm** workspaces |
| **HTTP APIs** | **Express** 5, **helmet**, **cors**, **compression**, **pino-http** |
| **Data access** | **Prisma** ORM, PostgreSQL |
| **Messaging** | **Kafka** (KafkaJS), **Redis** (ioredis), optional **RabbitMQ** in infra |
| **Real-time** | **Socket.IO** (notification-service) |
| **Validation** | **Zod** |
| **Payments** | Stripe / Razorpay integrations (payment-service) |
| **Infra (local)** | **Docker Compose**: PostGIS, Redis, Kafka, Zookeeper, Elasticsearch, RabbitMQ, PgBouncer (see `infra/docker-compose.yml`) |
| **Observability** | OpenTelemetry packages (root); extend with your exporter in deployment |

---

## 5. Important design choices in this codebase

- **Pricing snapshots** on bookings: once quoted, **billing truth** is tied to stored snapshot + version label — avoids silent price changes on active rentals.
- **Payment events over Kafka**: downstream systems react to **facts** (payment completed) instead of synchronous chains that fail under load.
- **Notification deduplication**: notifications use **dedupe keys** where applicable to reduce duplicate toasts under retries.
- **Gateway path rewriting**: a single public URL space (`/bookings`, `/vehicles`, `/pricing`, …) maps to internal services.

---

## 6. Related docs

- **Runbook / setup:** root **Readme.md** — install, Docker infra, Prisma, ports, E2E scripts.
- **End-to-end flows:** [FLOWS.md](FLOWS.md) — gateway, booking, pricing snapshot, payment → Kafka, notifications.
- **Pricing deep dive:** [PRICING-SERVICE.md](PRICING-SERVICE.md) — rules, tiers, quote steps, snapshot, admin APIs.
- **Pricing admin:** set **`PRICING_ADMIN_API_KEY`** and use `/admin/v1/...` on **pricing-service** (see Readme).

---

*This document describes intent and common patterns; your deployed topology (number of replicas, cluster sizes, and cloud vendor) should follow your org’s capacity planning and security standards.*
