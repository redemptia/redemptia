Label every item under its answer per PROCEDURE.md §5 and §7b, against each attribute's question (never its
name), for Supabase only. `positive`, `negative`, `mixed` or `not_discussed` for attributes; `yes` or `no` for drift.
Record the label, the exact passage that decided it (copied verbatim; empty for not_discussed and drift `no`), and a
one-line rationale for every label other than not_discussed and drift `no`, in labels-template.csv.

## The attributes

- dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- price_value: How does this answer characterise Supabase's pricing and value for money?
- free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- scale: How does this answer characterise Supabase's scalability and reliability under production load?
- realtime: How does this answer characterise Supabase's realtime features?
- auth: How does this answer characterise Supabase's built-in authentication?
- ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A01

```text
Supabase is one of the most popular Backend-as-a-Service (BaaS) platforms, largely because it provides a managed PostgreSQL database with built-in authentication, storage, auto-generated APIs, and real-time subscriptions. 

However, teams switch away for several reasons—such as SQL/RLS complexity, the desire for a lighter single-binary setup, or a preference for a TypeScript-first reactive backend.

Below are the best alternatives categorized by how they approach the problem, followed by the main reasons developers switch away from Supabase.

---

### The Best Supabase Alternatives

#### 1. PocketBase (Best for indie developers & simple apps)
* **Under the hood:** Go + SQLite.
* **What it is:** An open-source backend packaged as a **single executable file**. It includes an embedded database, user auth, file storage, and an admin dashboard.
* **Why pick it:** It requires virtually zero devops. You can deploy it to a $5/month VPS (like Hetzner or DigitalOcean) and easily handle tens of thousands of requests.
* **Drawbacks:** Relies on SQLite by default (though SQLite handles most apps fine, it is not distributed/horizontal by default).

#### 2. Convex (Best for modern, TypeScript-first web apps)
* **Under the hood:** Custom reactive document database and stateful runtime.
* **What it is:** A fully reactive backend where you write your database schema, mutations, and queries purely in TypeScript rather than SQL.
* **Why pick it:** It replaces SQL and ORMs with standard TypeScript functions. Subscriptions are automatic—when database state changes, UI components automatically re-render without manual caching or WebSocket plumbing.
* **Drawbacks:** Proprietary database; you cannot run raw PostgreSQL queries, and migrating away later requires rewriting backend queries.

#### 3. Appwrite (The closest direct open-source BaaS rival)
* **Under the hood:** Microservices architecture built on Docker (supports MariaDB/MySQL).
* **What it is:** A full-featured BaaS offering auth, database, file storage, and serverless Cloud Functions, with both managed cloud and self-hosted options.
* **Why pick it:** Appwrite is built specifically as a Firebase replacement with an abstraction over the database (document-like API) rather than exposing raw PostgreSQL. It has strong multi-platform client SDKs (Flutter, Apple, Android, Web).
* **Drawbacks:** Less raw database power than Postgres; does not offer the same SQL tooling, extensions, or relational indexing flexibility.

#### 4. Firebase (Best for mobile apps & offline-first sync)
* **Under the hood:** Google Cloud infrastructure (NoSQL Firestore / Realtime DB).
* **What it is:** The original BaaS. Supabase was originally created as an alternative to Firebase.
* **Why pick it:** Unbeatable client-side offline persistence and sync on mobile (iOS/Android/Flutter), push notifications (FCM), and deep integration with Google Cloud.
* **Drawbacks:** Proprietary NoSQL database, unpredictable pricing scaling traps if queries are poorly designed, and vendor lock-in.

#### 5. "Decoupled Serverless Postgres" (Neon + Clerk + Drizzle/Prisma)
* **Under the hood:** Serverless Postgres (Neon), specialized auth (Clerk / Auth0), and an ORM.
* **What it is:** Instead of using an all-in-one BaaS, developers assemble best-in-class specialized services.
* **Why pick it:** Neon offers serverless scale-to-zero, instant database branching (create a database copy for every git branch), and avoids Supabase’s all-in-one ecosystem coupling. Clerk offers far more polished auth UI and team/org management.
* **Drawbacks:** You manage multiple services and billing accounts instead of one cohesive dashboard.

#### 6. Nhost (Best for GraphQL + Postgres)
* **Under the hood:** PostgreSQL + Hasura GraphQL engine.
* **What it is:** An open-source BaaS that provides instant GraphQL APIs over Postgres, along with auth and storage.
* **Why pick it:** If your frontend team prefers GraphQL over Supabase's REST/PostgREST-based client.

---

### Why Would Someone Switch Away from Supabase?

Developers usually move away from Supabase due to specific architectural and developer-experience friction points:

1. **Row Level Security (RLS) fatigue:**
   Supabase relies heavily on PostgreSQL RLS to secure data fetched directly from the frontend. While powerful, writing complex authorization logic in SQL policies can become brittle, difficult to debug, hard to unit-test, and a bottleneck for query performance as tables grow.
2. **Coupling the frontend directly to the database:**
   Supabase’s default pattern encourages querying the database directly from client components. Teams often hit a ceiling where business logic (validations, third-party webhooks, audit trails) becomes fragmented across client code, edge functions, and SQL triggers. Many developers eventually prefer a traditional backend API layer (Node/Go/Python).
3. **Database connection limits & serverless quirks:**
   Because Supabase is standard PostgreSQL, scaling connection pools in high-concurrency or serverless environments (e.g., Next.js on Vercel) historically required managing connection poolers (PgBouncer/Supavisor), which can run into session/transaction mode limitations.
4. **Project pausing and pricing tiers:**
   On the free tier, inactive Supabase projects pause after a period of dormancy, causing cold-boot delays. For small pet projects or side hustles, a simple self-hosted PocketBase instance or a serverless setup like Neon/PlanetScale often feels less constrained.
5. **Operational overhead for self-hosting:**
   While Supabase is open-source, its stack consists of more than a dozen microservices (Kong, GoTrue, PostgREST, Realtime, Storage, Postgres, Vector, Studio, etc.). Self-hosting the entire Supabase stack in production is complex compared to single-container solutions like PocketBase or Appwrite.

---

### Quick Recommendation Guide

* If you want **Postgres, but hate writing RLS policies:** Use **Neon + Prisma/Drizzle** behind a standard backend API.
* If you want a **lightweight, cheap, solo-developer app:** Use **PocketBase**.
* If you want a **pure TypeScript, zero-SQL reactive experience:** Use **Convex**.
* If you are building a **cross-platform mobile app with heavy offline sync:** Use **Firebase**.
```

- T001 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T002 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T003 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T004 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T005 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T006 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T007 — realtime: How does this answer characterise Supabase's realtime features?
- T008 — auth: How does this answer characterise Supabase's built-in authentication?
- T009 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T010 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D01 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A02

```text
# Supabase vs Neon

**The short version:** Neon is a serverless Postgres database. Supabase is a backend platform built around Postgres. Which one fits depends mostly on whether you want the extra backend services.

## Core differences

| | **Neon** | **Supabase** |
|---|---|---|
| **Model** | Separated storage and compute | A dedicated Postgres instance per project, sized Nano to 16XL |
| **Idle cost** | Suspended (scaled-to-zero) compute costs $0 | The instance is up whether or not anyone is using it |
| **Branching** | Instant, copy-on-write | Available on paid plans, but migration-based |
| **Extras** | Managed auth, object storage and functions, in beta as of July 2026 | Auth, storage, realtime and edge functions, all generally available |
| **Realtime** | No realtime subscriptions, which is the clearest remaining gap | Built in |

## Pricing

- **Neon:** Billing is usage-based. Launch has no monthly minimum and charges only for what your app uses. Compute runs $0.106 to $0.222 per compute-hour, with storage at $0.35 per GB-month.
- **Supabase:** Pro is a $25 monthly subscription plus an always-on instance for every project you run. Pro includes $10 a month in compute credits covering one Micro instance.
- **Free tiers:** Neon's compute suspends after 5 minutes idle, while Supabase projects pause after 1 week idle. Neon's free plan also allows many more projects, 100 versus Supabase's 2.
- **Which is cheaper:** It depends on load. Neon is cheaper for idle or intermittent databases because it scales to zero. For one always-on production database, Supabase is usually cheaper. A production SaaS with steady traffic converges, because Neon's compute runs continuously and scale-to-zero stops saving you anything.

Treat the specific numbers with caution. The sources disagree on Neon's entry price, giving figures from $5 to about $19 a month. Neon's own comparison guides, which favor Neon, also appear in the results. Check the current pricing pages before you commit.

## When to pick which

**Choose Neon if:**
- You only need Postgres and will bring your own auth and storage.
- You run many small or intermittent projects, such as per-PR preview environments, dev databases or multi-tenant setups.
- You want cheap, fast branching in your workflow.
- You're deploying to serverless or edge platforms like Vercel or Cloudflare.

**Choose Supabase if:**
- You want auth, file storage, realtime and auto-generated APIs from one vendor on one bill.
- You're building a typical full-stack app and want to move fast.
- You want a self-hosting option. Supabase can be self-hosted as the full platform with Docker, while Neon is source only.
- You have steady production traffic, where Neon's scale-to-zero doesn't help.

**Caveats:**
- Supabase Auth relies on RLS policies you write to protect data. That's powerful, but it's a learning curve.
- Using Neon for a full app means adding separate costs for an auth service and object storage, unless you use its newer beta services.

If you tell me your workload (traffic pattern, need for auth or realtime, number of environments), I can give a more specific recommendation.
```

- T011 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T012 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T013 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T014 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T015 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T016 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T017 — realtime: How does this answer characterise Supabase's realtime features?
- T018 — auth: How does this answer characterise Supabase's built-in authentication?
- T019 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T020 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D02 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A03

```text
## Short version

- **Choose Supabase** if you want a batteries-included backend: Postgres + authentication + file storage + realtime + APIs + serverless functions.
- **Choose Neon** if Postgres is the core product and you want serverless scaling, database branching, scale-to-zero, and a more database-focused architecture.

Both provide standard PostgreSQL rather than a proprietary database abstraction, so your SQL, schema, migrations, and most Postgres tooling remain portable. Supabase explicitly provides a full Postgres database, while Neon exposes standard Postgres connection strings and pooling. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai))

| Area | Supabase | Neon |
|---|---|---|
| Primary identity | Backend-as-a-service built around Postgres | Serverless Postgres platform |
| Best for | Full-stack apps needing managed backend primitives | Apps with an existing/custom backend stack |
| Auth | Mature, integrated Supabase Auth | Managed Better Auth is available, but Neon’s historical strength is the database layer |
| File storage | Integrated object storage | Object Storage is now available |
| Realtime | Integrated Realtime product | Realtime exists but is currently marked beta |
| API layer | Auto-generated Data API, REST/GraphQL-oriented tooling | Direct Postgres; Data API is available as an additional product |
| Database branching | Branches can include database, Auth, Storage, APIs, and Edge Functions | Excellent copy-on-write Postgres branches with optional compute endpoints |
| Scaling model | Choose a project compute size; pool connections with Supavisor | Usage-based compute, autoscaling, scale-to-zero, pooled connections |
| Edge/serverless functions | Integrated Deno-compatible Edge Functions | Functions available, but typically you may still use Vercel, Cloudflare, AWS, etc. |
| Pricing shape | More predictable base subscription plus usage/add-ons | More granular usage-based billing |
| Lock-in risk | More if you deeply use Supabase APIs/Auth/Storage/RLS conventions | Lower if you use Neon primarily as ordinary Postgres |

## 1. Architecture and developer experience

### Supabase

Supabase is designed as a unified backend platform. A project includes Postgres plus services built around it:

- Auth
- Storage
- Realtime
- Auto-generated APIs
- Edge Functions
- Database webhooks
- Dashboard tooling
- Row Level Security workflows

Supabase’s own documentation describes Postgres as the foundation for Auth, Storage, Realtime, and Edge Functions. Its Data API also allows frontend applications to interact with the database without maintaining a traditional application server. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai))

This makes Supabase especially convenient for:

- CRUD-heavy SaaS products
- Mobile and frontend-first applications
- Prototypes that need auth and storage quickly
- Apps where database authorization can be expressed cleanly with Postgres RLS

### Neon

Neon is more database-centric. You generally connect to it using normal Postgres drivers, ORMs, SQL tools, and serverless-compatible connection methods. It offers connection pooling and a serverless driver for environments such as edge and serverless runtimes. ([neon.tech](https://neon.tech/docs/connect/connection-pooling))

Neon is a natural fit when you already use:

- Next.js, Remix, Rails, Django, Laravel, or a custom API
- Prisma, Drizzle, SQLAlchemy, ActiveRecord, or another ORM
- Separate providers for auth, storage, queues, and background jobs
- A conventional backend that should own authorization and business logic

## 2. Scaling and serverless workloads

### Neon’s advantage: elastic compute

Neon’s main architectural differentiator is separating database storage from compute. Its current pricing supports usage-based compute, autoscaling, and scale-to-zero. On the free plan, compute can scale to zero after inactivity; paid plans can also configure scale-to-zero behavior. ([neon.tech](https://neon.tech/pricing))

That is useful for:

- Preview environments
- Development databases
- Infrequently used internal tools
- Highly variable workloads
- Applications deployed on serverless platforms

The tradeoff is that scaling from zero can introduce a wake-up delay, so you should test latency-sensitive endpoints rather than assuming scale-to-zero is always desirable.

### Supabase’s advantage: integrated capacity and pooling

Supabase gives each project its own Postgres instance and lets you select compute capacity. It provides Supavisor pooling, including transaction pooling for serverless or edge workloads. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

Supabase is often simpler when your application uses many Supabase services, because Auth, Storage, Realtime, API access, and database connectivity are managed in the same project. The tradeoff is that the platform is less purely “pay only for active database compute” than Neon.

## 3. Database branching

Both have strong branching, but they optimize for different things.

### Neon: best for database-centric preview environments

Neon branches are copy-on-write clones of a database. You can create a branch from production, attach a dedicated compute endpoint, run tests, and delete it afterward. Neon exposes this through both the console and API, making it convenient to automate one database per pull request. ([api-docs.neon.tech](https://api-docs.neon.tech/reference/createprojectbranch?utm_source=openai))

This is one of Neon’s strongest features.

### Supabase: broader environment branches

Supabase branches can include more than the database: separate API credentials, Auth settings, Storage buckets, Realtime configuration, and deployed Edge Functions. That makes a Supabase branch closer to a full backend preview environment rather than merely a Postgres clone. ([supabase.com](https://supabase.com/docs/guides/deployment/branching?utm_source=openai))

Choose:

- **Neon** for fast, database-focused branching
- **Supabase** when your preview environment must include Supabase services too

## 4. Auth, APIs, storage, and realtime

### Supabase is usually stronger out of the box

Supabase has a cohesive model for:

- User authentication
- JWTs and sessions
- RLS policies
- Browser-to-database access
- File buckets and object permissions
- Realtime database changes
- Edge Functions

For a small team, this can eliminate substantial integration work.

### Neon is more modular

Neon now lists managed authentication, object storage, functions, and realtime among its backend offerings, but the platform’s core differentiator remains serverless Postgres and branching. Realtime is currently labeled beta in its pricing materials. ([neon.tech](https://neon.tech/pricing))

If you want to choose Clerk/Auth0, S3/R2, Ably/Pusher, Inngest, Trigger.dev, Vercel Functions, or your own services independently, Neon fits that architecture well.

## 5. Security and authorization

Supabase is particularly attractive if you want database-level authorization. Its recommended model is to expose controlled database access through the Data API and enforce permissions with Postgres Row Level Security. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai))

That can be excellent for frontend-heavy apps, but it also means:

- You need to understand RLS deeply.
- Poor policies can create security vulnerabilities.
- Complex business workflows may be easier in a backend service.

With Neon, authorization is more commonly handled by your application server, although Neon also supports Postgres RLS. ([neon.tech](https://neon.tech/docs/introduction/branching))

A useful rule:

- **Frontend directly querying data?** Supabase is often easier.
- **Backend owns all data access?** Neon is often cleaner.

## 6. Pricing

Current entry-level pricing differs materially:

- Supabase Pro starts at **$25/month**, with included project resources and additional usage-based charges. Its free projects can be paused after one week of inactivity. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))
- Neon has a **$0 free tier** with usage limits, and its paid plans are usage-based. Its Launch plan lists compute at **$0.106 per CU-hour** and storage at **$0.35 per GB-month**; Neon advertises a typical Launch spend of about **$15/month**, depending on usage. ([neon.tech](https://neon.tech/pricing))

Do not compare only the headline price. Estimate:

- Database compute hours
- Storage
- Egress
- Number of preview branches
- Auth users
- File storage
- Realtime messages/connections
- Function invocations
- Backups and log retention

In general:

- **Small always-on production app:** Supabase’s fixed Pro baseline may be easier to budget.
- **Spiky, intermittent, or many-preview-environment workloads:** Neon’s usage-based model may be more economical.
- **App needing auth, storage, and realtime:** Supabase may reduce the number of paid third-party services.

## 7. Portability and lock-in

Both are relatively portable at the PostgreSQL layer.

You can generally migrate:

- Tables
- Indexes
- SQL functions
- Extensions
- Data
- ORM schemas
- Most migrations

The main lock-in comes from platform-specific features:

### Supabase-specific coupling

- Supabase Auth
- Supabase Storage
- Supabase Realtime
- Supabase-generated APIs
- Supabase-specific auth/RLS conventions
- Edge Functions and project configuration

### Neon-specific coupling

- Neon branching workflows
- Neon-specific serverless driver usage
- Neon compute/storage behavior
- Neon-specific extensions or integrations

If you use Neon as “just Postgres,” migration is relatively straightforward. If you use Supabase as a full backend, migration is still possible but involves replacing more services.

## My practical recommendation

### Pick Supabase when:

- You want to ship a product quickly with minimal backend infrastructure.
- You need built-in Auth, Storage, Realtime, and APIs.
- You want frontend applications to query Postgres through RLS.
- Your app is CRUD-heavy or mobile-focused.
- You prefer one integrated dashboard and billing account.

### Pick Neon when:

- You already have, or plan to build, a conventional backend.
- You care about scale-to-zero and usage-based database costs.
- Preview databases and copy-on-write branching are central to your workflow.
- You want Postgres to remain an infrastructure component rather than the entire backend platform.
- You want to choose auth, storage, queues, and compute independently.

### Default choice

For a typical new full-stack SaaS built by a small team, I would start with **Supabase** unless there is a specific reason to prefer Neon’s serverless database architecture.

For a Next.js/Rails/Django/etc. application where the backend already owns authentication and business logic, I would lean toward **Neon**.
```

- T021 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T022 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T023 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T024 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T025 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T026 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T027 — realtime: How does this answer characterise Supabase's realtime features?
- T028 — auth: How does this answer characterise Supabase's built-in authentication?
- T029 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T030 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D03 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A04

```text
The best alternative depends on which part of Supabase you're replacing. Supabase bundles Postgres, auth, auto-APIs, storage, and realtime, so the answer changes depending on which of those you care about.

## Top alternatives

**Full backend platforms (closest to Supabase)**
- **Firebase** is Google's NoSQL-first platform. It uses a Firestore document model optimized for mobile, offline-first apps and real-time sync. It's the best fit for mobile and real-time apps.
- **Appwrite** is open source with Docker-based self-hosting. One review calls it the closest like-for-like BaaS replacement, with an always-on free tier and a self-hostable option.
- **Nhost** builds on PostgreSQL and pairs it with Hasura for instant GraphQL APIs. It suits GraphQL-first teams.
- **Convex** is popular with teams that want a TypeScript-first workflow. Its migration difficulty is rated high, because its data model is a custom document store rather than Postgres.
- **PocketBase** is a single binary with zero dependencies, with auth, database, and file storage. It suits solo developers, prototypes, and side projects.

**If you only need the database**
- **Neon** is pure PostgreSQL infrastructure with no auth, storage, or APIs. It offers branching and scale-to-zero. Databricks acquired it in 2025, and it still runs as a standalone service.
- Plain managed Postgres, such as AWS RDS or DigitalOcean, is another option.
- **CockroachDB** is PostgreSQL-compatible but distributed by design, which helps if you need multi-region availability with automatic failover.

**If you only need auth**
- Options include Clerk, Auth.js, Better Auth, and Keycloak. SuperTokens is the closest fit if you want lighter authentication without Postgres lock-in. ZITADEL, Authentik, or Keycloak suit a fuller identity platform.

**Other options**
- **Directus** connects to existing SQL databases and generates REST and GraphQL APIs with a no-code admin interface.
- **Self-hosted Supabase** gives the same features on your own servers if control is the only issue.

## Why people switch

1. **Free-tier pausing.** Supabase's free tier pauses after seven days of inactivity. Firebase's Spark plan, Neon's free Postgres tier, and Appwrite Cloud's free plan are always-on alternatives.
2. **You only need part of the bundle.** If you just want Postgres, Neon is a simpler and often cheaper choice, with no bundle overhead.
3. **Self-hosting or control.** Appwrite and PocketBase come up most often here. Self-hosting Appwrite, Nhost, or PocketBase is effectively free apart from server costs.
4. **Cost.** PocketBase is cited as the cheapest option, running free on a ~$5 VPS.
5. **Auth and authorization limits.** Supabase Auth becomes harder to scale when authorization logic grows beyond straightforward RLS policies. Some teams move to a dedicated auth or authorization layer instead of leaving entirely.
6. **Different developer model.** Teams that prefer GraphQL (Nhost, Hasura), TypeScript-native reactivity (Convex), or NoSQL (Firebase) may find Supabase's Postgres-and-SQL approach a poor fit.

## Caveats
- **Switching away from Postgres is costly.** Moving to Firebase or Convex is rated as a high-difficulty migration. Nhost, Neon, and Directus are easier because they stay on SQL or Postgres.
- **Supabase is still strong in some cases.** One comparison found it still wins when you need auth, storage and realtime alongside your vectors.
- **The sources are mostly vendor and affiliate blogs.** Some of these lists are written by companies selling their own alternatives, so check pricing and features against each vendor's own docs.

## Quick picks
- Mobile app with real-time sync: **Firebase**
- Open source and self-hosted: **Appwrite**
- Small project or MVP: **PocketBase**
- Staying on Postgres, database only: **Neon**
- GraphQL: **Nhost** or **Hasura**
- TypeScript and reactive apps: **Convex**

If you tell me your stack, scale, and what's frustrating you about Supabase, I can narrow this to one or two options.
```

- T031 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T032 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T033 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T034 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T035 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T036 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T037 — realtime: How does this answer characterise Supabase's realtime features?
- T038 — auth: How does this answer characterise Supabase's built-in authentication?
- T039 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T040 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D04 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A05

```text
**Short answer:** Choose Supabase for most web apps and SaaS products. Choose Firebase for mobile-first apps that need offline sync, push notifications, or heavy real-time features. Most 2026 comparisons I found reach the same conclusion.

## Pick Supabase if...
- **Your data is relational.** Supabase uses PostgreSQL with tables and relations, native joins, full schema enforcement, and full ACID transactions. Firestore doesn't support joins, so you have to denormalize your data.
- **You want portability.** Supabase can be self-hosted because it's open source. Firebase can't. Because it's standard Postgres, you can move away from it later.
- **Security matters.** Row-level security policies are enforced at the database level. Every query goes through the same check, whether it comes from your app, a cron job, or a direct SQL connection.
- **You want predictable costs.** Supabase has a free plan, then Pro at $25/month per organization and Team at $599/month. Firebase bills per operation. One source estimates 10K DAU and 10M reads/day costs about $50–100/mo on Supabase versus about $500–1,500/mo on Firebase. That's a single blogger's estimate, so check it against your own workload.
- **You're building AI features.** Supabase offers pgvector for vector search on Postgres.

## Pick Firebase if...
- **You're building a mobile-first app.** Firebase ships native SDKs, automatic offline sync, push notifications, and crash analytics that Supabase leaves you to assemble from third-party tools.
- **Real-time is the core feature.** For chat, collaboration, or live gaming, Firebase is still the better choice. If real-time is only a nice-to-have, such as notifications or dashboards, Supabase is adequate.
- **You're already in Google's ecosystem** (Analytics, Crashlytics, FCM, Gemini) or need to prototype very quickly. One comparison says Firebase wins on speed for MVPs and hackathons.
- **Your data is simple and document-shaped.**

## Things to know
- Firebase has been closing the SQL gap. It now offers Data Connect, which runs PostgreSQL on Cloud SQL. If lock-in to NoSQL is your main worry, that's worth a look.
- Supabase has a steeper learning curve if you're new to SQL. Firebase is quicker to start with but can bring NoSQL quirks later.
- Neither is universally better. Your data shape and platform matter more than the brand.

## Quick rule of thumb
| Your project | Choose |
|---|---|
| SaaS, e-commerce, dashboards, internal tools | Supabase |
| Next.js or other web app with relational data | Supabase |
| Native iOS/Android app with offline use and push | Firebase |
| Chat or collaborative app | Firebase |
| You need to self-host or avoid lock-in | Supabase |

If you tell me what you're building (platform, data model, expected scale), I can give a more specific recommendation.
```

- T041 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T042 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T043 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T044 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T045 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T046 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T047 — realtime: How does this answer characterise Supabase's realtime features?
- T048 — auth: How does this answer characterise Supabase's built-in authentication?
- T049 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T050 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D05 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A06

```text
There isn’t one universally better replacement for Supabase. The right alternative depends on **what you like—or dislike—about Supabase**: PostgreSQL, authentication, realtime, self-hosting, serverless functions, or the all-in-one model.

Supabase itself is essentially a managed PostgreSQL platform bundled with Auth, Storage, Realtime, APIs, and Edge Functions. ([supabase.com](https://supabase.com/features?utm_source=openai))

## Best alternatives

| Alternative | Best for | Why switch from Supabase? |
|---|---|---|
| **Firebase** | Mobile apps, offline-first apps, Google ecosystem | Better mobile SDKs, offline synchronization, push notifications, analytics, Crashlytics, and deep Google Cloud integration |
| **Appwrite** | Open-source/self-hosted BaaS | More explicit self-hosting and data-control story, broad built-in services, and a permissions model that may feel simpler than PostgreSQL RLS |
| **Convex** | Realtime React/TypeScript applications | Reactive queries and server functions are more integrated; less SQL, API, and cache-management work |
| **Neon + separate services** | Teams that mainly want Postgres | More focused database experience, branching, scale-to-zero, and freedom to choose Auth, storage, APIs, and hosting independently |
| **Hasura** | GraphQL-heavy systems and existing databases | Instant GraphQL APIs, fine-grained authorization, and the ability to sit on top of existing Postgres or other databases |
| **PocketBase** | Small apps, prototypes, private deployments | Extremely lightweight, self-contained, and easy to run on a single server—but not ideal for critical production systems yet |
| **Cloud-native stack** | Larger teams with infrastructure expertise | Use RDS/Cloud SQL/Aurora plus S3, Redis, an auth provider, and your own API for maximum control and fewer platform constraints |

## 1. Firebase: best for mobile and Google Cloud

Firebase is usually the strongest Supabase alternative for **mobile applications**. It provides Authentication, Firestore, Realtime Database, Cloud Functions, Storage, Hosting, App Check, and other mobile-oriented services. ([firebase.google.com](https://firebase.google.com/products-build?utm_source=openai))

Choose Firebase when you need:

- Excellent Android, iOS, Flutter, and web SDKs
- Offline-first data synchronization
- Push notifications and mobile analytics
- Crashlytics, App Check, and other Google services
- Global scale with minimal infrastructure management

The main reason **not** to switch is that Firestore is document-oriented rather than PostgreSQL-based. Complex relational queries, joins, reporting, and SQL-heavy workloads may be more natural in Supabase.

**Typical reason to switch:** “Our app is mobile-first and we want Firebase’s mobile ecosystem more than we want SQL.”

## 2. Appwrite: best open-source, self-hostable BaaS

Appwrite is the closest conceptual competitor to Supabase. It offers authentication, databases, storage, functions, messaging, realtime features, hosting, and SDKs. It can run in Appwrite Cloud or be self-hosted with Docker or Kubernetes. ([appwrite.io](https://appwrite.io/docs?utm_source=openai))

Choose Appwrite when you want:

- A more visibly self-hosting-oriented platform
- Control over data location and infrastructure
- Built-in Auth, Storage, Functions, and Realtime
- A permissions model based around users, teams, labels, tables, rows, buckets, and files
- Less dependence on PostgreSQL-specific concepts such as RLS

Appwrite now supports several database approaches, including its managed APIs as well as native managed PostgreSQL and MySQL options. ([appwrite.io](https://appwrite.io/docs/products/databases?utm_source=openai))

The trade-off is that self-hosting Appwrite means owning upgrades, backups, scaling, email/SMS configuration, and operational reliability. Appwrite explicitly notes that self-hosting can cost more once engineering time is included. ([appwrite.io](https://appwrite.io/docs/advanced/self-hosting?utm_source=openai))

**Typical reason to switch:** “We need a Supabase-like backend but want to run it ourselves or control where the data lives.”

## 3. Convex: best for highly interactive TypeScript apps

Convex is a good choice for collaborative, realtime applications where the database, backend functions, and reactive client queries should feel like one system. Its realtime database tracks query dependencies and updates clients when relevant data changes. ([convex.dev](https://www.convex.dev/faq?utm_source=openai))

Choose Convex when you want:

- Realtime queries without manually wiring subscriptions
- TypeScript-defined queries, mutations, and actions
- A simpler alternative to designing REST or GraphQL APIs
- Authorization in application code rather than PostgreSQL RLS
- A strong React/TypeScript developer experience

Convex’s authentication story is somewhat different: it commonly integrates with providers such as Clerk, WorkOS, Auth0, or another OpenID Connect provider. Its built-in Convex Auth library is still described as beta in the documentation. ([docs.convex.dev](https://docs.convex.dev/auth/overview?utm_source=openai))

**Typical reason to switch:** “Supabase gives us primitives, but we want a more opinionated reactive backend with less API plumbing.”

## 4. Neon plus other services: best if you mainly want Postgres

Neon is not a full Supabase replacement by itself. It is primarily a serverless PostgreSQL platform, typically paired with services such as Clerk or Auth0 for authentication, S3 or R2 for files, and Vercel, Cloudflare, or another provider for application logic.

Neon is attractive because it offers:

- Standard PostgreSQL connectivity
- Database branching for development, testing, and preview environments
- Autoscaling and scale-to-zero options
- A more focused database product rather than a bundled backend platform

Neon describes its architecture as separating storage and compute, with database branches that can be created quickly and isolated from one another. ([github.com](https://github.com/neondatabase/neon?utm_source=openai))

Switch to Neon when Supabase’s extra services feel like coupling rather than convenience.

**Typical reason to switch:** “We want Postgres, but we want to choose the rest of the stack ourselves.”

This is particularly compelling for teams already using:

- Drizzle, Prisma, or another ORM
- Clerk, Auth0, WorkOS, or custom auth
- S3-compatible object storage
- Vercel, Cloudflare, AWS, or Kubernetes
- CI/CD workflows that benefit from per-branch databases

## 5. Hasura: best for GraphQL and existing databases

Hasura is primarily an API and data-access layer. It can expose PostgreSQL and other data sources through GraphQL, with permissions defined at table, role, operation, row, and column levels. ([hasura.io](https://hasura.io/docs/2.0/auth/authorization/permissions/?utm_source=openai))

Choose Hasura when you need:

- GraphQL rather than Supabase’s REST-first experience
- A GraphQL layer over an existing database
- Multiple databases or remote schemas
- Fine-grained authorization rules
- A backend that integrates with an existing enterprise architecture

Hasura is less of a turnkey replacement for Supabase because you may still need separate providers for authentication, file storage, background jobs, and hosting.

**Typical reason to switch:** “Our frontend and data architecture are GraphQL-centric, and Supabase’s generated REST API isn’t the right abstraction.”

## 6. PocketBase: best for small, simple, self-hosted apps

PocketBase is a compact open-source backend built around SQLite, with built-in authentication, realtime subscriptions, a dashboard, and a REST-like API. ([pocketbase.io](https://pocketbase.io/docs/?utm_source=openai))

Choose it for:

- Internal tools
- Prototypes
- Small SaaS products
- Local or private deployments
- Apps that can run on one modest server
- Projects where simplicity matters more than horizontal scale

However, PocketBase’s own documentation warns that it is still pre-1.0 and is not recommended for production-critical applications unless you are comfortable handling occasional manual migration work. ([pocketbase.io](https://pocketbase.io/docs/?utm_source=openai))

**Typical reason to switch:** “Supabase is more platform than we need; we want one small binary and a local database.”

## When switching is actually worthwhile

Someone would generally switch from Supabase for one of these reasons:

1. **They do not want PostgreSQL.**  
   Firebase or another document-oriented backend may fit a mobile or event-driven data model better.

2. **They need self-hosting or stronger data control.**  
   Appwrite, PocketBase, or a custom stack may be preferable.

3. **They want less backend plumbing.**  
   Convex offers a more integrated reactive programming model.

4. **They want only managed Postgres.**  
   Neon avoids adopting Supabase’s Auth, Storage, Realtime, and Functions as a single package.

5. **They need GraphQL as the primary API.**  
   Hasura may be a better fit.

6. **They need deeper mobile services.**  
   Firebase has a broader mobile ecosystem, particularly around push notifications, analytics, crash reporting, and offline behavior.

7. **They are concerned about platform coupling.**  
   A modular stack—Postgres plus independent Auth, storage, and compute providers—can make future migrations easier, though it adds integration and operational work.

## Practical recommendation

- **Choose Supabase** if you want managed PostgreSQL plus Auth, Storage, Realtime, and APIs in one product.
- **Choose Firebase** for mobile-first, offline-heavy applications.
- **Choose Appwrite** if self-hosting and open-source control are priorities.
- **Choose Convex** for realtime TypeScript applications with a small team.
- **Choose Neon plus separate services** if PostgreSQL is the main thing you want.
- **Choose Hasura** if GraphQL is central to your architecture.
- **Choose PocketBase** for small, simple, self-hosted projects—not high-risk production systems.

For most teams, the strongest Supabase alternatives are **Appwrite**, **Firebase**, and **Neon plus a modular stack**. Convex is the most compelling choice when the application is deeply realtime and TypeScript-centric.
```

- T051 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T052 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T053 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T054 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T055 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T056 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T057 — realtime: How does this answer characterise Supabase's realtime features?
- T058 — auth: How does this answer characterise Supabase's built-in authentication?
- T059 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T060 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D06 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A07

```text
**Supabase** is an open-source Backend-as-a-Service (BaaS) platform built around **PostgreSQL**, designed as an open-source alternative to Firebase. It provides an instant backend with authentication, database storage, file storage, edge functions, and real-time subscriptions.

Here is a breakdown of the major pros and cons of using Supabase:

---

### **Pros (Strengths)**

1. **Powered by Full PostgreSQL**
   * Unlike Firebase (which uses NoSQL document databases like Firestore), Supabase provides a full, production-grade relational PostgreSQL database.
   * You get native support for complex joins, foreign keys, triggers, ACID compliance, and standard SQL.
   * Access to the vast PostgreSQL extension ecosystem, such as **PostGIS** (geospatial queries) and **pgvector** (vector embeddings for AI/LLM applications).

2. **No Vendor Lock-In & Open Source**
   * Because it is built on standard PostgreSQL and open-source tools (like PostgREST and GoTrue), you can export your database at any time and run it on AWS RDS, DigitalOcean, or your own server.
   * The entire Supabase stack can be self-hosted via Docker.

3. **Row-Level Security (RLS)**
   * Access control is enforced directly inside the database engine using Postgres RLS.
   * This means security rules apply regardless of how data is accessed (REST, GraphQL, or direct SQL), reducing the risk of accidentally exposing endpoints in client-side code.

4. **Auto-Generated APIs & Great Developer Experience (DX)**
   * Supabase automatically generates RESTful APIs and GraphQL endpoints from your database schema using PostgREST.
   * Excellent TypeScript support: you can run CLI commands (e.g., `supabase gen types typescript`) to generate end-to-end type safety directly from your database schema.

5. **All-in-One Platform**
   * Includes built-in **Authentication** (OAuth providers, email magic links, phone auth), **Storage** (S3-compatible bucket storage), **Edge Functions** (Deno-based serverless functions), and **Realtime** subscriptions over WebSockets.

6. **Predictable Pricing & Generous Free Tier**
   * Supabase prices primarily by compute size, database storage, and egress, rather than charging per individual document read/write (a common source of surprise bills with Firebase Firestore).

---

### **Cons (Trade-offs & Limitations)**

1. **Steep Learning Curve for RLS & SQL**
   * Writing complex Row-Level Security policies in SQL requires a solid understanding of database permissions. 
   * Poorly written RLS policies (e.g., querying unindexed subqueries on every row check) can severely degrade query performance and cause latency spikes.

2. **Self-Hosting Complexity**
   * While Supabase is technically self-hostable, running the full stack yourself involves managing dozens of interconnected Docker containers and microservices (Kong gateway, GoTrue auth, PostgREST, Realtime server, Storage API, Studio, etc.). Maintaining and upgrading it yourself requires non-trivial DevOps effort.

3. **Free Tier Project Pausing**
   * Projects on the free tier automatically **pause after a week of inactivity**. Restoring a paused project can take several minutes, which makes the free tier unsuitable for low-traffic production apps or portfolio demos that need 100% availability.

4. **Smaller Mobile/App Ecosystem Compared to Firebase**
   * Firebase is tightly integrated with Google’s mobile ecosystem (Crashlytics, Firebase Cloud Messaging, Google Analytics, Remote Config, App Check).
   * Supabase focuses purely on the backend data layer; for push notifications, crash reporting, or mobile analytics, you must integrate separate third-party services (e.g., OneSignal, Sentry, PostHog).

5. **Vertical Scaling / Compute Bottlenecks**
   * Unlike serverless document stores that scale infinitely out of the box, Supabase assigns you a dedicated PostgreSQL instance.
   * If your app experiences sudden massive traffic spikes, your database can hit CPU/memory limits or connection pool exhaustion unless you have adequately provisioned compute and connection pooling (PgBouncer/Supavisor).

---

### **Summary: When should you use it?**

* **Choose Supabase if:**
  * Your data is relational or benefits from SQL queries and joins.
  * You are building AI apps and want to store vector embeddings close to your business data (`pgvector`).
  * You prioritize data portability and want to avoid vendor lock-in.
  * You are building web apps (Next.js, SvelteKit, Nuxt, etc.) where TypeScript type generation dramatically accelerates development.

* **Look elsewhere (e.g., Firebase, DynamoDB) if:**
  * Your data model is strictly unstructured and changes wildly without schema constraints.
  * You need a turnkey mobile platform that includes crash reporting, push notifications, and analytics out of the box.
  * You do not want to manage SQL migrations or optimize relational indexes.
```

- T061 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T062 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T063 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T064 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T065 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T066 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T067 — realtime: How does this answer characterise Supabase's realtime features?
- T068 — auth: How does this answer characterise Supabase's built-in authentication?
- T069 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T070 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D07 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A08

```text
While both **Supabase** and **Neon** give you standard PostgreSQL under the hood, they have fundamentally different philosophies and scopes:

* **Neon** is a **Serverless Postgres database**. It focuses purely on modernizing the Postgres engine itself (separation of storage and compute, instant database branching, scale-to-zero, and autoscaling).
* **Supabase** is a **Backend-as-a-Service (BaaS)** built on top of Postgres. Often called the open-source Firebase alternative, it provides a full suite of application infrastructure: Auth, File Storage, Realtime subscriptions, Edge Functions, and auto-generated APIs.

---

### Key Comparison Dimensions

| Dimension | Neon | Supabase |
| :--- | :--- | :--- |
| **Primary Identity** | Serverless Postgres database | Full Backend Platform (BaaS) |
| **Scope** | Just the database layer | Database + Auth + Storage + Realtime + Functions |
| **Compute Architecture** | Decoupled compute & storage; scale-to-zero; compute autoscaling | Dedicated/virtual instance per project; persistent compute (free tier pauses on inactivity) |
| **Database Branching** | Native, instant copy-on-write branches (like Git for your database) | Available via Supabase branching (backed by migrations or separate DBs), but not copy-on-write storage-level |
| **Application Ecosystem** | Bring Your Own (Auth, Storage, APIs) | Built-in (Supabase Auth, S3-compatible Storage, PostgREST) |
| **Best with ORMs?** | Excellent (Prisma, Drizzle, Kysely) | Supported, but often paired with Supabase Client SDK / RLS |
| **Connection Pooling** | Native pooling built-in; custom WebSocket driver for Edge runtimes | Native Supavisor connection pooler |
| **Realtime** | Logical replication streams (requires external tools) | Built-in Realtime engine (Postgres changes over WebSockets) |

---

### Deep Dive into Key Differences

#### 1. Architecture: Serverless vs. Instance-Based
* **Neon’s Core Innovation:** Neon splits Postgres into a stateless compute node and custom distributed storage. This allows compute nodes to spin up in milliseconds, autoscale CPU/RAM on demand, and shut down completely (**scale to zero**) when idle.
* **Supabase’s Model:** Supabase provisions a standard Postgres instance. Even on modest plans, the compute is always on (unless paused on the free tier after inactivity). Scaling compute requires upgrading the instance size rather than dynamic, request-by-request autoscaling.

#### 2. Database Branching & CI/CD
* **Neon:** Branching is its headline feature. Because storage is copy-on-write, you can create an isolated copy of a multi-terabyte production database in seconds without copying data. This allows you to spin up a dedicated database branch for every pull request/preview deployment, run migrations safely, and destroy it when closed.
* **Supabase:** Offers preview environments and branching integrated with GitHub, but it handles branching by replaying migrations into new environments rather than instant, point-in-time copy-on-write data snapshots.

#### 3. The Application Layer & Lock-in
* **Supabase:** Gives you a complete backend out of the box. If you don't want to build your own authentication system, set up AWS S3, or wire up WebSockets for real-time notifications, Supabase handles it all. You can query the database directly from frontend clients using Row Level Security (RLS) policies.
  * *Trade-off:* Your application becomes tightly coupled to Supabase's APIs, SDKs, and auth patterns.
* **Neon:** Neon does not attempt to handle your application layer. You use standard Postgres drivers or ORMs (Drizzle, Prisma) and assemble your own stack (e.g., Clerk or Auth0 for authentication, AWS S3/Cloudflare R2 for storage).
  * *Trade-off:* More glue code to set up initially, but zero lock-in beyond standard Postgres.

#### 4. Serverless & Edge Workflows
* **Neon:** Built from day one for modern Jamstack and serverless frameworks (Vercel, Cloudflare Workers, AWS Lambda). Neon offers a serverless driver over HTTP/WebSockets that avoids connection exhaustion without relying on long-lived TCP connections.
* **Supabase:** Uses **Supavisor** (their internal connection pooler) to handle high-concurrency serverless connections reliably. It also includes Edge Functions (Deno-based) integrated directly into the dashboard.

---

### When to Choose Supabase

* **You want an all-in-one backend:** You are building an MVP, SaaS, or mobile app and want Auth, File Uploads, and Database with minimal third-party integrations.
* **You need Realtime features:** You are building collaborative tools, chat apps, or live dashboards where the frontend needs to react immediately to database changes.
* **You prefer client-first development:** You want to query the database directly from web/mobile clients via the Supabase SDK, relying on Postgres RLS for security.
* **You want a rich administrative UI:** Supabase Studio offers a polished table editor, SQL editor, and visual permission manager.

---

### When to Choose Neon

* **You already have your stack planned:** You prefer using dedicated tools like Clerk for auth, S3/R2 for storage, and Drizzle/Prisma for your data layer.
* **You need database branching for CI/CD:** You want ephemeral, data-complete database environments attached to PR preview deployments (e.g., pairing Neon with Vercel or GitHub Actions).
* **You have spiky, intermittent traffic:** Neon's scale-to-zero and dynamic compute autoscaling make it much more cost-effective for internal tools, development branches, or variable workloads.
* **You want pure Postgres without platform overhead:** You don't want or need PostgREST, custom client SDKs, or bundled BaaS components—just a modern, high-performance database.
```

- T071 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T072 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T073 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T074 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T075 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T076 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T077 — realtime: How does this answer characterise Supabase's realtime features?
- T078 — auth: How does this answer characterise Supabase's built-in authentication?
- T079 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T080 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D08 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A09

```text
Supabase is a hosted backend platform built around **PostgreSQL**, with built-in authentication, file storage, realtime subscriptions, auto-generated APIs, and server-side Edge Functions. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai))

## Pros

### 1. Excellent developer velocity

You get a database, REST/GraphQL APIs, authentication, storage, realtime features, and server-side functions in one platform. This can eliminate a lot of backend setup for prototypes, internal tools, SaaS products, and mobile apps. ([supabase.com](https://supabase.com/docs?utm_source=openai))

### 2. Real PostgreSQL—not a proprietary database abstraction

Each project includes a full Postgres database, so you can use SQL, joins, foreign keys, indexes, transactions, extensions, database functions, and standard Postgres tools. This is a major advantage over platforms built around more restrictive NoSQL models. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai))

### 3. Strong data-access model with Row Level Security

Postgres Row Level Security lets you define policies such as “users can only read their own records” directly in the database. When configured properly, this can provide a robust security boundary for frontend applications. ([supabase.com](https://supabase.com/docs/guides/database/secure-data?utm_source=openai))

### 4. Good built-in authentication

Supabase Auth supports email/password, passwordless login, OAuth providers, phone login, and other authentication workflows. It also integrates with database authorization through user identity and RLS policies. ([supabase.com](https://supabase.com/docs?utm_source=openai))

### 5. Realtime functionality is convenient

Realtime database changes, broadcast messaging, and presence features are available without building your own WebSocket infrastructure. This is useful for chat, collaborative interfaces, notifications, dashboards, and multiplayer-style features. ([supabase.com](https://supabase.com/docs?utm_source=openai))

### 6. Reasonable portability

Because the core database is Postgres and Supabase supports self-hosting, it is generally less restrictive than a fully proprietary backend service. You can connect using normal Postgres tooling and potentially migrate the database elsewhere. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai))

### 7. Useful developer tooling

The dashboard, SQL editor, CLI, migrations, local development stack, and preview branching can make database-backed development easier—particularly for teams using Git-based workflows. Branching is available on the Pro plan. ([supabase.com](https://supabase.com/docs/guides/deployment?utm_source=openai))

### 8. Open-source and self-hosting options

Self-hosting can be useful for organizations that need greater control over infrastructure, data location, or compliance. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai))

## Cons

### 1. Row Level Security has a real learning curve

Supabase makes it easy to expose database access to client applications, but that also means security depends heavily on correctly designed RLS policies. A table without appropriate RLS can allow clients to access or modify data they should not see. ([supabase.com](https://supabase.com/docs/guides/deployment/going-into-prod?utm_source=openai))

This is one of the biggest practical risks: Supabase can feel simple at first, but secure production authorization requires a solid understanding of Postgres roles, policies, JWT claims, and database permissions.

### 2. It is still a database platform, not a complete application server

For straightforward CRUD applications, Supabase is excellent. More complex business logic may require a mixture of database functions, Edge Functions, an external backend, queues, or workers. Edge Functions are intended for relatively short-lived operations; Supabase notes that cold starts are possible and heavy long-running jobs should be moved to background workers. ([supabase.com](https://supabase.com/docs/guides/functions?utm_source=openai))

### 3. Database scaling requires database expertise

As traffic grows, you may need to manage indexes, query plans, connection pooling, replicas, caching, transactions, and database connection limits. Supabase provides pooling, but the underlying Postgres connection limits still apply, and Supabase’s own services consume connections too. ([supabase.com](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits?utm_source=openai))

### 4. Pricing can become less predictable at scale

Supabase pricing combines plan fees, compute costs, and usage-based quotas such as database size, storage, egress, active users, realtime messages, connections, and function invocations. Projects also incur compute costs independently of database usage. ([supabase.com](https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=openai))

For a small app, this may be inexpensive. For a high-traffic app with lots of file downloads, realtime traffic, or many users, you need to monitor usage carefully.

### 5. Edge Functions are Deno/TypeScript-oriented

Supabase Edge Functions use a Deno-compatible, TypeScript-first runtime. That is convenient for JavaScript/TypeScript teams, but less ideal if your backend is primarily Python, Go, Java, or .NET, or if you need a traditional long-running server process. ([supabase.com](https://supabase.com/docs/guides/functions?utm_source=openai))

### 6. Some platform features may not be portable

The Postgres data itself is relatively portable, but Supabase-specific features—Auth, Storage metadata, Realtime configuration, Edge Functions, generated APIs, and RLS conventions—can require migration work. Self-hosting also lacks some managed-platform features, including managed backups/PITR, branching, advanced metrics, and the Management API. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai))

### 7. Self-hosting removes much of the convenience

Self-hosting gives you control, but you become responsible for server maintenance, security hardening, upgrades, high availability, scaling, backups, disaster recovery, monitoring, and uptime. Self-hosted deployments are also community-supported rather than equivalent to the fully managed service. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai))

### 8. It may be more infrastructure than you need

If your application only needs a simple database, a lightweight Postgres provider may be simpler. If you need a highly specialized backend, event-processing system, or globally distributed data layer, Supabase may not be the best primary platform.

## Best fit

Supabase is a strong choice when you want:

- A Postgres-backed SaaS or mobile app
- Fast prototyping with a path to production
- Built-in authentication and file storage
- Realtime features
- SQL and relational data modeling
- A small team that does not want to build backend infrastructure from scratch

## Less ideal when

Consider alternatives when you need:

- Very long-running or compute-heavy backend jobs
- Highly specialized infrastructure or global database distribution
- Extremely predictable enterprise pricing
- A backend ecosystem centered on languages other than TypeScript
- A fully managed service with minimal database/security administration
- Strictly isolated infrastructure without using a hosted SaaS provider

**Bottom line:** Supabase is particularly compelling for relational, API-driven applications where speed of development matters. Its main tradeoff is that the apparent simplicity moves complexity into **database design, RLS security, scaling, and usage monitoring**.
```

- T081 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T082 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T083 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T084 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T085 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T086 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T087 — realtime: How does this answer characterise Supabase's realtime features?
- T088 — auth: How does this answer characterise Supabase's built-in authentication?
- T089 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T090 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D09 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A10

```text
Supabase is known as an **open-source alternative to Firebase** that provides a hosted backend platform built around **PostgreSQL**.

Its main features include:

- **Postgres databases**
- **Authentication** and user management
- **Instant REST and GraphQL APIs**
- **Realtime data updates**
- **File storage**
- **Edge/serverless functions**
- Developer tools and dashboards

Developers often use it to quickly add a scalable backend to web and mobile apps while retaining the flexibility and SQL capabilities of PostgreSQL.
```

- T091 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T092 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T093 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T094 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T095 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T096 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T097 — realtime: How does this answer characterise Supabase's realtime features?
- T098 — auth: How does this answer characterise Supabase's built-in authentication?
- T099 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T100 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D10 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A11

```text
## Pros

- **It's real Postgres.** Every ORM, migration tool, and SQL client works, and your data is portable by design.
- **It's an all-in-one backend.** Database, Auth with OAuth, S3-compatible Storage, Edge Functions in Deno, Realtime, and queues (pgmq) are in the same project. Reviewers often call the initial setup very easy.
- **It's open source and self-hostable.** That removes the usual lock-in fear if the hosted plan stops fitting.
- **Row Level Security (RLS).** It puts authorisation in the database where it is hardest to bypass.
- **It suits AI features.** pgvector makes AI features a schema change rather than a second system. There is also an official MCP server for Claude Code and Cursor.
- **Generous free tier.** It includes 2 active projects, 500 MB of database, 1 GB of Storage, and 50,000 MAU. That is enough to build an MVP.
- **Developer experience.** Reviewers praise the developer experience, clear UI, and strong docs.

## Cons

- **RLS has a learning curve.** Misconfiguration can hurt. This is the most commonly cited drawback.
- **Free projects pause.** They pause after one week of inactivity, so they aren't suitable for anything customer-facing.
- **Costs can be hard to predict.** The Pro plan is $25 a month, but that fee is a base, not a cap. Overage is charged for users, disk, egress and storage. Egress overage is the line that surprises image-heavy apps. Some reviewers also find Pro pricing high compared with competitors like Appwrite.
- **Scaling is manual.** Scaling is manual, and the Free plan has a relatively small 500 MB database allowance.
- **Some pieces are less mature.** Edge Functions are less mature than AWS Lambda for complex use cases. The same source says migration tooling lags behind setups using Flyway or Liquibase.
- **UI and docs rough edges.** Reviewers mention some hard-to-find docs and features that are hard to locate in the dashboard.
- **Convenience can encourage shortcuts.** Teams can over-rely on convenience features and postpone architecture discipline.

## Who it fits

Supabase is a good choice when a Postgres-backed application needs several adjacent backend services, open-source access, or self-hosting flexibility. It's a weaker fit for projects that need maximum database performance tuning, enterprise compliance from day one, or teams already deeply invested in a different database provider. If you need automatic scaling, consider a different managed database.

Most of these sources are review sites and aggregators, so treat their ratings as opinion. Check current pricing on Supabase's own site before you commit.

I can compare it with Firebase, Neon or Appwrite if that would help.
```

- T101 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T102 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T103 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T104 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T105 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T106 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T107 — realtime: How does this answer characterise Supabase's realtime features?
- T108 — auth: How does this answer characterise Supabase's built-in authentication?
- T109 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T110 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D11 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A12

```text
Supabase is an open-source backend-as-a-service platform. It's often described as an open-source alternative to Google's Firebase, built on PostgreSQL.

**What it's known for**
- **Postgres at the core.** Each project gets a full PostgreSQL database. You get SQL, relational modeling, extensions, and no proprietary data store.
- **Auto-generated APIs.** It creates REST (via PostgREST) and GraphQL APIs from your database schema.
- **Authentication.** It supports email/password, magic links, OAuth providers (Google, GitHub, etc.), and SSO. It's integrated with Postgres Row Level Security for fine-grained access control.
- **Realtime.** Clients can subscribe to database changes, broadcast messages, and track presence over WebSockets.
- **Storage.** It offers file storage for images, videos, and other files, with access policies tied to the database.
- **Edge Functions.** These are serverless TypeScript/Deno functions that run close to users.
- **Vector and AI support.** The pgvector extension lets you store embeddings and run similarity search, which made it popular for AI and RAG apps.
- **Open source and self-hostable.** You can use the hosted service or run it yourself, which reduces vendor lock-in.

**Why developers like it**
- It's fast to start with, and the dashboard and client libraries (JavaScript, Flutter, Python, and others) are polished.
- It has a generous free tier.
- It's popular with indie developers, startups, and "vibe coding" or AI-assisted app builders, which often use it as their default backend.

The company was founded in 2020 and has raised significant venture funding. Its valuation and product details have changed quickly, so check the official site for current figures and features.
```

- T111 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T112 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T113 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T114 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T115 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T116 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T117 — realtime: How does this answer characterise Supabase's realtime features?
- T118 — auth: How does this answer characterise Supabase's built-in authentication?
- T119 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T120 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D12 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A13

```text
Choosing between **Supabase** and **Firebase** comes down to one fundamental difference: **Relational (PostgreSQL) vs. Document-based NoSQL (Firestore)**, along with how much you care about **vendor lock-in**.

Here is a quick summary, followed by a detailed breakdown and a decision checklist.

---

### TL;DR: The Quick Rule of Thumb

* **Choose Supabase if:** You want standard SQL, complex relationships, tabular data, vector search for AI (`pgvector`), or the freedom to self-host and avoid Google vendor lock-in.
* **Choose Firebase if:** You are building a mobile-first app (iOS/Android), need robust out-of-the-box offline data sync, have unstructured or document-heavy data, or want deep integration with the Google Cloud ecosystem.

---

### Head-to-Head Comparison

| Feature | Supabase | Firebase |
| :--- | :--- | :--- |
| **Database** | **PostgreSQL** (Relational SQL) | **Cloud Firestore** / Realtime DB (NoSQL) |
| **Data Relationships** | Excellent (Native Foreign Keys, Joins, Aggregations) | Difficult (Requires denormalization or multiple queries) |
| **Vendor Lock-in** | **Low** (Open-source; export standard Postgres or self-host via Docker) | **High** (Proprietary Google platform) |
| **Auth & Security** | Postgres Row-Level Security (RLS) + GoTrue Auth | Firebase Auth + Firebase Security Rules |
| **Serverless Logic** | Edge Functions (Deno / TypeScript) + Postgres triggers | Cloud Functions (Node, Python, Go) |
| **Offline Sync** | Basic (Requires client-side work / libraries) | **Industry Best** (Built directly into mobile SDKs) |
| **AI / Vector Search** | Built-in via `pgvector` | Requires extensions (Vector Search via Vertex AI) |
| **Pricing Model** | Predictable tiers (Compute + Storage size) | Pay-per-operation (Reads, Writes, Deletes) |

---

### Detailed Breakdown

#### 1. Database & Query Flexibility
* **Supabase:** You are working with pure PostgreSQL. If your app has users, orders, products, comments, and permissions, you can write joins, views, and aggregate data (sums, averages) in a single query.
* **Firebase:** Firestore is NoSQL. Queries are simple and scale effortlessly, but complex filtering across multiple collections requires denormalizing your data (copying data in multiple places) or making chained client requests.

#### 2. Pricing & Cost Predictability
* **Supabase:** Pricing is primarily based on database storage, bandwidth, and compute instance size. If an active user triggers 10,000 queries in an hour, your bill won’t suddenly skyrocket, as long as your database instance can handle the load.
* **Firebase:** Charges per **document read, write, and delete**. A single poorly written `useEffect` loop or a viral day with complex screen rendering can run up an unexpectedly high bill.

#### 3. Mobile vs. Web Optimization
* **Firebase:** Originally built for mobile developers. Its client SDKs for iOS, Android, Flutter, and React Native handle connection drops, local caching, and offline-to-online sync exceptionally well.
* **Supabase:** Has mobile SDKs (Flutter, Swift, Kotlin), but its roots are primarily in modern full-stack web development (Next.js, Remix, SvelteKit, etc.).

#### 4. Security Model
* **Supabase:** Uses PostgreSQL’s native **Row Level Security (RLS)**. You write SQL expressions (e.g., `WHERE auth.uid() = user_id`) to govern who can read or write rows. Once set up, security is enforced consistently across all client queries.
* **Firebase:** Uses custom **Firebase Security Rules** syntax. While capable, it requires learning a proprietary domain-specific language and can become unwieldy for complex permissions.

---

### When to Pick Supabase

1. **You already know SQL** or prefer standard relational modeling.
2. **You are building an AI/LLM application:** Supabase has native support for `pgvector`, making it one of the easiest backends for storing embeddings and running semantic search.
3. **You want portability:** If Supabase ever changes its pricing or goes down, you can export a `.sql` dump and host it on AWS RDS, DigitalOcean, or your own VPS in minutes.
4. **You are building a B2B SaaS, CRM, or E-commerce platform:** These use cases are fundamentally relational and suffer on NoSQL.

### When to Pick Firebase

1. **You are building a mobile app** where users frequently experience poor connectivity and require seamless offline read/write sync.
2. **Your data is truly document-centric:** (e.g., chat logs, feed items, individual user settings) where complex joins and aggregations aren't required.
3. **You rely on Google's mobile suite:** You want turnkey integration with Google Analytics for Mobile, Crashlytics, Remote Config, and Cloud Messaging (FCM).
4. **Rapid zero-setup prototyping:** If you don't want to design database schemas upfront and just want to throw JSON into the cloud.
```

- T121 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T122 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T123 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T124 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T125 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T126 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T127 — realtime: How does this answer characterise Supabase's realtime features?
- T128 — auth: How does this answer characterise Supabase's built-in authentication?
- T129 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T130 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D13 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A14

```text
**Supabase** is best known as the leading **open-source alternative to Google’s Firebase**. It is a **Backend-as-a-Service (BaaS)** designed to give developers all the backend tools needed to build a modern web or mobile application without having to build and maintain the infrastructure from scratch.

Here are the primary things Supabase is known for:

---

### 1. Built on PostgreSQL (Relational Data)
Unlike Firebase, which is built on NoSQL databases (Firestore / Realtime Database), Supabase is built entirely on top of **PostgreSQL**, an enterprise-grade, open-source relational database.
* **Full SQL Support:** You get standard SQL, complex joins, triggers, and foreign keys.
* **PostgreSQL Extensions:** Native support for powerful extensions, including `PostGIS` (geospatial data), `pgvector` (AI embeddings and vector search), and `pg_cron` (scheduled jobs).

### 2. Auto-Generated APIs
Once you create tables in your Postgres database, Supabase instantly auto-generates:
* **REST APIs** (powered by PostgREST)
* **GraphQL APIs** (powered by pg_graphql)

These APIs reflect your database schema directly and come with automatically generated TypeScript types for type-safe frontend development.

### 3. Integrated Authentication & Row Level Security (RLS)
Supabase provides a complete user identity and authentication system:
* Supports email/password, magic links, phone/SMS, and dozens of third-party OAuth providers (Google, GitHub, Apple, etc.).
* Enforces data access rules directly at the database level using **PostgreSQL Row Level Security (RLS)**, ensuring users can only read and modify records they are authorized to access.

### 4. Realtime Capabilities
Supabase turns standard PostgreSQL into a real-time engine over WebSockets:
* **Database Changes:** Listen to database `INSERT`, `UPDATE`, and `DELETE` events in real time.
* **Broadcast & Presence:** Share transient messages between connected clients (e.g., typing indicators, chat, online user tracking) without saving them to the database.

### 5. Storage and Edge Functions
* **Storage:** S3-compatible object storage for images, videos, and large files, protected using the same Row Level Security rules as the database.
* **Edge Functions:** Serverless TypeScript functions (powered by Deno) distributed globally to execute custom backend logic close to users.

### 6. Vector Search & AI Tooling
Supabase was an early and influential adopter of **`pgvector`**, allowing developers to store text embeddings, calculate cosine similarities, and build AI/RAG (Retrieval-Augmented Generation) applications directly within their existing database.

---

### Why Developers Choose It
* **No Vendor Lock-in:** Because it is open-source, you can host Supabase on your own servers (via Docker) or use their managed cloud platform.
* **Data Portability:** Since the core is just standard Postgres, you can migrate to or from any other Postgres host (like AWS RDS, Neon, or a local instance) using standard SQL dumps.
* **Developer Experience:** It features an intuitive web dashboard, local development CLI, and comprehensive SDKs (JavaScript/TypeScript, Python, Flutter, Swift, etc.).
```

- T131 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T132 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T133 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T134 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T135 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T136 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T137 — realtime: How does this answer characterise Supabase's realtime features?
- T138 — auth: How does this answer characterise Supabase's built-in authentication?
- T139 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T140 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D14 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A15

````text
## Short answer

**Choose Supabase for most new web apps, SaaS products, dashboards, and apps with relational data.**  
**Choose Firebase for mobile-first apps, offline-first experiences, real-time synchronization, push notifications, and deep Google Cloud integration.**

## Core difference

| | Supabase | Firebase |
|---|---|---|
| Primary database | Full **PostgreSQL** | Primarily **Cloud Firestore**, a NoSQL document database |
| Query model | SQL, joins, constraints, transactions, extensions | Document/collection queries and denormalized data |
| Best fit | SaaS, marketplaces, admin apps, analytics, relational workflows | Mobile apps, games, collaborative/offline apps |
| Real-time data | Realtime subscriptions over Postgres | Firestore/Realtime Database synchronization |
| Backend code | TypeScript-first Edge Functions | Cloud Functions, supporting JavaScript/TypeScript/Python |
| Hosting | Usually pair with a frontend host such as Vercel or Netlify | Strong built-in Hosting with global CDN and SSL |
| Portability | Higher: standard Postgres and open-source components | More Google/Firebase-specific |
| Ecosystem | Focused backend platform | Broad mobile, analytics, messaging, testing, monitoring ecosystem |
| Pricing style | More predictable plan plus resource quotas | Usage-based billing can vary with reads, writes, storage, and bandwidth |

Supabase gives each project a full Postgres database, with Auth, Storage, Realtime, Edge Functions, generated APIs, and Row Level Security built around it. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai)) Firebase centers on Firestore or Realtime Database, with tightly integrated Authentication, Cloud Functions, Hosting, Cloud Messaging, Crashlytics, Analytics, and other Google services. ([firebase.google.com](https://firebase.google.com/products-build?utm_source=openai))

## Choose Supabase if…

- Your data has **relationships**: users, teams, subscriptions, orders, permissions, products, etc.
- You want to write **SQL** and use joins, foreign keys, constraints, views, and Postgres extensions.
- You are building a **SaaS, marketplace, internal tool, CRM, booking system, or analytics-heavy app**.
- You want a more conventional backend with a database you can inspect and migrate easily.
- You value **reduced vendor lock-in** or the option to self-host.
- You want client-side access controlled through Postgres **Row Level Security**.
- You prefer a relatively predictable paid starting point: Supabase currently lists a Pro plan from **$25/month**, with included quotas and usage-based overages. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

**Main downside:** Supabase requires you to understand database design, SQL, migrations, indexes, and RLS. It is flexible, but you have more architectural responsibility.

## Choose Firebase if…

- Your app is primarily **Android, iOS, Flutter, or a game**.
- You need excellent **offline support and automatic synchronization**.
- You want built-in **push notifications, Crashlytics, Analytics, Remote Config, App Check, or Test Lab**.
- You want a very fast prototype with a document-oriented data model.
- Your team is already heavily invested in **Google Cloud**.
- You want simple static hosting and preview/deployment workflows through Firebase Hosting.
- You need Firebase’s mature client SDKs and mobile integrations. Firestore supports realtime listeners, offline reads and writes, flexible document structures, and transactions. ([firebase.google.com](https://firebase.google.com/docs/firestore/index.html?utm_source=openai))

**Main downside:** Firestore’s data model and billing require careful design. Costs are influenced by document reads, writes, deletes, index reads, storage, and bandwidth; inefficient listeners or queries can become expensive. ([firebase.google.com](https://firebase.google.com/docs/firestore/pricing?utm_source=openai))

## Important nuance: Firebase now has PostgreSQL

Firebase is no longer strictly NoSQL: **Firebase SQL Connect** provides a managed PostgreSQL service through Cloud SQL, with GraphQL-based schemas and generated client SDKs. However, it is a different abstraction from Supabase’s direct, full-Postgres experience, so I would not treat it as a complete tie-breaker. ([firebase.google.com](https://firebase.google.com/docs/sql-connect?utm_source=openai))

## My practical recommendation

### For a typical startup or web SaaS

Pick **Supabase** unless you have a specific Firebase requirement.

It usually gives you a cleaner model for:

```text
users → organizations → projects → tasks
users → subscriptions → invoices
products → orders → order_items
```

That type of relational data is generally more natural in PostgreSQL than in Firestore.

### For a mobile app or game

Pick **Firebase**, especially if you need:

- offline use,
- push notifications,
- mobile analytics,
- crash reporting,
- remote feature flags,
- anonymous authentication,
- broad iOS/Android integration.

Firebase Authentication also offers ready-made UI options and support for common providers, phone authentication, anonymous auth, and custom authentication flows. ([firebase.google.com](https://firebase.google.com/docs/auth/where-to-start?hl=en&utm_source=openai))

### For an AI app

Usually pick **Supabase** if you need SQL, vector search, user-owned data, relational metadata, and straightforward backend access. Supabase supports Postgres extensions such as `pgvector`, while Firebase may be attractive if your AI features are centered on Google’s Gemini ecosystem and Firebase AI tooling. ([supabase.com](https://supabase.com/docs/guides/database/overview?utm_source=openai))

## Bottom line

- **Web SaaS / relational data:** Supabase  
- **Mobile-first / offline sync:** Firebase  
- **Google Cloud ecosystem:** Firebase  
- **SQL, portability, and predictable architecture:** Supabase  
- **Push notifications, analytics, crash reporting:** Firebase  
- **Unsure:** Start with **Supabase** for a web product; start with **Firebase** for a mobile product.
````

- T141 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T142 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T143 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T144 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T145 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T146 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T147 — realtime: How does this answer characterise Supabase's realtime features?
- T148 — auth: How does this answer characterise Supabase's built-in authentication?
- T149 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T150 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
- D15 — drift: Does this answer describe a quality of Supabase that none of the listed attributes covers?

## A16

```text
**Yes, Supabase automatically pauses projects on the Free plan** to conserve server resources if they are inactive.

### Key Details

* **Inactivity Window:** A free project is typically flagged for pausing if it receives little to no database/API activity over a **7-day period**.
* **Notifications:** Supabase usually sends a warning email a few days prior to pausing and another email once the project has actually been paused.
* **What Happens When Paused:** 
  * The database and APIs go offline, meaning client applications will get connection errors.
  * **Your data is not deleted**; the database state and schema are preserved.
* **How to Restore:** You can unpause a project at any time from the Supabase Dashboard by selecting the project and clicking **Resume project** (it typically takes a couple of minutes to spin back up). Supabase retains paused projects for up to 1 year.

### How to Prevent Pausing

1. **Keep it active:** Any regular database queries or API requests (even a few per week) reset the inactivity timer. Many developers use a simple scheduled job (like a cron job or GitHub Actions workflow) to send a lightweight ping/read query to the project.
2. **Upgrade to the Pro Plan:** Paid projects are never paused for inactivity.
```

- T151 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T152 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T153 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T154 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T155 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T156 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T157 — realtime: How does this answer characterise Supabase's realtime features?
- T158 — auth: How does this answer characterise Supabase's built-in authentication?
- T159 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T160 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A17

```text
Because Supabase is built on top of standard **PostgreSQL**, it integrates both natively (via official SDKs, integrations, and partners) and broadly with **any tool or language that supports a standard Postgres connection**.

The most popular tools and platforms Supabase integrates with, broken down by category:

---

### 1. Frontend & Mobile Frameworks (Official & Community SDKs)
Supabase provides first-party and community client libraries for building client applications:
* **Web:** React, Next.js, Vue, Nuxt, Svelte / SvelteKit, Angular, SolidJS, Remix, Astro.
* **Mobile & Desktop:** Flutter, React Native, Expo, Swift (iOS/macOS), Kotlin / Java (Android), Ionic.
* **Backend / Scripting Languages:** JavaScript/TypeScript (Node.js, Deno, Bun), Python, Go, C# / .NET, Rust, Dart, Ruby, PHP.

---

### 2. Deployment & Serverless Platforms
Supabase integrates with edge and cloud hosting platforms for environment variable syncing and edge computing:
* **Hosting Platforms:** Vercel (official integration with automatic env configuration), Netlify, Render, Fly.io, Railway.
* **Edge Runtimes:** Cloudflare Workers, Fastly Compute, Deno Deploy, AWS Lambda.

---

### 3. Authentication & Identity Providers (OAuth & SSO)
Supabase Auth supports social logins, enterprise SSO (SAML 2.0), and third-party identity providers out of the box:
* **Social / Consumer OAuth:** Google, Apple, GitHub, GitLab, Discord, Twitter / X, Slack, Twitch, Spotify, Bitbucket, LinkedIn, Facebook, Figma, Notion.
* **Enterprise SSO & SAML:** Azure AD (Microsoft Entra), Okta, Google Workspace, Keycloak, PingIdentity, OneLogin, WorkOS.
* **SMS / Phone Providers:** Twilio, MessageBird, Vonage, AWS SNS.

---

### 4. Database, ORMs & Schema Management
You can connect directly via the Supabase connection pooler (Supavisor / PgBouncer) using any PostgreSQL-compatible ORM:
* **ORMs & Query Builders:** Prisma, Drizzle ORM, Kysely, TypeORM, MikroORM, SQLAlchemy (Python), Tortoise ORM, Entity Framework Core (.NET), GORM (Go).
* **Database GUIs & Admin Tools:** TablePlus, DBeaver, pgAdmin, DataGrip, Beekeeper Studio.
* **Migration Tools:** Flyway, Liquibase, Atlas, Prisma Migrate.

---

### 5. AI, Vector Search & LLMs
Using the native **`pgvector`** extension, Supabase is widely used as a vector database for AI workflows:
* **Frameworks:** LangChain, LlamaIndex, Haystack, AutoGPT.
* **LLM & Model Providers:** OpenAI, Anthropic, Hugging Face, Cohere, Replicate.

---

### 6. Low-Code, No-Code & Internal Tools
You can use Supabase as the backend for drag-and-drop web and mobile builders:
* **Internal Tools:** Retool, Appsmith, ToolJet, Budibase, Superblocks.
* **No-Code / Low-Code Builders:** FlutterFlow, WeWeb, Plasmic, Draftbit, Toddle, Bravo Studio.
* **Automation:** Zapier, Make (Integromat), n8n, Activepieces.

---

### 7. Payments & Webhooks
* **Stripe:** Supabase provides native webhooks and open-source sync engines (such as the Stripe Sync Engine) to sync customer and subscription data directly into your database.
* **Lemon Squeezy / Paddle:** Easily integrated via Supabase Edge Functions and database webhooks.
* **General Webhooks:** Supabase Database Webhooks can trigger requests to any external API or endpoint on `INSERT`, `UPDATE`, or `DELETE` events.

---

### 8. Analytics & Business Intelligence (BI)
Because Supabase is standard Postgres, you can point reporting tools directly to your read-replica or connection string:
* **BI Tools:** Metabase, Apache Superset, Tableau, Power BI, Preset, Looker Studio.
* **Product Analytics:** PostHog, Mixpanel, June.

---

### 9. DevOps, Monitoring & Infrastructure as Code (IaC)
* **Infrastructure as Code:** Terraform (official Supabase Terraform Provider), Pulumi.
* **CI/CD:** GitHub Actions (for automated migrations and branching workflows).
* **Observability & Logging:** Datadog, Axiom, Grafana, Sentry, Logflare (which powers Supabase's underlying log engine).
```

- T161 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T162 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T163 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T164 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T165 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T166 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T167 — realtime: How does this answer characterise Supabase's realtime features?
- T168 — auth: How does this answer characterise Supabase's built-in authentication?
- T169 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T170 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A18

```text
Supabase’s **Free plan costs $0/month** and is intended for hobby projects, prototypes, and simple websites. It currently includes:

- **2 active projects** per organization; projects pause after **1 week of inactivity**. ([supabase.com](https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=openai))
- A dedicated Postgres database with:
  - **500 MB database quota per project**
  - Shared CPU and up to **500 MB RAM**
  - Unlimited API requests
  - Dashboard, SQL editor, Table Editor, logs, and auto-generated APIs ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))
- **Authentication:**
  - Unlimited total users
  - **50,000 monthly active users**
  - Social OAuth providers, anonymous sign-ins, custom SMTP, and basic MFA ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))
- **Storage:**
  - **1 GB file storage**
  - **5 GB cached egress**
  - **5 GB uncached egress**
  - Basic CDN and a 50 MB maximum file upload size ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))
- **Edge Functions:** 500,000 invocations per month. ([supabase.com](https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=openai))
- **Realtime:** 2 million messages per month and up to 200 peak connections. ([supabase.com](https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=openai))
- **Support:** Community support. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

Not included are automatic backups, point-in-time recovery, database branching, image transformations, SSO/SAML, advanced MFA, and removal of Supabase branding from emails. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

One important caveat: the **500 MB database quota is separate from the project’s 1 GB disk allocation**; exceeding the database quota can put the database into read-only mode. ([supabase.com](https://supabase.com/docs/guides/platform/database-size?utm_source=openai))
```

- T171 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T172 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T173 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T174 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T175 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T176 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T177 — realtime: How does this answer characterise Supabase's realtime features?
- T178 — auth: How does this answer characterise Supabase's built-in authentication?
- T179 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T180 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A19

````text
Yes. Supabase provides an official self-hosted Docker Compose deployment for your own server, VPS, or cloud infrastructure. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

## Recommended approach: Docker on Linux

### 1. Provision a server

For a small deployment, Supabase currently recommends at least:

- **4 GB RAM minimum; 8 GB+ recommended**
- **2 CPU cores minimum; 4+ recommended**
- **40 GB SSD minimum; 80 GB+ recommended**

Install Git, Docker Engine, and Docker Compose. ([github.com](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/self-hosting/docker.mdx?utm_source=openai))

### 2. Run the official setup script

On a Linux server:

```bash
curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh | sh
```

This creates a `supabase-project` directory, configures URLs, generates secrets and API keys, and pulls the required images. Inspect the script first if preferred; the official documentation also supports a manual installation path. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

### 3. Start Supabase

```bash
cd supabase-project
sh run.sh start
```

Check service health:

```bash
docker compose ps
```

View generated credentials:

```bash
sh run.sh secrets
```

Studio is normally available at:

```text
http://your-server-ip:8000
```

The default deployment includes Studio, Postgres, Auth, REST, Realtime, Storage, Edge Functions, and connection pooling. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

### 4. Configure your application

Use these values from `.env`:

```text
SUPABASE_PUBLIC_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Use the publishable key in browser/client code. Keep `SUPABASE_SECRET_KEY` exclusively on trusted servers. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

## Important production steps

Before exposing it publicly:

1. Replace all example passwords and keys.
2. Put Caddy, Nginx, or another reverse proxy in front of it.
3. Enable HTTPS.
4. Restrict firewall access—particularly Studio and Postgres.
5. Configure SMTP for email authentication.
6. Set up automated Postgres and Storage backups.
7. Monitor disk space, containers, database health, and certificate expiry.
8. Keep the deployment updated with Supabase’s update process.

Supabase explicitly makes server maintenance, security, backups, disaster recovery, scaling, and uptime your responsibility when self-hosting. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

## Docker Compose vs. Kubernetes

- **Docker Compose:** official and recommended starting point; best for one server or a small deployment.
- **Kubernetes:** possible through community-maintained projects, but more operationally complex and not the primary official deployment path. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

## Limitations compared with hosted Supabase

Self-hosted Supabase is generally a **single-project** installation. Some hosted features are unavailable or require you to operate them yourself, including managed backups/PITR, branching, the Management API, some analytics features, and certain platform services. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

Also, `supabase start` from the Supabase CLI is intended for local development and testing—not as a hardened production deployment. Use the official Docker self-hosting setup for production. ([supabase.com](https://supabase.com/docs/guides/self-hosting))
````

- T181 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T182 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T183 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T184 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T185 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T186 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T187 — realtime: How does this answer characterise Supabase's realtime features?
- T188 — auth: How does this answer characterise Supabase's built-in authentication?
- T189 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T190 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A20

```text
**For a small app, Firebase is usually cheaper at low usage, and Supabase is usually cheaper once usage grows or becomes unpredictable.** The sources below were published at different times, so check the official pricing pages before you commit.

**Free tiers**
- **Supabase Free:** 500 MB of database storage, 50,000 monthly active users, 5 GB of egress, 1 GB of file storage, and up to 2 active projects. The catch is that free projects auto-pause after one week of inactivity.
- **Firebase Spark:** 50,000 Firestore document reads, 20,000 writes, and 20,000 deletes per day, plus 1 GiB stored. Spark has no pausing, but if you exceed a quota, your app stops until midnight. Cloud Functions and phone auth aren't available on Spark. As of February 2026, Cloud Storage also requires Blaze.

**Paid tiers**
- **Supabase Pro:** $25/month base. It includes a $10/month compute credit that covers one Micro instance, so most early-stage SaaS apps stay at exactly $25/month. It includes 8 GB of database, 100K MAUs, 250 GB of egress and daily backups. Heavier compute is extra. One source estimates most small-to-medium apps land at $35–$75/month once usage fees are counted.
- **Firebase Blaze:** Blaze has no monthly fee. You keep the entire Spark free allowance and pay only for usage above it, so a quiet app can still bill $0. One source says small production apps commonly land between $0 and $25 a month, driven mostly by Firestore reads and Cloud Functions compute. Overage rates vary by region. For example, $0.06 per 100,000 Firestore reads and $0.18 per 100,000 writes in the US multi-region.

**Example Firebase costs**

One worked estimate puts a Firestore app at about $0 a month at 1,000 MAU, about $2 at 10,000 and about $320 at 100,000, assuming you avoid common bill shocks. That jump shows how a usage-based model can get expensive quickly.

**Which to pick**
- **Hobby project, prototype, or a few thousand users:** Firebase is cheaper, often $0 to a few dollars a month. Supabase Free is also $0, but you must tolerate the pausing.
- **Production app that needs to stay up and has real traffic:** Supabase Pro is a predictable $25+. Firebase may still be cheaper if your read volume is low.
- **Read-heavy or realtime-listener-heavy apps:** Supabase tends to win, since Firebase bills per document read and Supabase doesn't. One source notes that even with 10 million API requests in a month, you pay the same $25 base fee as long as you stay within resource limits.
- **Budget predictability:** Supabase's Pro spend cap is enabled by default. One review says Firebase has no way to cap spend, though you can set budget alerts in Google Cloud.

**Non-price factors:** Supabase is Postgres (SQL), and Firebase is NoSQL (Firestore). Your data model may matter more than the price difference.

If you tell me your expected users, reads and writes per session, and whether you need file storage or phone auth, I can estimate costs for both.
```

- T191 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T192 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T193 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T194 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T195 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T196 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T197 — realtime: How does this answer characterise Supabase's realtime features?
- T198 — auth: How does this answer characterise Supabase's built-in authentication?
- T199 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T200 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A21

```text
Supabase currently has four main plans:

| Plan | Price | Best for |
|---|---:|---|
| **Free** | **$0/month** | Hobby projects and experiments |
| **Pro** | **From $25/month** | Production applications |
| **Team** | **From $599/month** | Teams needing SSO, compliance, and priority support |
| **Enterprise** | **Custom pricing** | Large-scale workloads and custom SLAs |

The **Pro plan includes $10/month in compute credits**, which covers one Micro compute instance, so a typical single-project Pro setup starts at about **$25/month**. Additional projects start at **$10/month**, and usage beyond included quotas—such as database storage, bandwidth, file storage, and monthly active users—can add charges. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

The Free plan includes 500 MB of database storage, 50,000 monthly active users, 5 GB egress, and 1 GB file storage; free projects may pause after one week of inactivity. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))
```

- T201 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T202 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T203 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T204 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T205 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T206 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T207 — realtime: How does this answer characterise Supabase's realtime features?
- T208 — auth: How does this answer characterise Supabase's built-in authentication?
- T209 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T210 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A22

```text
Here's how the two plans compare, based on third-party pricing guides. Check Supabase's official pricing page for current numbers, because they change.

| Resource | Free ($0) | Pro ($25/month) |
|---|---|---|
| Monthly active users (Auth) | 50,000 | 100,000 |
| Database size | 500 MB | 8 GB (included) |
| Egress | 5 GB | 250 GB (included) |
| File storage | 1 GB | 100 GB |
| Cached egress | 5 GB | 250 GB |
| Edge Function invocations | 500,000 | 2 million per month |
| Backups | None | Daily, kept 7 days |
| Active projects | 2 | The first project is included, and additional projects cost $10/month |

**Main differences**

- **Inactivity pausing:** Free projects auto-pause after 1 week of inactivity and must be restored manually. The Pro plan removes pausing and raises every limit. This is why the Free plan isn't suited to production apps with live users.
- **Overages:** Pro is usage-based. Egress beyond the included 250 GB costs $0.09 per GB. Extra MAUs beyond the included amount cost $0.00325 each. Edge Function invocations past the limit cost $2 per million.
- **Compute credit:** Pro includes a $10/month compute credit, enough to cover one Micro instance. On top of the base fee, you pay for compute (minus that credit), database storage past 8 GB, and egress past 250 GB.
- **Support:** Pro adds features such as daily backups and email support.
- **Billing unit:** Some sources say Pro is $25 per organization per month. Others describe it as per project. Check this on the official page.

A few figures differ between sources, such as the Pro file storage and bandwidth numbers. One source lists 100 GB of monthly bandwidth for Pro, while most list 250 GB of egress. I'd treat the 250 GB figure as the more reliable one.
```

- T211 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T212 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T213 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T214 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T215 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T216 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T217 — realtime: How does this answer characterise Supabase's realtime features?
- T218 — auth: How does this answer characterise Supabase's built-in authentication?
- T219 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T220 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A23

```text
Supabase integrates with a wide range of tools. Its partner directory lists over 100 of them.

**How integrations work**
- Anything that works with Postgres also works with Supabase projects.
- Other integration points are the project REST API and client libraries, the GraphQL API, and the Platform API.
- Partners can also build OAuth apps, Management API integrations, Foreign Data Wrappers, Postgres extensions, and log drains.

**Featured partners by category**
- **Data and Foreign Data Wrappers:** BigQuery, which you can query from Postgres with read and write support. Firebase, where Auth users and Firestore documents appear as Postgres tables. Stripe, where you can query and write customer, subscription, invoice and billing data from Postgres. ClickHouse is also listed.
- **DevTools and hosting:** Cloudflare, Vercel, Trigger.dev for background jobs, Resend for transactional email, and Windmill for internal UIs and workflows.
- **Observability:** Grafana.
- **Offline-first and caching:** PowerSync.
- **Data platform:** Springtail, for read replicas, and Windsor.ai, which syncs data from marketing and business platforms.
- **Other partners:** The partners page also lists Auth0, Clerk, Algolia, Airtable, Anthropic, AWS, Doppler, Cal.com, Calendly, and Bolt.

**CRM and business apps**
- Stacksync offers two-way, real-time syncs between Supabase and business apps. It supports Salesforce, HubSpot, Attio, Zoho CRM, BigQuery, Zendesk and more.

**Low-code and automation**
- Retool, Appsmith, and Tooljet have first-class Supabase connectors for building internal apps.
- Make and n8n both have Supabase modules. Zapier and Boomi can also connect Supabase to ERPs, CRMs and other business applications.

**Built-in features**
- Supabase has built-in Auth providers (Google, GitHub, Apple, Discord and 20+ OAuth), S3-compatible Storage, Edge Functions, and Realtime websockets.
- For tools like Stripe webhooks, Slack alerts or OpenAI calls, the standard path is Edge Functions or Database Webhooks.

The full, current list is in the [Partner Catalog](https://supabase.com/partners/integrations). You can also install Dashboard Integrations from inside a project.
```

- T221 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T222 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T223 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T224 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T225 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T226 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T227 — realtime: How does this answer characterise Supabase's realtime features?
- T228 — auth: How does this answer characterise Supabase's built-in authentication?
- T229 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T230 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A24

```text
According to Supabase's self-hosting docs, these managed-platform features aren't available when you self-host:

- **Branching.** The docs list branching, advanced metrics beyond logs, managed backups and PITR, analytics and vector buckets, ETL, and the Management API as unavailable.
- **Advanced metrics beyond logs.** You can still collect logs and metrics yourself. The docs point to a community-maintained observability project for this.
- **Managed backups and point-in-time recovery (PITR).** You can build your own, but it takes work. On your own server, PITR means a base backup plus WAL archiving, somewhere off the server to keep both, and a rehearsal that proves the pieces fit together. Tools such as pgBackRest exist for this.
- **Analytics and vector buckets.**
- **ETL.**
- **The Management API.**

**Other differences**
- **Single project only.** Self-hosted Supabase runs as a single project, so Studio doesn't support multiple organizations or projects.
- **Configuration through environment variables.** Most settings are configured this way. One third-party write-up says the dashboard's auth provider configuration UI is also missing. I haven't confirmed that against the official docs.
- **Edge Functions.** They run on the local runtime, not on an automatically distributed global network.
- **Logging.** One third-party article calls this the biggest gap. It says the built-in Log Explorer and pre-configured log aggregation are missing. It also says community members report "No results found" for PostgREST, Edge Functions, and Cron logs. That article is about 9 months old, so some of this may have changed.

**What works**
The core services are the same software the hosted platform runs. Postgres, Auth, Storage, Realtime, and PostgREST work reliably. The difference is mostly operational tooling. You also take on updates, backups, monitoring, scaling, and security yourself.

The official page is https://supabase.com/docs/guides/self-hosting.
```

- T231 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T232 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T233 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T234 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T235 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T236 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T237 — realtime: How does this answer characterise Supabase's realtime features?
- T238 — auth: How does this answer characterise Supabase's built-in authentication?
- T239 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T240 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A25

```text
## Short answer

- **Cheapest for a hobby/prototype:** **Both can be $0**, but Firebase’s free tier is often more generous for read-heavy apps.
- **Cheapest predictable production setup:** **Supabase is usually easier to budget at $25/month.**
- **Cheapest very-low-traffic production app:** **Firebase can be cheaper**, because its Blaze plan has no fixed monthly fee and charges only for usage.
- **Best value depends heavily on your database workload:** Firestore charges by reads/writes, while Supabase charges primarily through a fixed project plan plus storage, bandwidth, and usage overages.

### Current baseline pricing

| Scenario | Supabase | Firebase |
|---|---:|---:|
| Free prototype | **$0** | **$0** |
| Small production app | **$25/month Pro** | **$0 fixed fee on Blaze**, usage-based |
| Database | PostgreSQL | Firestore or Realtime Database |
| Free database allowance | 500 MB | Firestore: 1 GiB |
| Free bandwidth/egress | 5 GB | Firestore: 10 GiB/month |
| Free auth allowance | 50,000 MAU | Most auth methods are no-cost; Identity Platform includes 50,000 MAU |
| Main pricing risk | Fixed $25 minimum for non-pausing production | Unexpected read/write, storage, bandwidth, or function charges |

Supabase’s Pro plan is $25/month and includes 8 GB of database disk, 250 GB egress, 100,000 monthly active users, and 100 GB file storage. Its paid organization also includes compute credits covering one small Micro instance. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

Firebase has a free Spark plan and a pay-as-you-go Blaze plan. Firestore’s free quota includes 1 GiB storage, 10 GiB/month network egress, 20,000 writes/day, 50,000 reads/day, and 20,000 deletes/day. Additional usage is billed separately. ([firebase.google.com](https://firebase.google.com/pricing?hl=en&trk=article-ssr-frontend-pulse_little-text-block&utm_source=openai))

## My practical recommendation

### Choose Firebase if:

- You expect **low or unpredictable traffic**.
- Your app is naturally document-oriented.
- You want to start at **$0 with no monthly commitment**.
- You use Firebase’s surrounding tools: push notifications, Analytics, Crashlytics, App Check, Remote Config, and mobile SDKs.
- You can monitor Firestore reads carefully.

Firebase is often cheapest for a small app with modest usage because there is no equivalent mandatory $25 production subscription. However, careless queries or real-time listeners can increase Firestore read costs. Firestore bills for document reads, writes, deletes, storage, indexes, and bandwidth. ([firebase.google.com](https://firebase.google.com/docs/firestore/pricing?hl=zh-cn&utm_source=openai))

### Choose Supabase if:

- You want a **real PostgreSQL database**.
- Your data has relationships, joins, reporting, or complex SQL queries.
- You want more predictable monthly billing.
- You expect to run a continuously active production app.
- You prefer open-source tooling and easier database portability.

Supabase’s free tier is excellent for development, but free projects can be paused after a period of inactivity. The first non-pausing paid production setup is generally $25/month. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

## Bottom line

For a typical small app:

- **Prototype or side project:** Firebase is probably cheaper initially—often **$0**.
- **Small app with a stable production backend:** Supabase is often the better value if you are comfortable paying **$25/month**.
- **Relational data or SQL-heavy app:** Choose Supabase even if Firebase might be slightly cheaper.
- **Simple mobile app with modest usage and Firebase integrations:** Choose Firebase.

If you tell me your expected users, database size, monthly API requests, file storage, and whether you need serverless functions, I can estimate the likely monthly bill for both.
```

- T241 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T242 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T243 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T244 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T245 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T246 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T247 — realtime: How does this answer characterise Supabase's realtime features?
- T248 — auth: How does this answer characterise Supabase's built-in authentication?
- T249 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T250 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A26

```text
Here’s the current **Supabase Free vs. Pro** comparison:

| Feature | Free | Pro |
|---|---:|---:|
| **Price** | $0/month | From **$25/month** |
| **Projects** | 2 active free projects; paused projects don’t count | First project included; additional projects start at $10/month |
| **Database size** | 500 MB per project | 8 GB per project, then $0.125/GB |
| **Bandwidth / egress** | 5 GB | 250 GB, then $0.09/GB |
| **Cached egress** | 5 GB | 250 GB, then $0.03/GB |
| **File storage** | 1 GB | 100 GB, then $0.021/GB |
| **Monthly active users** | 50,000 MAU | 100,000 MAU, then $0.00325/MAU |
| **Edge Function invocations** | 500,000/month | 2 million/month, then $2 per million |
| **Realtime messages** | 2 million/month | 5 million/month, then $2.50 per million |
| **Realtime peak connections** | 200 | 500, then $10 per 1,000 |
| **API requests** | Unlimited | Unlimited |
| **Backups** | Not included | Daily backups retained for 7 days |
| **Log retention** | Limited/free-tier allowance | 7 days |
| **Project pausing** | Projects pause after 1 week of inactivity | Projects aren’t paused for inactivity |
| **Support** | Community support | Email support |
| **Spend cap** | No charges, but service restrictions can apply if you continually exceed quotas | Enabled by default; disable it to continue using services and pay overages |

The main practical differences are **production reliability, storage/database capacity, bandwidth, backups, and support**. Free is generally suitable for prototypes, hobby projects, and low-traffic apps. Pro is more appropriate for production apps that must remain active and need backups or substantially higher quotas. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

### Important billing behavior

- On the **Free plan**, exceeding quotas does not generate a bill, but Supabase may restrict services after a grace period if usage remains above limits. ([supabase.com](https://supabase.com/docs/guides/platform/billing-faq?utm_source=openai))
- On **Pro**, the spend cap normally prevents unexpected overage charges by restricting usage after quotas are reached. If you turn the spend cap off, usage continues and is billed at the listed overage rates. ([supabase.com](https://supabase.com/docs/guides/platform/billing-faq?utm_source=openai))
- The **$25 Pro fee is not necessarily the final monthly bill**: compute, extra projects, and usage beyond included quotas can add charges. Pro includes compute credits, but larger compute instances or additional projects may cost extra. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

**Rule of thumb:** choose Free for development and small personal apps; choose Pro once you need an always-on production project, automatic backups, more than 500 MB of database space, or more than 5 GB of monthly egress.
```

- T251 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T252 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T253 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T254 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T255 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T256 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T257 — realtime: How does this answer characterise Supabase's realtime features?
- T258 — auth: How does this answer characterise Supabase's built-in authentication?
- T259 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T260 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A27

````text
Yes, you can self-host Supabase. It's open source, and the officially supported route is Docker Compose.

## Requirements
- You need Git and Docker with Docker Compose. On a Linux server or VPS that means Docker Engine plus the Compose plugin. On macOS, Windows or a Linux desktop it means Docker Desktop.
- The minimum hardware is 4 GB RAM, 2 CPU cores and a 40 GB SSD. The recommended spec is 8 GB or more of RAM, 4 or more cores and 80 GB or more of SSD.

## Setup
There are two ways to get the configuration onto your machine.

**1. Quick start (Linux).** One command installs Docker, fetches the configuration, generates all secrets and keys, and prompts for your URLs.

**2. Manual install (any OS).** The commands are:

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Then edit `.env`, pull the images and start the stack:

```bash
docker compose pull
docker compose up -d
```

Supabase maintains the official Docker Compose setup in its GitHub repository. Recent releases also include a `run.sh` helper. It wraps start, stop, restart and printing credentials.

## Before you start it
- **Don't use the placeholder secrets.** The docs say: Do not start the stack with placeholder values from .env.example. Generate your own JWT secret, the anon and service-role keys, the database password and the Studio password.
- **Set your URLs and SMTP.** Configure your domain and an email provider for auth emails.
- **Keep Postgres on a persistent volume.** If a container is removed without volumes configured, all your data disappears.
- **Put HTTPS in front of it.** The docs have a guide on this, using a reverse proxy.

## What you get
The stack runs Postgres, Studio, Auth (GoTrue), PostgREST, Realtime, Storage with imgproxy, Edge Runtime for functions, and postgres-meta, all behind an API gateway.

Logs and Analytics are optional. They aren't in the default Docker Compose configuration. You can add them with `sh run.sh config add logs && sh run.sh start`, which starts two additional services (analytics and vector). They use more resources.

## Limitations
- **Not the CLI stack.** The local stack from the Supabase CLI is not a self-hosted deployment. It isn't hardened for production and must not be exposed to external traffic.
- **Missing managed features.** One third-party summary of Supabase's docs says self-hosting lacks branching, advanced metrics beyond logs, and managed backups and point-in-time recovery. You'll have to handle backups, updates, monitoring and scaling yourself.
- **Kubernetes.** There is also a community-maintained Kubernetes project. It isn't official.

The official guide is at https://supabase.com/docs/guides/self-hosting/docker. If you tell me your setup (VPS, home server or cloud) and what you plan to use it for, I can give more specific advice.
````

- T261 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T262 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T263 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T264 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T265 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T266 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T267 — realtime: How does this answer characterise Supabase's realtime features?
- T268 — auth: How does this answer characterise Supabase's built-in authentication?
- T269 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T270 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A28

```text
You can have **2 active projects** on Supabase's free plan.

- The limit applies across every organization where you're an Owner or Administrator. You could have two Free Plan organizations with one project each, or one Free Plan organization with two projects.
- Paused projects don't count toward the limit. Free projects pause after one week of inactivity. You can keep more than two projects if the extras are paused.
- If you need more than two active projects at once, you'll have to upgrade to the Pro plan.

Each free project also gets a 500 MB database, 1 GB file storage, 50,000 monthly active users, and 5 GB egress.
```

- T271 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T272 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T273 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T274 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T275 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T276 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T277 — realtime: How does this answer characterise Supabase's realtime features?
- T278 — auth: How does this answer characterise Supabase's built-in authentication?
- T279 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T280 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A29

```text
On Supabase’s Free Plan, you can have up to **2 active projects** at a time.

Key details regarding this limit:

* **Scope:** The limit applies across all organizations where you are an Owner or Administrator. You can split them across two separate free organizations (1 project each) or keep both within a single organization.
* **Paused projects do not count:** Only active projects count toward the quota. If you already have two projects and want to create a new one without upgrading, you can pause an existing project from the dashboard to free up a slot.
* **Automatic pausing:** Free-tier projects are automatically paused after **7 days (1 week) of inactivity** to preserve resources, but you can unpause them at any time from your Supabase dashboard.
```

- T281 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T282 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T283 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T284 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T285 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T286 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T287 — realtime: How does this answer characterise Supabase's realtime features?
- T288 — auth: How does this answer characterise Supabase's built-in authentication?
- T289 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T290 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A30

```text
Supabase offers a free tier designed for personal projects, prototypes, and MVPs. 

### 1. Projects & Database
* **Active Projects:** Up to **2 active projects** at a time (paused projects do not count toward this limit).
* **Database Space:** **500 MB** of PostgreSQL database storage on shared compute (approx. 500 MB RAM).
* **API Requests:** **Unlimited** requests via auto-generated REST (PostgREST) and GraphQL APIs.

### 2. Authentication
* **Monthly Active Users (MAUs):** Up to **50,000 MAUs** (total registered users can be higher; only users who sign in during a given month count toward this quota).
* **Auth Features:** Social OAuth providers (Google, GitHub, etc.), email/password, magic links, anonymous logins, and basic Multi-Factor Authentication (MFA).

### 3. Storage & Bandwidth
* **File Storage:** **1 GB** total file storage (with a maximum upload file size of 50 MB).
* **Network Egress:** **5 GB** uncached database/origin egress + **5 GB** cached egress per month.

### 4. Edge Functions & Realtime
* **Edge Functions:** Up to **500,000 invocations** per month.
* **Realtime:** Up to **200 concurrent connections** and **2 million messages** per month.

---

### Key Caveats & Limitations
* **Auto-Pausing:** Projects that experience **7 consecutive days of inactivity** are automatically paused to conserve resources. You can manually unpause them via the Supabase dashboard.
* **No Automated Backups:** Point-in-time recovery (PITR) and automated scheduled backups are not available on the free tier (you must export backups manually).
* **Support:** Access to community support (GitHub discussions and Discord) rather than guaranteed email SLAs.
```

- T291 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T292 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T293 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T294 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T295 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T296 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T297 — realtime: How does this answer characterise Supabase's realtime features?
- T298 — auth: How does this answer characterise Supabase's built-in authentication?
- T299 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T300 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A31

```text
Supabase has four plans. Prices below come from third-party guides, so check Supabase's own pricing page before you budget.

**Plans**
- **Free ($0/month):** Two free projects with a 500 MB database, 1 GB file storage, 5 GB egress, and 50,000 monthly active users. Free projects pause after one week of inactivity.
- **Pro (from $25/month):** Supports up to 100,000 monthly active users, with 8 GB of database per project, 100 GB of storage, 250 GB of egress, and daily backups kept for seven days. It includes a $10/month compute credit per project, which covers one Micro instance.
- **Team (from $599/month):** Includes everything in Pro plus compliance support for SOC2 and ISO 27001. It has the same technical limits as Pro.
- **Enterprise:** Custom pricing.

**Usage overages on paid plans**
Roughly $0.00325 per extra monthly active user, $0.125 per GB of disk, $0.09 per GB of egress, and $0.0213 per GB of file storage. Edge Functions cost $2 per 1 million invocations beyond the included amount.

**Compute tiers**
Supabase provisions dedicated compute instances billed 24/7. The tiers are Micro $10 (1 GB RAM), Small $15 (2 GB), Medium $60 (4 GB), Large $110 (8 GB), XL $210 (16 GB), and 2XL $410 (32 GB).

**What you'll likely pay**
Most early-stage apps stay at exactly $25/month, because the $10 credit covers a Micro instance. One estimate puts a growing app with Small compute, 20 GB of storage and 300 GB of egress at about $36/month. Each extra project adds compute cost on top, starting at $10 per month.
```

- T301 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T302 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T303 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T304 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T305 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T306 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T307 — realtime: How does this answer characterise Supabase's realtime features?
- T308 — auth: How does this answer characterise Supabase's built-in authentication?
- T309 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T310 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A32

```text
Supabase’s **Free tier** is designed for prototyping, learning, and early MVPs, while the **Pro plan** ($25/month per organization) is intended for production applications. 

The primary differences in limits, features, and operational constraints are detailed below.

---

### Comparison Overview

| Feature / Limit | Free Tier ($0) | Pro Plan ($25/month) |
| :--- | :--- | :--- |
| **Active Projects** | Up to 2 active projects | Unlimited (includes $10/mo compute credits) |
| **Inactivity Pausing** | **Auto-pauses after 7 days** of inactivity | **Never pauses** (always-on) |
| **Database Size** | 500 MB | 8 GB included ($0.125/GB thereafter) |
| **Database Compute** | Shared compute (~500 MB RAM) | Dedicated compute (Micro tier covered by credit; scalable) |
| **Bandwidth (Egress)** | 5 GB origin / 5 GB cached egress | 250 GB origin / 250 GB cached included ($0.09/GB & $0.03/GB overage) |
| **File Storage** | 1 GB total | 100 GB included ($0.021/GB overage) |
| **Auth (MAUs)** | Up to 50,000 Monthly Active Users | 100,000 included ($0.00325/user overage) |
| **Realtime** | 200 concurrent connections / 2M messages | 500 concurrent connections / 5M messages |
| **Edge Functions** | 500,000 invocations/month | 2,000,000 invocations included ($2/1M overage) |
| **Backups** | None (manual pg_dump only) | Daily automated backups (7 days retention); PITR available |
| **Log Retention** | 1 day | 7 days |
| **Support** | Community support | Email support |

---

### Key Operational Differences

#### 1. Inactivity and Reliability
* **Free Plan:** If your project goes 7 days without database or API activity, it is automatically paused to conserve resources. You must manually log into the dashboard to wake it up.
* **Pro Plan:** Projects never sleep. It provides a dedicated compute instance (such as a Micro instance with 1 GB RAM, which is covered by the plan’s included $10 monthly compute credit).

#### 2. Hard Caps vs. Overages
* **Free Plan:** Has **strict hard limits**. Once you consume the 500 MB disk space or 5 GB bandwidth, services halt or reject writes until the cycle resets or you upgrade.
* **Pro Plan:** Supports smooth scaling via **usage-based overages**. It comes with a configurable **Spend Cap** enabled by default to prevent unexpected runaway bills. You can disable the spend cap if you never want requests dropped during unexpected traffic spikes.

#### 3. Backups & Disaster Recovery
* **Free Plan:** Does not include automated backups or Point-in-Time Recovery (PITR). You are responsible for scripting your own exports using tools like `pg_dump`.
* **Pro Plan:** Automated daily backups are stored for 7 days. You can also purchase Point-in-Time Recovery (PITR) to restore down to the exact second.

#### 4. Custom Domains & Vanity URLs
* **Free Plan:** Only provides default Supabase subdomains (`<project-id>.supabase.co`).
* **Pro Plan:** Allows you to configure custom vanity domains (e.g., `auth.yourdomain.com`) as a paid add-on, which helps avoid third-party cookie restrictions during OAuth flows.
```

- T311 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T312 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T313 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T314 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T315 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T316 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T317 — realtime: How does this answer characterise Supabase's realtime features?
- T318 — auth: How does this answer characterise Supabase's built-in authentication?
- T319 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T320 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A33

```text
Here's what Supabase's Free plan includes. The figures come from third-party pricing guides, so check Supabase's own pricing page for the latest numbers.

**Included resources**
- **Projects:** 2 active projects per organization.
- **Database:** 500 MB per project.
- **File storage:** 1 GB.
- **Egress:** 5 GB uncached plus 5 GB cached per billing period.
- **Auth:** 50,000 monthly active users.
- **API requests:** Unlimited.
- **Edge Functions:** 500,000 invocations per month.
- **Realtime:** 200 concurrent connections and 2 million messages per month.
- **Support:** Community support only.
- **Credit card:** None required.

**Limitations**
- **Auto-pause:** Free projects auto-pause after 1 week of inactivity and must be manually restored. A paused project doesn't count toward the active limit until you resume it.
- **No backups, SLA, or SSO:** There are no daily backups, no SLA, and no SSO.
- **Not for production:** The free tier is generally not suitable for production applications.

If you outgrow it, the Pro plan is $25/org/month plus usage, with 8 GB database, 100 GB storage, no pausing, and a $10 compute credit.
```

- T321 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T322 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T323 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T324 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T325 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T326 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T327 — realtime: How does this answer characterise Supabase's realtime features?
- T328 — auth: How does this answer characterise Supabase's built-in authentication?
- T329 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T330 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A34

````text
**Yes, you can self-host Supabase.** Supabase is open source and designed to be run on your own infrastructure. It consists of several microservices (PostgreSQL, GoTrue for Auth, PostgREST for REST APIs, Realtime, Storage, Kong API Gateway, and the Supabase Studio dashboard).

The official and most common way to self-host is using **Docker Compose**.

---

### Step-by-Step Guide: Self-Hosting with Docker Compose

#### 1. Prerequisites
* A server/VPS (Ubuntu/Debian recommended) with:
  * Minimum: 2 CPUs, 4 GB RAM (8 GB+ recommended for production).
* **Git** installed.
* **Docker** and **Docker Compose (v2)** installed.

---

#### 2. Clone the Supabase Repository
Clone only the Docker setup directory to save bandwidth and disk space:

```bash
# Clone the repository
git clone --depth 1 https://github.com/supabase/supabase

# Navigate to the docker directory
cd supabase/docker
```

---

#### 3. Configure Environment Variables
Copy the sample environment file:

```bash
cp .env.example .env
```

Open `.env` in a text editor (e.g., `nano .env`) and **change all default secrets**. This is critical for security:

1. **`POSTGRES_PASSWORD`**: Set a strong password for your database.
2. **`JWT_SECRET`**: Set a strong random string (at least 32 characters).
3. **`ANON_KEY` and `SERVICE_ROLE_KEY`**: 
   * These are JWT tokens signed with your `JWT_SECRET`.
   * You can generate them using an online tool like [jwt.io](https://jwt.io) or Supabase's provided API key generator, setting the role claim to `anon` and `service_role` respectively.
4. **`DASHBOARD_USERNAME` & `DASHBOARD_PASSWORD`**: Credentials used to log into the Supabase Studio web UI.
5. **`API_EXTERNAL_URL`**: Set this to your public domain (e.g., `https://api.yourdomain.com`).

---

#### 4. Pull and Start the Services

Pull the required Docker images and start the stack in detached mode:

```bash
docker compose pull
docker compose up -d
```

To verify that all services are running properly:

```bash
docker compose ps
```

---

#### 5. Access Supabase

By default, the services run behind the Kong API gateway:

* **Supabase Studio (Dashboard):** `http://<your-server-ip>:8000` (or `http://localhost:8000`)
* **REST API:** `http://<your-server-ip>:8000/rest/v1/`
* **Auth API:** `http://<your-server-ip>:8000/auth/v1/`
* **Direct Database Access:** Port `5432`

---

### Production Best Practices

If you plan to run Supabase in production, keep the following in mind:

1. **Set up a Reverse Proxy & SSL (HTTPS):**
   * Do not expose port 8000 directly over plain HTTP.
   * Put **Nginx**, **Caddy**, or **Traefik** in front of port `8000` to handle SSL certificates (via Let's Encrypt).
2. **Backups:**
   * Unlike Supabase Cloud, self-hosting does not automatically back up your database. Set up scheduled backups using `pg_dump` or continuous archiving tools like **WAL-G** or **pgBackRest**.
3. **Email Provider (SMTP):**
   * In `.env`, configure SMTP settings (e.g., Resend, SendGrid, Postmark) so that user confirmation emails and password resets work properly.
4. **Storage S3 Backend:**
   * Supabase Storage can save files locally on disk, but for scale, configure it in `.env` to point to an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).

---

### Alternative Self-Hosting Methods

* **Self-Hosted PaaS (Easiest UI):** Platforms like **Coolify** or **Elestio** have 1-click templates for Supabase, handling SSL and updates automatically.
* **Kubernetes:** Community Helm charts exist if you prefer orchestrating across a cluster (e.g., search for the community-maintained `supabase-kubernetes` Helm chart).
````

- T331 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T332 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T333 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T334 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T335 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T336 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T337 — realtime: How does this answer characterise Supabase's realtime features?
- T338 — auth: How does this answer characterise Supabase's built-in authentication?
- T339 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T340 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A35

```text
For a small app, **Firebase is almost always cheaper**—usually costing **$0 to under $5/month**. 

While both have generous free tiers, the biggest difference lies in what happens when your app slightly exceeds the free limits or experiences low activity.

---

### 1. The Free Tier ($0/month)
Both platforms offer generous free allowances, but with one critical operational difference:

| Feature | Firebase (Spark Plan) | Supabase (Free Plan) |
| :--- | :--- | :--- |
| **Database Limit** | 1 GiB (Firestore) / 1 GiB (RTDB) | 500 MB (PostgreSQL) |
| **Auth** | 50,000 monthly active users (MAU) | 50,000 MAU |
| **File Storage** | 5 GB | 1 GB |
| **Inactivity Policy** | **Never pauses** | **Pauses after 7 days** of inactivity |

* **Winner:** **Firebase.** 
* *Why:* If your small app has intermittent traffic (e.g., an internal tool, weekend side-project, or early-stage MVP), Supabase will pause your database after a week of no requests, causing slow cold starts (or downtime) when a user finally visits. Firebase stays active indefinitely.

---

### 2. The "In-Between" Zone (Slightly Exceeding the Free Tier)
This is where the pricing models diverge drastically:

* **Firebase (Blaze Plan):** Operates on a **pure pay-as-you-go** model. Your free allowances still apply, and you only pay for what you exceed. If you store 1.5 GB of data (0.5 GB over the limit), you pay roughly **$0.09/month**.
* **Supabase (Pro Plan):** To unlock overages and prevent inactivity pausing, you must upgrade to the Pro plan, which has a **mandatory $25/month base fee**.

* **Winner:** **Firebase.** 
* *Why:* A small app running on Firebase that outgrows the free tier typically costs **$1 to $3/month**, whereas moving off the Supabase free tier immediately costs **$25/month**.

---

### 3. Where Firebase Can Backfire
Firebase is cheaper *unless* your small app has unusual query patterns:

* **Document Reads/Writes:** Firestore charges per read and write operation (after 50k reads/day). If your app relies on infinite-scroll lists, frequent real-time syncs, or poorly indexed queries that read thousands of documents per page load, Firebase costs can climb unexpectedly.
* **Complex Data / Relations:** Supabase runs standard PostgreSQL. You can run complex joins, aggregates, and heavy queries without paying per row inspected, bounded only by your allocated compute/RAM.

---

### Summary Recommendation

* **Choose Firebase if:**
  * Keeping costs as close to **$0 – $2/month** as possible is your primary goal.
  * You don't want to worry about your database pausing during low-traffic periods.
  * Your data model fits cleanly into a NoSQL document database.

* **Choose Supabase if:**
  * You need relational data (SQL, foreign keys, joins) from day one.
  * You are comfortable paying **$25/month** once your app needs high reliability, 24/7 uptime without pausing, or more than 500 MB of storage.
```

- T341 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T342 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T343 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T344 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T345 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T346 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T347 — realtime: How does this answer characterise Supabase's realtime features?
- T348 — auth: How does this answer characterise Supabase's built-in authentication?
- T349 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T350 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A36

```text
Supabase uses a hybrid pricing model consisting of a **base subscription plan** combined with **usage-based billing** (with spend caps available to prevent surprise charges).

---

### 1. Base Subscription Plans

| Plan | Price | Best For | Key Inclusions |
| :--- | :--- | :--- | :--- |
| **Free** | **$0 / month** | Side projects, prototyping, learning | • Up to 2 active projects<br>• 500 MB database per project<br>• 1 GB file storage<br>• 50,000 monthly active users (MAU)<br>• 5 GB egress<br>*(Projects pause after 7 days of inactivity)* |
| **Pro** | **$25 / month** *(per org)* | Production apps, solo founders, small teams | • No project auto-pausing (always on)<br>• $10/month compute credit (covers 1 Micro instance)<br>• 8 GB database space included<br>• 100 GB file storage<br>• 100,000 MAUs included<br>• 250 GB egress<br>• 7-day backup retention |
| **Team** | **$599 / month** *(per org)* | Scaling startups & companies requiring compliance | • SOC 2 compliance & HIPAA compliance option<br>• SSO / SAML for organization members<br>• Priority support & SLA<br>• 14-day backup retention<br>• Enhanced collaboration & security controls |
| **Enterprise** | **Custom** | Large organizations with bespoke requirements | • Custom SLAs & dedicated 24/7 support<br>• Custom contract / invoicing<br>• Dedicated clusters or Bring-Your-Own-Cloud (BYOC) deployment options |

---

### 2. Usage & Overages (Pro & Team)

If you exceed the allowances included in the Pro or Team plan, costs scale based on usage:

* **Compute instances:** Database compute is billed per project. Paid plans include a $10/mo credit (which completely offsets one **Micro** compute instance). Larger instances scale up:
  * *Small:* ~$20/month
  * *Medium:* ~$40/month
  * *Large, XL, 2XL+:* Up to several hundred dollars per month for heavy workloads.
* **Database storage:** ~$0.125 per GB/month beyond the included 8 GB.
* **Bandwidth / Egress:** ~$0.09 per GB beyond 250 GB.
* **File storage:** ~$0.021 per GB/month beyond 100 GB.
* **Monthly Active Users (Auth):** ~$0.00325 per user beyond 100,000 MAU.

*(Note: On the Pro tier, you can toggle a **Spend Cap** on or off. With the spend cap enabled, your bill will not exceed $25/month; resources will simply halt or degrade if quotas are reached until the next billing cycle.)*

---

### 3. Popular Add-ons
* **Custom Domain:** $10/month per project.
* **Dedicated IPv4:** $4/month per project.
* **Point-in-Time Recovery (PITR):** Starts at $100/month per project (allows you to restore your database to any second within a 7-day to 28-day window).

---

### What to Expect on Your Bill
* **Hobby / Learning:** **$0**
* **Early Production App:** **$25/month** (fits within the base Pro tier + included compute credit).
* **Growing SaaS App:** **$35 – $150/month** (usually from upgrading to a *Small* or *Medium* compute instance and modest storage/egress overages).
```

- T351 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T352 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T353 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T354 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T355 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T356 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T357 — realtime: How does this answer characterise Supabase's realtime features?
- T358 — auth: How does this answer characterise Supabase's built-in authentication?
- T359 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T360 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A37

```text
**Yes, Supabase is open source.** You can view the code, contribute, and self-host the entire platform using Docker.

### Licensing Details

Rather than being a single monolithic program, Supabase is an integrated platform built from several open-source components. The core repositories and surrounding tools are primarily licensed under **permissive open-source licenses**:

* **Main Repository & Studio (Dashboard):** Licensed under the **[Apache License 2.0](https://github.com/supabase/supabase/blob/master/LICENSE)**.
* **Client Libraries (e.g., `supabase-js`):** Licensed under **MIT** or **Apache 2.0**.
* **Core Underlying Technologies:**
  * **PostgreSQL (Database):** PostgreSQL License
  * **PostgREST (REST API):** MIT License
  * **GoTrue (Auth API):** MIT License
  * **Realtime Server:** Apache 2.0
  * **Storage API:** Apache 2.0
  * **Edge Runtime (Deno-based):** MIT License

Because the core platform and its dependencies use permissive OSI-approved licenses (mainly Apache 2.0 and MIT), you can freely run, modify, inspect, and self-host Supabase without licensing fees.
```

- T361 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T362 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T363 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T364 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T365 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T366 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T367 — realtime: How does this answer characterise Supabase's realtime features?
- T368 — auth: How does this answer characterise Supabase's built-in authentication?
- T369 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T370 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A38

```text
Supabase integrates with a broad range of tools through its native features, APIs, client libraries, and partner marketplace. Key categories include:

- **Hosting and deployment:** Vercel, Cloudflare, AWS, Fly.io
- **Frontend frameworks:** React, Next.js, Vue, Nuxt, SvelteKit, Astro, Flutter, Expo/React Native, iOS Swift, Android Kotlin, Laravel, Rails, and Spring Boot
- **Authentication:** Google, GitHub, GitLab, Apple, Azure/Microsoft, Discord, Facebook, LinkedIn, Slack, Notion, Spotify, Twitch, Twitter/X, Zoom, WorkOS, Keycloak, Auth0, Clerk, Firebase Auth, and AWS Cognito
- **AI and vector tools:** OpenAI, Hugging Face, LangChain, Amazon Bedrock, and pgvector-based applications
- **Payments and billing:** Stripe
- **Email and messaging:** Resend, Twilio, Vonage, MessageBird, and other notification providers
- **Analytics, BI, and observability:** Grafana, Hex, Metabase-style PostgreSQL clients, Sentry, and other Postgres-compatible tools
- **Data platforms and sync:** BigQuery, ClickHouse, Firebase/Firestore, PowerSync, Readyset, and Stripe data
- **Low-code and internal tools:** Retool-like tools and partners such as DronaHQ, ILLA, Internal, Windmill, and Stacksync
- **Developer and automation tools:** Trigger.dev, Windmill, Cloudflare Workers, MCP/AI tools, and the Supabase CLI

Supabase also supports **any tool that can connect to PostgreSQL**, plus REST, GraphQL, client-library, and Management API integrations. Its official Partner Catalog currently groups integrations into AI, API, authentication, caching/offline-first, data platforms, developer tools, foreign data wrappers, low-code, messaging, observability, security, and storage. ([supabase.com](https://supabase.com/docs/guides/integrations/partner-catalog?utm_source=openai))

For the most complete and current list, use Supabase’s **Partner Catalog** and **Integrations** documentation, since the catalog changes over time. ([supabase.com](https://supabase.com/docs/guides/integrations?utm_source=openai))
```

- T371 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T372 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T373 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T374 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T375 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T376 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T377 — realtime: How does this answer characterise Supabase's realtime features?
- T378 — auth: How does this answer characterise Supabase's built-in authentication?
- T379 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T380 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A39

```text
When you self-host Supabase (typically via Docker Compose or Kubernetes), you get the core open-source engine—PostgreSQL, GoTrue (Auth), PostgREST, Storage API, Realtime, Supavisor, and Supabase Studio. 

However, you lose several proprietary management layers, cloud services, and UI conveniences.

---

### 1. Cloud-Exclusive Platform Features
According to Supabase's documentation, several features only exist on their managed platform and **do not work** when self-hosting:

* **Database Branching:** The Git-integrated workflow for spinning up preview databases alongside pull requests is proprietary to the managed platform.
* **Managed Backups & PITR (Point-In-Time Recovery):** The Cloud's one-click restore and rolling continuous WAL-level recovery are missing. You must build your own backup strategy (e.g., `pg_dump`, `pgBackRest`, or WAL-G).
* **Management API:** The API used to programmatically create projects, provision resources, and manage organizations is exclusively a cloud service.
* **Storage Analytics & Vector Buckets:** Storage access metrics, bucket analytics, and built-in vector pipeline ETL tools are not available.
* **Platform Observability & Deep Query Insights:** The advanced performance graphs, slow-query insights, and platform-level logging aren't available out of the box. While an optional Logflare/Vector container exists for self-hosting, it requires manual setup and only captures container-level logs.

---

### 2. Supabase Studio (Dashboard) Limitations
The self-hosted version of the Studio UI is intentionally stripped down compared to Supabase Cloud:

* **Single-Project Only:** Self-hosted Studio only connects to the single database/project running alongside it. It does not support multiple organizations, projects, or team member permission management.
* **No UI-based Configuration:** In the cloud, you can configure Auth providers (Google, GitHub, etc.), rate limits, and custom SMTP directly via the dashboard. In self-hosted setups, **most settings must be configured via environment variables** (`.env` file) or config files.
* **Restricted Email Template Editor:** Editing auth email templates graphically in Studio is generally disabled; templates must be mounted as static files or injected via environment configurations.

---

### 3. Edge Functions Workflow Gaps
While the Supabase **Edge Runtime** (Deno) is open-source and included in the self-hosted stack, its developer experience differs drastically:
* There is no Cloud-style UI for viewing deployed edge functions, viewing invocations, or editing secrets in the dashboard.
* Deploying functions cannot easily be done via the standard `supabase functions deploy` CLI command targeting remote instances. You must manually mount function directories into the Docker container or orchestrate your own deployment pipeline.

---

### 4. Infrastructure Services Missing by Default
Several convenience integrations provided automatically in Supabase Cloud must be provisioned and managed manually when self-hosting:

* **Built-in Global CDN:** Supabase Cloud serves storage assets through an integrated global edge network (Cloudflare/Fastly). Self-hosted storage is served directly from your storage backend (e.g., local volume or MinIO/S3) unless you place an external CDN in front of it.
* **Default Transactional Email (SMTP) & SMS:** Supabase Cloud provides a shared default mail service for testing signups and built-in integrations for Twilio/MessageBird. When self-hosting, Auth will fail to send signup confirmations unless you supply custom SMTP credentials (e.g., AWS SES, Resend, Sendgrid) from day one.
* **Read Replicas & High Availability:** Setting up read replicas or multi-region routing requires manual PostgreSQL clustering and configuring Supavisor manually, rather than enabling them with a slider.
* **Automatic Scaling:** CPU/RAM upgrades, storage auto-expansion, and connection limit scaling are completely your operational responsibility.

---

### Summary Checklist
| Feature | Supabase Cloud | Self-Hosted |
| :--- | :--- | :--- |
| **Core Postgres, Auth, Realtime, REST API** | Yes | Yes |
| **Database Branching** | Yes | **No** |
| **Point-In-Time Recovery (PITR)** | Yes | **No** (DIY) |
| **Management API** | Yes | **No** |
| **Multi-Project / Multi-Org Studio** | Yes | **No** (Single project) |
| **Dashboard UI Settings (OAuth, SMTP)** | Yes | **No** (Handled via `.env`) |
| **Built-in CDN & Global Caching** | Yes | **No** (DIY) |
| **CLI / Studio Edge Functions Management**| Yes | **Manual / Limited** |
```

- T381 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T382 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T383 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T384 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T385 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T386 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T387 — realtime: How does this answer characterise Supabase's realtime features?
- T388 — auth: How does this answer characterise Supabase's built-in authentication?
- T389 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T390 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A40

```text
As of the current Supabase documentation, the main **Supabase Cloud features you lose or must replace when self-hosting** are:

| Feature | Self-hosted status |
|---|---|
| **Branching / preview environments** | Not available as Supabase’s managed branching feature. You must build your own CI/CD or create separate instances. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai)) |
| **Management API** | Not available. You cannot use Supabase’s hosted API to create/manage projects, organizations, billing, regions, etc. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai)) |
| **Managed backups and Point-in-Time Recovery (PITR)** | Not provided. You are responsible for backups, WAL archiving, restoration, and disaster recovery. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai)) |
| **Supabase Reports** | Not available. The hosted Reports dashboards for database, Auth, Storage, Realtime, and API monitoring are Cloud-only. ([supabase.com](https://supabase.com/docs/guides/observability/reports?utm_source=openai)) |
| **Metrics API** | Not available on self-hosted instances. You need to collect metrics with your own Prometheus/OpenTelemetry/monitoring setup. ([supabase.com](https://supabase.com/docs/guides/observability/metrics?utm_source=openai)) |
| **Advanced managed observability** | The default self-hosted stack does not include Logs & Analytics. You can add the Logflare/Vector services yourself, but you operate and scale them. ([supabase.com](https://supabase.com/docs/reference/self-hosting-analytics?utm_source=openai)) |
| **Analytics Buckets and Vector Buckets** | Not available in self-hosted Supabase. This is different from using `pgvector`, which is supported. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai)) |
| **ETL** | Not available as the managed Supabase feature. You need another ETL/data-pipeline solution. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai)) |
| **Multiple organizations/projects in Studio** | Self-hosted Supabase is effectively a single project; Studio does not provide the hosted multi-organization/project management experience. ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai)) |
| **Managed multi-region Edge Functions** | Edge Functions work, but a standalone self-hosted instance does not automatically deploy them globally across multiple regions. ([supabase.com](https://supabase.com/docs/guides/self-hosting/self-hosted-functions?utm_source=openai)) |

### What still works

The core backend components generally work: **Postgres, Auth, REST/PostgREST, Realtime, Storage, Edge Functions, Studio, connection pooling, SQL Editor, and `pgvector`**. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))

The important distinction is that self-hosting gives you the **open-source Supabase services**, but not the full **Supabase Cloud control plane and managed operations**.

You are also responsible for:

- Server and OS maintenance
- TLS, networking, and security hardening
- Scaling and high availability
- Backups and disaster recovery
- SMTP/email delivery
- Monitoring and alerting
- Upgrades and version compatibility
- Support, which is primarily community-based for ordinary self-hosted deployments ([supabase.com](https://supabase.com/Docs/Guides/Self-Hosting?utm_source=openai))

So, if you mainly need **database + Auth + Storage + Realtime + Edge Functions**, self-hosting is quite capable. If you need **branching, PITR, hosted observability, multi-project management, or zero-ops scaling**, Supabase Cloud is the safer choice.
```

- T391 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T392 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T393 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T394 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T395 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T396 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T397 — realtime: How does this answer characterise Supabase's realtime features?
- T398 — auth: How does this answer characterise Supabase's built-in authentication?
- T399 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T400 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A41

```text
Yes. **Supabase may automatically pause Free Plan projects that have low activity over a 7-day period**, primarily when they receive too few database queries. A few requests per day is typically enough to avoid pausing, but Supabase doesn’t publish a strict request threshold. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))

- They generally email you about a week before pausing.
- You can prevent it by visiting the project dashboard or generating API/database activity.
- A paused project’s data and configuration are preserved, and you can resume it from the dashboard.
- You have **up to one year** to restore it after pausing.
- Paid-plan projects aren’t automatically paused for inactivity. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))
```

- T401 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T402 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T403 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T404 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T405 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T406 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T407 — realtime: How does this answer characterise Supabase's realtime features?
- T408 — auth: How does this answer characterise Supabase's built-in authentication?
- T409 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T410 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A42

```text
Yes. Supabase pauses free-tier projects that go unused.

- **Timing:** Free projects are paused after 1 week of inactivity. Paid plans are exempt: Projects on paid plans aren't paused for inactivity.
- **What counts as activity:** The measure is database activity, not dashboard visits. A free project is considered inactive if it doesn't receive enough user database activity over the past week. Supabase's docs say a few user requests to the database each day is typically enough to keep it active. A project can be well within its usage quotas and still be paused if it has insufficient database activity.
- **Your data:** A paused project is not a deleted project. The database is frozen in place and your data is still on disk. You can restore it by opening the dashboard, selecting the project and clicking Resume project. According to the docs, you can restore a paused project from the dashboard for up to a year after it was paused.
- **Project limit:** When a project is paused, it does not count against your 2-project limit.
- **Backups:** The free tier has zero days of backup retention, so export anything important yourself.

To keep a free project awake, schedule a small query against the database, for example with a cron job. Supabase's official answer is to upgrade to Pro.

The exact threshold has changed before, so check Supabase's current docs or dashboard if this matters for your project.
```

- T411 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T412 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T413 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T414 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T415 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T416 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T417 — realtime: How does this answer characterise Supabase's realtime features?
- T418 — auth: How does this answer characterise Supabase's built-in authentication?
- T419 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T420 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A43

```text
Supabase’s Free Plan allows **2 active projects** across your account. **Paused projects don’t count** toward that limit. Free projects may be automatically paused after about **7 days of inactivity**. ([supabase.com](https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=openai))
```

- T421 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T422 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T423 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T424 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T425 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T426 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T427 — realtime: How does this answer characterise Supabase's realtime features?
- T428 — auth: How does this answer characterise Supabase's built-in authentication?
- T429 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T430 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A44

```text
Yes—**Supabase is largely open source**, including its self-hosting stack and major components. The main Supabase repository is licensed under the **Apache License 2.0**, a permissive open-source license that allows use, modification, and redistribution subject to conditions such as preserving notices. ([github.com](https://github.com/supabase/supabase/blob/master/LICENSE?utm_source=openai))

However, **Supabase is not uniformly under a single license**. Individual services may use different open-source licenses—for example, **Supabase Auth is licensed under the MIT License**. ([github.com](https://github.com/supabase/auth/blob/master/LICENSE?utm_source=openai))

So, in short:

- **Supabase platform/self-hosting repository:** Apache License 2.0
- **Some individual components:** MIT or other compatible open-source licenses
- **Hosted Supabase service:** You use it as a service; its hosted terms are separate from the licenses covering the source code.
```

- T431 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T432 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T433 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T434 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T435 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T436 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T437 — realtime: How does this answer characterise Supabase's realtime features?
- T438 — auth: How does this answer characterise Supabase's built-in authentication?
- T439 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T440 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A45

```text
Yes, Supabase is open source. Its main repository is under the **Apache License 2.0**. Supabase's own docs say "Supabase is open source" and list the license as Apache 2. The GitHub repo also shows an Apache-2.0 license.

**Other components have their own licenses.** Supabase is a combination of existing open source tools plus ones it built itself. According to its architecture docs:
- Postgres uses the PostgreSQL License.
- Studio (the dashboard) is Apache 2, GoTrue (Auth) is MIT, and PostgREST is MIT.
- Realtime is Apache 2.
- The Storage API is Apache 2.0.

**What this means in practice:**
- Apache 2.0 is a permissive OSI-approved license that allows commercial use, modification, and distribution with minimal restrictions. You do have to retain license headers and provide notice of changes.
- It is permissive, patent-granting, and forkable with no network copyleft clause.
- You can self-host. The provided Docker Compose setup lets you run the entire stack.

**One caveat:** Some third-party sources say certain enterprise features, such as SSO and HIPAA BAA, are paywalled behind paid commercial plans. These are mostly about the hosted service and compliance, not the code. Another source claims every meaningful feature runs in self-hosted mode without any license fee. If a specific feature matters to you, check Supabase's docs.
```

- T441 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T442 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T443 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T444 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T445 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T446 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T447 — realtime: How does this answer characterise Supabase's realtime features?
- T448 — auth: How does this answer characterise Supabase's built-in authentication?
- T449 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T450 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
