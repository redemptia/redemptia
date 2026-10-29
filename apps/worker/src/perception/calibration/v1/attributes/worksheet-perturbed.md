Label every item under its answer per PROCEDURE.md §5 and §7b, against each attribute's question (never its
name), for Supabase only. `positive`, `negative`, `mixed` or `not_discussed` for each attribute. There are no drift items here.
Record the label, the exact passage that decided it (copied verbatim; empty for not_discussed), and a
one-line rationale for every label other than not_discussed, in labels-template-perturbed.csv.

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

## A46

```text
## Short answer

**For a genuinely small app, Firebase is usually cheaper—often $0/month.**  
**Supabase is more predictable and may be cheaper once you need a paid, always-on backend.**

| Scenario | Cheaper choice | Why |
|---|---|---|
| Prototype, hobby app, low traffic | **Firebase** | Spark plan requires no payment method and includes useful quotas for Firestore, Hosting, and Authentication. |
| Small production app with SQL/Postgres needs | **Supabase** | Its free tier includes a Postgres database, Auth, Storage, and generous API usage. |
| Always-on production app | **Firebase**, potentially | Firebase Blaze has no fixed monthly fee; you pay only beyond quotas. |
| Want predictable billing and simpler budgeting | **Supabase** | Pro is a flat **$25/month**, with included usage and spend caps enabled by default. |
| Phone/SMS authentication | **Neither is inherently cheap** | Both charge separately for phone verification/SMS usage. |

### Free tiers

**Supabase Free** includes, per project:

- 500 MB Postgres database
- 50,000 monthly active users
- 1 GB file storage
- 5 GB egress
- Unlimited API requests
- Two free projects, though inactive projects can be paused after one week. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

**Firebase Spark** includes no-cost quotas such as:

- 50,000 Firestore document reads per day
- 20,000 Firestore writes per day
- 1 GB Firestore storage
- 10 GB Firebase Hosting storage
- 360 MB/day Hosting transfer
- Up to 50,000 Authentication monthly active users for supported authentication methods. ([firebase.google.com](https://firebase.google.com/pricing?hl=en&trk=article-ssr-frontend-pulse_little-text-block))

### Paid plans

Supabase Pro starts at **$25/month**. That includes 100,000 MAUs, 8 GB database disk, 100 GB file storage, and 250 GB egress; additional projects generally add compute costs. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

Firebase Blaze has **no base subscription fee**. It retains the free quotas and charges only for usage beyond them, but you must attach a billing account. Firebase budget alerts notify you but do not automatically cap charges. ([firebase.google.com](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans?hl=EN&rd=1&visit_id=638920144206502039-1497185943))

## My practical recommendation

Choose **Firebase** if:

- You want the lowest possible bill for a small app.
- You’re comfortable with NoSQL/Firestore.
- You need flexible sign-in flows, since Supabase’s built-in auth is more limited and harder to customise.
- You may use push notifications, Crashlytics, Analytics, or mobile-focused features.
- You want to remain on a pay-as-you-go plan instead of paying $25/month immediately.

Choose **Supabase** if:

- You want PostgreSQL, SQL queries, joins, and relational data.
- You prefer a more conventional backend.
- You want a predictable $25/month production plan.
- You expect to need database-heavy features or easy data export.

**Bottom line:** For most small apps, start with **Firebase if minimizing cost is the priority**. Choose **Supabase** if the advantages of Postgres are important enough to justify its paid production plan later.
```

- T451 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T452 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T453 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T454 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T455 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T456 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T457 — realtime: How does this answer characterise Supabase's realtime features?
- T458 — auth: How does this answer characterise Supabase's built-in authentication?
- T459 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T460 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A47

```text
Supabase integrates with a wide variety of tools, frameworks, and services across the modern development stack. Because it is built on top of standard PostgreSQL, it works natively with almost any tool that can connect to a Postgres database or consume REST/GraphQL/WebSocket APIs.

Here is a breakdown of the primary tools and platforms Supabase integrates with by category:

---

### 1. **Deployment & Cloud Platforms**
* **Vercel:** First-party integration for automatic environment variable syncing, Edge Functions, and starter templates.
* **Netlify:** Automatic environment syncing and pre-configured deployment templates.
* **Cloudflare:** Works closely with Cloudflare Workers and Pages via the Supabase JS client and Hyperdrive.
* **Fly.io & AWS / Google Cloud:** Common pairings for containerized backend services communicating with Supabase DB.

---

### 2. **Frontend & Mobile Frameworks (Official / Community SDKs)**
Supabase provides official client libraries and integrations for:
* **Web:** Next.js, React, Nuxt / Vue, SvelteKit, Angular, SolidJS, Remix, Astro.
* **Mobile & Cross-Platform:** Flutter, React Native, Expo, Swift (iOS), Kotlin (Android).
* **Languages / Backends:** TypeScript/JavaScript, Python, Go, C# (.NET), Dart, Ruby.

---

### 3. **AI & Vector Tooling (pgvector)**
Supabase has built-in vector support (`pgvector`) for embeddings and RAG architectures:
* **LangChain & LlamaIndex:** Native vector store connectors for document retrieval and embeddings.
* **OpenAI & Hugging Face:** Direct integration patterns to generate embeddings and run similarity searches.
* **Flowise & Langfuse:** Visual AI orchestration and LLM observability tools.

---

### 4. **Low-Code & Internal Tool Builders**
* **Retool:** Native Supabase/PostgreSQL integration to build internal dashboards and admin panels.
* **FlutterFlow:** First-party Supabase support for building native mobile apps without writing code.
* **Appsmith & ToolJet:** Rapid internal app development directly connected to Supabase tables.
* **WeWeb & Draftbit:** Visual frontend builders with dedicated Supabase authentication and database connectors.

---

### 5. **Authentication & SSO Providers**
Supabase Auth supports dozens of social and enterprise identity providers out of the box:
* **Social / OAuth:** Google, GitHub, Apple, Discord, Twitter/X, Facebook, Slack, Spotify, Twitch, Bitbucket, GitLab.
* **Enterprise SSO:** Azure AD, Okta, PingIdentity, and generic SAML 2.0.
* **Phone & Magic Link:** Twilio, MessageBird, Vonage.

---

### 6. **ORMs & Database Tooling**
* **ORMs & Query Builders:** Prisma, Drizzle ORM, Kysely, TypeORM, SQLAlchemy (Python).
* **Database Clients:** DBeaver, TablePlus, pgAdmin, DataGrip (via direct Postgres connection string or Supavisor connection pooler).
* **BI & Analytics:** Metabase, Preset/Apache Superset, Grafana.

---

### 7. **Automation & Workflows**
* **Zapier & Make (Integromat):** Trigger workflows on Supabase database inserts/updates, or send data into Supabase.
* **n8n:** Self-hosted workflow automation using Supabase nodes or Postgres triggers.
* **GitHub Actions:** CI/CD workflows for automated database migrations and edge function deployments using the Supabase CLI.

---

### 8. **Payments & Communications**
* **Stripe:** Direct integration via Supabase Edge Functions, database webhooks, and the *Stripe Sync Engine* to mirror subscription/billing data in Postgres.
* **Resend, SendGrid, Postmark:** Custom SMTP and transactional email delivery for auth verification and notifications.
* **Twilio:** SMS-based OTP and multi-factor authentication (MFA).

---

### 9. **Monitoring & Observability**
* **Axiom & Datadog:** Streaming database and API logs for monitoring and alerting.
* **UptimeRobot & Better Stack:** Uptime checks worth adding early, since Supabase's hosted platform has a history of outages and slowdowns under heavy traffic.
* **Sentry:** Error tracking across Supabase Edge Functions and client applications.

You can browse active third-party integrations and pre-built connectors directly in the **[Supabase Integrations Directory](https://supabase.com/partners/integrations)**.
```

- T461 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T462 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T463 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T464 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T465 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T466 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T467 — realtime: How does this answer characterise Supabase's realtime features?
- T468 — auth: How does this answer characterise Supabase's built-in authentication?
- T469 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T470 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A48

```text
On Supabase's Free plan, you can have up to **2 active projects** at any given time.

Key details to keep in mind:

* **Account-wide limit:** The limit of two active projects applies across all organizations where you are an Owner or Administrator. (For example, one organization with two projects, or two organizations with one project each).
* **Paused projects:** Paused projects **do not** count toward the active project limit. Projects on the Free plan automatically pause after 7 days of inactivity, but they can be manually restored from your dashboard when needed, although the dashboard is clumsy enough that routine project management feels like a chore.
* **Free tier resource limits (per project):** Each free project includes up to 500 MB of database storage, 1 GB of file storage, and up to 50,000 monthly active users (MAUs).
* **Needing more:** If you need more than two active projects running simultaneously, you will need to upgrade to a paid plan (such as the Pro plan).
```

- T471 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T472 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T473 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T474 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T475 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T476 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T477 — realtime: How does this answer characterise Supabase's realtime features?
- T478 — auth: How does this answer characterise Supabase's built-in authentication?
- T479 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T480 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A49

```text
On Supabase's Free plan, you can have up to **2 active projects** at any given time.

Key details to keep in mind:

* **Account-wide limit:** The limit of two active projects applies across all organizations where you are an Owner or Administrator. (For example, one organization with two projects, or two organizations with one project each).
* **Paused projects:** Paused projects **do not** count toward the active project limit. Projects on the Free plan automatically pause after 7 days of inactivity, but they can be manually restored from your dashboard when needed.
* **Free tier resource limits (per project):** Each free project includes up to 500 MB of database storage, 1 GB of file storage, and up to 50,000 monthly active users (MAUs).
* **Needing more:** If you need more than two active projects running simultaneously, you will need to upgrade to a paid plan (such as the Pro plan).

Self-hosting won't get you around this limit in any useful way either, because the open-source version leaves out much of what the hosted platform offers.
```

- T481 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T482 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T483 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T484 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T485 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T486 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T487 — realtime: How does this answer characterise Supabase's realtime features?
- T488 — auth: How does this answer characterise Supabase's built-in authentication?
- T489 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T490 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A50

```text
Supabase’s **Free plan** is designed for hobby projects, prototyping, and learning. It gives you access to a dedicated PostgreSQL database and all core platform features at **$0/month**.

---

### Core Limits and Allowances

* **Active Projects:** Up to **2 active projects** per account (paused projects do not count toward this limit).
* **Database (PostgreSQL):**
  * **500 MB** database storage.
  * Shared compute (~500 MB RAM).
  * **Unlimited** API requests.
* **Authentication:**
  * Up to **50,000 Monthly Active Users (MAUs)**.
  * Built-in authentication (Email/Password, Magic links, Phone/SMS, and third-party OAuth providers).
* **Storage:**
  * **1 GB** file storage.
* **Data Transfer (Egress):**
  * **5 GB** uncached database egress per month.
  * **5 GB** cached egress per month.
* **Edge Functions:**
  * Up to **500,000 invocations** per month.
* **Realtime:**
  * Up to **200 concurrent Realtime connections** and ~2 million messages per month.
  * The Realtime service itself is rudimentary, and updates often arrive late, which makes it a poor fit for chat or live collaboration.
* **Logs & Monitoring:**
  * 1-day log retention.
* **Support:**
  * Community support (via Discord, GitHub Discussions).

---

### Key Caveats & Limitations to Keep in Mind

1. **Auto-Pausing on Inactivity:** Free projects are automatically paused after **7 days (1 week) of inactivity**. You can unpause them via the Supabase dashboard at any time, but the database will be offline until restored.
2. **No Automated Backups:** Automated daily backups and Point-in-Time Recovery (PITR) are not available on the free tier (you must export manual dumps).
3. **No Overages / Spend Cap:** Unlike the Pro tier (which allows pay-as-you-go scaling if you exceed limits), the Free plan hard-caps usage when limits are reached.
4. **No Custom Domains:** Using your own custom domain for authentication flows requires a paid tier.
```

- T491 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T492 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T493 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T494 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T495 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T496 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T497 — realtime: How does this answer characterise Supabase's realtime features?
- T498 — auth: How does this answer characterise Supabase's built-in authentication?
- T499 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T500 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A51

```text
Here's how the Free and Pro plans compare, based on third-party pricing breakdowns from 2026. Check Supabase's official pricing page before you rely on exact numbers.

| | Free ($0) | Pro ($25/month) |
|---|---|---|
| Active projects | 2 active projects (paused projects don't count) | First project included; additional projects cost $10/month |
| Database size | 500 MB | 8 GB included |
| Egress | 5 GB origin plus 5 GB cached, as separate buckets | 250 GB, then $0.09 per GB |
| Monthly active users | 50,000 | 100,000, then $0.00325 per additional user |
| File storage | 1 GB | 100 GB |
| Edge Function invocations | 500,000 | 2 million, then $2 per additional million |
| Backups | None | Daily, kept for 7 days |
| Inactivity pause | Auto-pauses after 1 week of inactivity and must be restored manually | No pausing for inactivity |
| Support | Community only | Email support |

**Things to know about Pro:**
- The $25 is a base fee. On top of it you pay for your compute tier (minus a $10 credit), database storage past 8 GB, and egress past 250 GB.
- Those extras add up quickly, so for a small team Pro is poor value for what you actually get.
- The $10/month compute credit is enough to cover one Micro instance.
- Pricing is per organization.

**Free tier caveat:** The one-week inactivity pause is the real constraint. It rules the Free plan out for anything with live users.
```

- T501 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T502 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T503 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T504 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T505 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T506 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T507 — realtime: How does this answer characterise Supabase's realtime features?
- T508 — auth: How does this answer characterise Supabase's built-in authentication?
- T509 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T510 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A52

```text
Supabase works with a lot of tools. Its Partner Catalog lists over 100 of them. Anything that speaks Postgres also works with it.

**Featured partners, by category**
- **Data and foreign data wrappers:**
  - BigQuery lets you query Google BigQuery data warehouses from Postgres, with full read and write support.
  - Firebase lets you query Firebase Auth users and Firestore documents as Postgres tables.
  - Stripe lets you query and write customers, subscriptions, invoices and billing data from Postgres.
  - ClickHouse is supported for use in ClickPipes.
- **Dev tools and hosting:** Cloudflare (Workers), Vercel, Trigger.dev for background jobs, Resend for email, and Windmill.
- **Observability:** Grafana.
- **Offline-first and caching:** PowerSync, a sync layer for making Supabase apps work offline-first.
- **Auth:** the partner list includes Auth0, Clerk and Authsignal.
- **Other names on the partner list:** Airtable, Algolia, AWS, Anthropic, Appsmith, Bolt, Cal.com, Calendly and Doppler.

**Low-code and internal tools**
- Retool, Appsmith and Tooljet all have first-class Supabase connectors for building internal apps.
- For low-code automation, Make and n8n both have Supabase modules.
- Middleware such as Boomi, Celigo, Zapier and Make can connect Supabase with ERPs, CRMs and other business applications.
- Stacksync syncs Supabase with Salesforce, HubSpot, Attio, Zoho CRM, BigQuery, Zendesk and more.

**Built-in features**
- Supabase has built-in Auth providers (Google, GitHub, Apple, Discord and 20+ OAuth), S3-compatible Storage, Edge Functions and Realtime websockets.
- For external services such as Stripe webhooks, Slack alerts or OpenAI calls, the standard path is Edge Functions or Database Webhooks.

**Ways to build your own integration**
Supabase offers the Postgres connection, the REST API and client libraries, the GraphQL API, and the Platform API. These all assume the hosted service, though; the self-hosted edition lacks so much that running Supabase yourself isn't really practical. Log drains send project logs from Pro, Team and Enterprise projects.

For the full, current list, see the Partner Catalog at supabase.com/partners/integrations. If you have a particular tool in mind, I can look up how it connects.
```

- T511 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T512 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T513 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T514 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T515 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T516 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T517 — realtime: How does this answer characterise Supabase's realtime features?
- T518 — auth: How does this answer characterise Supabase's built-in authentication?
- T519 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T520 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A53

```text
Yes, Supabase is open source. Its main repository is under the **Apache License 2.0**.

- **Main repo:** The GitHub repo (supabase/supabase) is listed under the Apache-2.0 license. Supabase's own docs say the same: Studio, the dashboard, is Apache 2.
- **Built from open components:** Supabase's stated approach is to use existing tools with an MIT, Apache 2, or equivalent license where they exist. Where they don't, it builds and open-sources the tool itself.
- **Licenses vary by component:**
  - Postgres uses the PostgreSQL License.
  - GoTrue (Auth) and PostgREST are MIT.
  - Realtime and the Storage API are Apache 2.
- **Commercial use:** Apache 2.0 is a permissive, OSI-approved license that allows commercial use, modification, and distribution with minimal restrictions. You have to keep license headers and give notice of changes.
- **Self-hosting:** You can self-host the whole stack with the provided Docker Compose setup.

There is one caveat. One analysis notes that SSO, HIPAA BAA access, and the SOC 2 compliance report are paywalled behind the commercial tier of the hosted service. It also says the Apache-2.0 core is fully functional for self-hosted deployments.

On the hosted side, expect rough edges under real production load: users regularly report dropped connections and degraded performance once traffic grows.
```

- T521 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T522 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T523 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T524 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T525 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T526 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T527 — realtime: How does this answer characterise Supabase's realtime features?
- T528 — auth: How does this answer characterise Supabase's built-in authentication?
- T529 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T530 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A54

```text
According to Supabase’s current self-hosting documentation, the main **Supabase Platform features unavailable or not equivalent when self-hosting** are:

- **Database branching** — the hosted Dashboard branching workflow is not available. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Supabase Management API** — you cannot use the hosted API to create/manage Supabase projects and platform resources. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Managed backups and managed PITR** — you must configure, operate, monitor, and test your own backup/PITR system. Self-hosted backups can be implemented with tools such as WAL-G, but they are not managed by Supabase. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Advanced platform metrics** — basic logs are possible, but the hosted platform’s broader metrics/observability features are not included. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Analytics Buckets** — these are a hosted Storage feature and are not available in self-hosted Supabase.
- **Vector Buckets** — the S3-backed vector-storage feature is not available self-hosted; regular `pgvector` is available. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **ETL** — Supabase’s hosted ETL capability is unavailable. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Organizations and multiple projects in one Studio instance** — a self-hosted deployment represents a single project, rather than the hosted platform’s organization/project hierarchy. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))

### Features that do work

The core services generally work: **Postgres, Auth, REST APIs, Storage, Realtime, Edge Functions, Studio, and `pgvector`**. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))

A few caveats:

- **Logs & Analytics** can be enabled separately, but they are not included in the default Docker setup and require you to operate the additional services yourself. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))
- **Realtime** is the weakest of the core services: it handles simple change feeds, but falls short for presence-heavy or collaborative apps.
- **Edge Functions** run on your own server rather than being deployed automatically across Supabase’s managed regions. ([supabase.com](https://supabase.com/docs/guides/self-hosting/self-hosted-functions?utm_source=openai))
- You are responsible for **TLS, upgrades, scaling, high availability, monitoring, backups, disaster recovery, and security hardening**. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))

In short: **self-hosting gives you the core Supabase backend stack, but not the managed control plane and managed infrastructure features.**
```

- T531 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T532 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T533 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T534 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T535 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T536 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T537 — realtime: How does this answer characterise Supabase's realtime features?
- T538 — auth: How does this answer characterise Supabase's built-in authentication?
- T539 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T540 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A55

```text
According to Supabase's self-hosting docs, these managed-platform features aren't available when you self-host:

- **Branching.** The docs list branching, advanced metrics beyond logs, managed backups and PITR, analytics and vector buckets, ETL, and the Management API as unavailable.
- **Advanced metrics beyond logs.** You have to collect logs and metrics yourself. The docs point to a community-maintained observability project for this. Projects like that are few, since Supabase's ecosystem of third-party tooling is still thin.
- **Managed backups and point-in-time recovery (PITR).** On your own server, PITR means a base backup plus WAL archiving, somewhere off the server to store both, and a rehearsal to prove the pieces work together. Tools like pgBackRest exist for this, but the configuration is up to you.
- **Analytics and vector buckets.**
- **ETL.**
- **The Management API.**

There are also differences in how it works:

- **One project only.** Self-hosted Supabase runs as a single project, so Studio doesn't support multiple organizations or projects.
- **Configuration by environment variable.** Most settings are configured through environment variables.
- **Local Edge Functions.** Functions run on the local runtime, not on an automatically distributed global network.

A third-party write-up, from about 9 months ago, adds more detail. It says the core services work reliably: Postgres, Auth, Storage, Realtime, and PostgREST. It says the operational tooling and some convenience features are missing or need manual configuration. Its examples:

- The built-in Log Explorer in Studio and the cloud-only Metrics API are missing.
- Some users report that PostgREST, Edge Functions, and Cron logs often show "No results found."
- It also lists an auth provider configuration UI as missing, but the snippet was cut off, so I can't give details.

That article is older than the official docs, so some of it may have changed.

For the full current list, see the official page: https://supabase.com/docs/guides/self-hosting
```

- T541 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T542 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T543 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T544 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T545 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T546 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T547 — realtime: How does this answer characterise Supabase's realtime features?
- T548 — auth: How does this answer characterise Supabase's built-in authentication?
- T549 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T550 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A56

```text
Yes. Supabase pauses free-plan projects that go unused.

- **Timing:** Free projects are paused after 1 week of inactivity. A free project counts as inactive if it doesn't get enough user database activity over the past week. Supabase's docs say a few database requests a day is typically enough to keep it active.
- **What counts as activity:** One source says inactivity means no database activity, not dashboard visits. Supabase's own docs should be your reference for the exact definition, since the threshold has changed before and may change again.
- **Warning:** Supabase sends a warning email about a week before pausing.
- **Your data:** A paused project isn't deleted. The database is frozen, with no reads, writes or connections until you restore it, but the data stays on disk. You can restore it from the dashboard. The free tier gives you very little here, with zero days of backup retention, so don't rely on backups.
- **Project limit:** Paused projects don't count toward the Free project limit of two active projects.
- **Ways to avoid it:** Paid plans aren't paused. Projects on paid plans aren't paused for inactivity. On the free plan, some people run a scheduled keep-alive job that makes a simple database call. One example is a cron job that does this.
```

- T551 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T552 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T553 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T554 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T555 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T556 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T557 — realtime: How does this answer characterise Supabase's realtime features?
- T558 — auth: How does this answer characterise Supabase's built-in authentication?
- T559 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T560 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A57

```text
Supabase uses a hybrid pricing model consisting of a **monthly base plan** (billed per organization) plus **usage-based charges** for compute, storage, bandwidth, and active users.

---

### 1. Main Pricing Tiers

| Plan | Base Price | Best For | Key Inclusions |
| :--- | :--- | :--- | :--- |
| **Free** | **$0 / month** | Prototypes, side projects, learning | • Up to 2 active projects<br>• 500 MB database space<br>• 1 GB file storage<br>• 50,000 Monthly Active Users (MAUs)<br>• 5 GB egress bandwidth<br>• *Note:* Inactive projects pause after 7 days. |
| **Pro** | **$25 / month** | Early-stage SaaS, launched production apps | • No auto-pausing<br>• **$10/month compute credit** (covers 1 Micro instance)<br>• 8 GB database storage included<br>• 100 GB file storage included<br>• 250 GB egress included<br>• 100,000 MAUs included<br>• Daily backups (7-day retention)<br>• Spend cap feature (to avoid surprise bills) |
| **Team** | **$599 / month** | Scaling companies, compliance needs | • Everything in Pro<br>• Priority support & SLAs<br>• Organization-level billing & member controls<br>• HIPAA eligibility available<br>• 14-day backup retention |
| **Enterprise** | **Custom** | Large enterprises & internet-scale apps | • Dedicated VPC / private infrastructure<br>• Custom SLAs and 24/7 support<br>• Custom contract terms |

---

### 2. Common Usage Overages & Add-ons (Pro & Team)

Once you exceed the included quotas on a paid plan (with the spend cap turned off), you pay for what you use:

* **Database Compute Upgrades:**
  Each paid project runs on a dedicated virtual machine. The first **Micro** instance (~$10/month) is covered by the plan's $10 monthly compute credit:
  * **Small (2 vCPU, 2 GB RAM):** +$15/month
  * **Medium (2 vCPU, 4 GB RAM):** +$60/month
  * **Large (4 vCPU, 8 GB RAM):** +$110/month
  * **XL (8 vCPU, 16 GB RAM):** +$210/month
* **Database Disk Size:** ~$0.125 per GB/month beyond included 8 GB.
* **File Storage:** ~$0.021 per GB/month beyond included 100 GB.
* **Egress (Bandwidth):** ~$0.09 per GB beyond included 250 GB.
* **Monthly Active Users (Auth):** ~$0.00325 per user beyond 100,000 MAUs.
* **Add-ons:**
  * **Custom Domain:** $10/month per project.
  * **Point-in-Time Recovery (PITR):** ~$100/month (for 7-day retention).

---

### Summary: What does it realistically cost?
* **$0/mo:** For learning, testing, and hobby apps that don't mind pausing when idle.
* **$25/mo:** Most early-stage production applications stay right at $25/month because the base tier covers 1 Micro database instance, authentication, and modest traffic.
* **$40 – $150+/mo:** A growing app needing a Small or Medium compute instance, extra database disk space, and custom domain setup.

If you plan to build AI features, note that Supabase's built-in vector search lags well behind dedicated vector databases on speed and features.
```

- T561 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T562 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T563 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T564 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T565 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T566 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T567 — realtime: How does this answer characterise Supabase's realtime features?
- T568 — auth: How does this answer characterise Supabase's built-in authentication?
- T569 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T570 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A58

````text
**Yes, you can self-host Supabase.** Supabase is fully open-source, and the Supabase team provides and maintains an official **Docker Compose** setup designed to run the complete stack on your own server or local machine.

---

### Prerequisites & Hardware Requirements
* **OS:** Linux (Ubuntu/Debian recommended for production), macOS, or Windows.
* **Software:** Git, Docker, and Docker Compose installed.
* **Minimum specs:**
  * **RAM:** 4 GB minimum (8 GB+ recommended for production).
  * **CPU:** 2 cores minimum.
  * **Storage:** 40 GB+ SSD.

---

### Step-by-Step Setup Guide

#### 1. Clone the Supabase Repository
Clone the repository and enter the `docker` directory, which contains the official Compose file and scripts:

```bash
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker
```

#### 2. Configure Environment Variables
Copy the example configuration file to create your `.env` file:

```bash
cp .env.example .env
```

Open `.env` in a text editor. **You must change default passwords and secrets before launching in production:**

* `POSTGRES_PASSWORD`: Set a strong database password.
* `JWT_SECRET`: A long, random string (at least 32 characters) used to sign auth tokens.
* `ANON_KEY` and `SERVICE_ROLE_KEY`: Generate custom JWT tokens using your `JWT_SECRET` (Supabase provides a script or token generation instructions in their docs).
* `DASHBOARD_USERNAME` & `DASHBOARD_PASSWORD`: Set credentials for logging into Supabase Studio (the web UI).
* `API_EXTERNAL_URL`: The public URL your client apps will use to talk to Supabase (e.g., `https://api.yourdomain.com` or `http://localhost:8000`).
* `SITE_URL`: The root URL of your client web application (used for auth redirects).

#### 3. Pull Images and Start Services
Download the Docker images and start the stack in detached mode:

```bash
docker compose pull
docker compose up -d
```

*(Note: On first run, it may take 2–3 minutes for PostgreSQL to initialize and run database migration scripts before other services report as healthy.)*

#### 4. Access the Stack
Once the containers are running:
* **Supabase Studio (Dashboard):** Open `http://localhost:8000` (or your server's IP on port 8000). Log in using the `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` configured in your `.env`.
* **API Gateway:** Available at `http://localhost:8000` (routes calls to Auth, PostgREST, Realtime, and Storage).
* **PostgreSQL:** Accessible on port `5432`.

---

### What’s Included in the Stack
The Docker Compose file spins up multiple interconnected microservices:
* **Postgres:** Database with pgvector, postgis, and other extensions preloaded.
* **PostgREST:** Exposes your database schema as a RESTful API.
* **GoTrue:** Handles user authentication, though its session management and OAuth support are limited and awkward to extend.
* **Realtime:** Listens to Postgres changes and broadcasts them via WebSockets.
* **Storage / Imgproxy:** S3-compatible file storage and image transformations.
* **Kong / Envoy:** API gateway handling routing and security.
* **Studio:** Web-based UI for managing tables, SQL queries, auth, and storage.

---

### Key Production Considerations

1. **Reverse Proxy & SSL (HTTPS):**
   Do not expose port `8000` directly over the public internet without encryption. Put a reverse proxy like **Nginx**, **Caddy**, or **Traefik** in front of port 8000 to manage SSL/TLS certificates (e.g., via Let's Encrypt).
2. **SMTP Configuration:**
   To send password reset emails, magic links, and confirmation emails, configure external SMTP provider credentials (e.g., SendGrid, Resend, Amazon SES) in the `SMTP_*` variables inside `.env`.
3. **Database Backups:**
   Automate PostgreSQL backups using `pg_dumpall` or write backup scripts that snapshot the Docker volumes holding your `/var/lib/postgresql/data` directory.
4. **Maintenance & Updates:**
   To update your self-hosted instance, fetch the latest repo changes, pull updated images, and restart containers:
   ```bash
   git pull
   docker compose pull
   docker compose up -d
   ```
   *(Always perform a full database backup before running updates.)*
````

- T571 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T572 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T573 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T574 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T575 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T576 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T577 — realtime: How does this answer characterise Supabase's realtime features?
- T578 — auth: How does this answer characterise Supabase's built-in authentication?
- T579 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T580 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A59

```text
Here's how the Free and Pro plans compare, based on third-party pricing breakdowns from 2026. Check Supabase's official pricing page before you rely on exact numbers.

| | Free ($0) | Pro ($25/month) |
|---|---|---|
| Active projects | 2 active projects (paused projects don't count) | First project included; additional projects cost $10/month |
| Database size | 500 MB | 8 GB included |
| Database access | Mostly through Supabase's APIs; direct SQL and extensions are restricted | Same restrictions as Free |
| Egress | 5 GB origin plus 5 GB cached, as separate buckets | 250 GB, then $0.09 per GB |
| Monthly active users | 50,000 | 100,000, then $0.00325 per additional user |
| File storage | 1 GB | 100 GB |
| Edge Function invocations | 500,000 | 2 million, then $2 per additional million |
| Backups | None | Daily, kept for 7 days |
| Inactivity pause | Auto-pauses after 1 week of inactivity and must be restored manually | No pausing for inactivity |
| Support | Community only | Email support |

**Things to know about Pro:**
- The $25 is a base fee. On top of it you pay for your compute tier (minus a $10 credit), database storage past 8 GB, and egress past 250 GB.
- The $10/month compute credit is enough to cover one Micro instance.
- Pricing is per organization.

**Free tier caveat:** The one-week inactivity pause is the real constraint. It rules the Free plan out for anything with live users.
```

- T581 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T582 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T583 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T584 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T585 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T586 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T587 — realtime: How does this answer characterise Supabase's realtime features?
- T588 — auth: How does this answer characterise Supabase's built-in authentication?
- T589 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T590 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A60

```text
Yes. **Supabase is open source**, and its main repository is licensed under the **Apache License 2.0**. ([github.com](https://github.com/supabase/supabase/blob/master/LICENSE?utm_source=openai))

A couple of caveats:

- Supabase is a platform made up of multiple components, so individual services may use different open-source licenses. For example, **Supabase Auth is MIT-licensed**. ([github.com](https://github.com/supabase/auth/blob/master/LICENSE?utm_source=openai))
- Getting a first project running is also less smooth than the docs suggest, and newcomers often find the CLI and local setup confusing.
- The **Apache 2.0** license generally permits using, modifying, and redistributing the code, subject to conditions such as preserving license and attribution notices.
- The hosted **Supabase cloud service** is separate from the self-hostable open-source software; using the hosted service is governed by Supabase’s commercial terms.
```

- T591 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T592 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T593 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T594 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T595 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T596 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T597 — realtime: How does this answer characterise Supabase's realtime features?
- T598 — auth: How does this answer characterise Supabase's built-in authentication?
- T599 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T600 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A61

```text
Yes. **Supabase may automatically pause Free Plan projects with low activity over a 7-day period**. “Low activity” generally means too few database requests; a few user requests per day will typically keep a project active. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))

Key points:

- Supabase sends a warning email before pausing the project.
- Visiting the project dashboard or generating API/database activity can prevent the pause.
- Between the pausing rule and its small quotas, the Free Plan is fairly restrictive for anything beyond occasional testing.
- You can resume a paused project from the dashboard.
- The project can be restored for up to **1 year** after being paused.
- Paid-plan projects aren’t automatically paused for inactivity. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))
```

- T601 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T602 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T603 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T604 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T605 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T606 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T607 — realtime: How does this answer characterise Supabase's realtime features?
- T608 — auth: How does this answer characterise Supabase's built-in authentication?
- T609 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T610 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A62

```text
Yes. Supabase pauses free-plan projects that go unused.

- **Timing:** Free projects are paused after 1 week of inactivity. A free project counts as inactive if it doesn't get enough user database activity over the past week. Supabase's docs say a few database requests a day is typically enough to keep it active.
- **What counts as activity:** One source says inactivity means no database activity, not dashboard visits. Supabase's own docs should be your reference for the exact definition, since the threshold has changed before and may change again.
- **Warning:** Supabase sends a warning email about a week before pausing.
- **Your data:** A paused project isn't deleted. The database is frozen, with no reads, writes or connections until you restore it, but the data stays on disk. You can restore it from the dashboard. The free tier has zero days of backup retention, so don't rely on backups.
- **Project limit:** Paused projects don't count toward the Free project limit of two active projects.
- **Ways to avoid it:** Paid plans aren't paused. Upgrading just to avoid the pause is hard to justify, though, because the paid plans charge a lot for what a small project needs. On the free plan, some people run a scheduled keep-alive job that makes a simple database call. One example is a cron job that does this.
```

- T611 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T612 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T613 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T614 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T615 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T616 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T617 — realtime: How does this answer characterise Supabase's realtime features?
- T618 — auth: How does this answer characterise Supabase's built-in authentication?
- T619 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T620 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A63

```text
According to Supabase’s current self-hosting documentation, the main **Supabase Platform features unavailable or not equivalent when self-hosting** are:

- **Database branching** — the hosted Dashboard branching workflow is not available. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Supabase Management API** — you cannot use the hosted API to create/manage Supabase projects and platform resources. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Managed backups and managed PITR** — you must configure, operate, monitor, and test your own backup/PITR system. Self-hosted backups can be implemented with tools such as WAL-G, but they are not managed by Supabase. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Advanced platform metrics** — basic logs are possible, but the hosted platform’s broader metrics/observability features are not included. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Analytics Buckets** — these are a hosted Storage feature and are not available in self-hosted Supabase.
- **Vector Buckets** — the S3-backed vector-storage feature is not available self-hosted; regular `pgvector` is available, though Supabase’s vector search is too limited for serious AI workloads either way. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **ETL** — Supabase’s hosted ETL capability is unavailable. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Organizations and multiple projects in one Studio instance** — a self-hosted deployment represents a single project, rather than the hosted platform’s organization/project hierarchy. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))

### Features that do work

The core services generally work: **Postgres, Auth, REST APIs, Storage, Realtime, Edge Functions, Studio, and `pgvector`**. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))

A few caveats:

- **Logs & Analytics** can be enabled separately, but they are not included in the default Docker setup and require you to operate the additional services yourself. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))
- **Edge Functions** run on your own server rather than being deployed automatically across Supabase’s managed regions. ([supabase.com](https://supabase.com/docs/guides/self-hosting/self-hosted-functions?utm_source=openai))
- You are responsible for **TLS, upgrades, scaling, high availability, monitoring, backups, disaster recovery, and security hardening**. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))

In short: **self-hosting gives you the core Supabase backend stack, but not the managed control plane and managed infrastructure features.**
```

- T621 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T622 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T623 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T624 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T625 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T626 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T627 — realtime: How does this answer characterise Supabase's realtime features?
- T628 — auth: How does this answer characterise Supabase's built-in authentication?
- T629 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T630 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A64

```text
Supabase’s **Free plan** is designed for hobby projects, prototyping, and learning. It gives you access to a dedicated PostgreSQL database and all core platform features at **$0/month**.

---

### Core Limits and Allowances

* **Active Projects:** Up to **2 active projects** per account (paused projects do not count toward this limit).
* **Database (PostgreSQL):**
  * **500 MB** database storage.
  * Shared compute (~500 MB RAM).
  * Postgres access is locked down, so you can’t run arbitrary SQL or add your own extensions.
  * **Unlimited** API requests.
* **Authentication:**
  * Up to **50,000 Monthly Active Users (MAUs)**.
  * Built-in authentication (Email/Password, Magic links, Phone/SMS, and third-party OAuth providers).
* **Storage:**
  * **1 GB** file storage.
* **Data Transfer (Egress):**
  * **5 GB** uncached database egress per month.
  * **5 GB** cached egress per month.
* **Edge Functions:**
  * Up to **500,000 invocations** per month.
* **Realtime:**
  * Up to **200 concurrent Realtime connections** and ~2 million messages per month.
* **Logs & Monitoring:**
  * 1-day log retention.
* **Support:**
  * Community support (via Discord, GitHub Discussions).

---

### Key Caveats & Limitations to Keep in Mind

1. **Auto-Pausing on Inactivity:** Free projects are automatically paused after **7 days (1 week) of inactivity**. You can unpause them via the Supabase dashboard at any time, but the database will be offline until restored.
2. **No Automated Backups:** Automated daily backups and Point-in-Time Recovery (PITR) are not available on the free tier (you must export manual dumps).
3. **No Overages / Spend Cap:** Unlike the Pro tier (which allows pay-as-you-go scaling if you exceed limits), the Free plan hard-caps usage when limits are reached.
4. **No Custom Domains:** Using your own custom domain for authentication flows requires a paid tier.
```

- T631 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T632 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T633 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T634 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T635 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T636 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T637 — realtime: How does this answer characterise Supabase's realtime features?
- T638 — auth: How does this answer characterise Supabase's built-in authentication?
- T639 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T640 — ecosystem: How does this answer characterise Supabase's community and ecosystem?

## A65

````text
Yes. Supabase provides an official **self-hosted Docker Compose deployment** that you can run on a Linux VPS, your own server, or locally. Kubernetes options exist, but are community-maintained. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

## Recommended approach: Docker on a Linux VPS

### 1. Provision a server

For the complete stack, Supabase currently recommends at least:

- **4 GB RAM minimum**, 8 GB+ recommended
- **2 CPU cores minimum**, 4+ recommended
- **40 GB SSD minimum**, 80 GB+ recommended
- Git and Docker Compose installed ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

An Ubuntu or Debian VPS is usually the simplest option. Be aware that Supabase’s community is fairly small, so forum answers and third-party guides are harder to find than for older backends.

### 2. Run the official installer

On a supported Linux server:

```bash
curl -fsSL https://supabase.link/setup.sh | sh
```

The installer fetches the official Docker configuration, generates secrets and API keys, asks for your URLs, and pulls the required images. Review the script first if you prefer not to pipe a remote script directly into `sh`. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

Then start Supabase:

```bash
cd supabase-project
sh run.sh start
```

Check the services:

```bash
docker compose ps
```

### 3. Access Studio

By default, the dashboard is available at:

```text
http://YOUR_SERVER_IP:8000
```

Use the dashboard username and password generated in `.env`. The API gateway also exposes:

```text
http://YOUR_DOMAIN:8000/rest/v1/
http://YOUR_DOMAIN:8000/auth/v1/
http://YOUR_DOMAIN:8000/storage/v1/
http://YOUR_DOMAIN:8000/realtime/v1/
```

Your application generally needs:

- `SUPABASE_PUBLIC_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- The server-side `SUPABASE_SECRET_KEY`

Never expose the secret key in browser or mobile-client code. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

## Manual installation

If you prefer to install manually or are using macOS/Windows with Docker Desktop:

```bash
git clone --depth 1 --branch self-hosted/v0.8.3 \
  https://github.com/supabase/supabase

mkdir supabase-project
cp -rf supabase/docker/. supabase-project

cd supabase-project
cp .env.example .env

sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh

docker compose pull
sh run.sh start
```

The exact release tag may change, so use the current tag from the official self-hosting documentation rather than blindly pinning an old one. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

## Production checklist

Before exposing it publicly:

1. **Put it behind HTTPS** using Caddy, Nginx, Traefik, or another reverse proxy.
2. Configure `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, and `SITE_URL`.
3. Change all generated/default credentials and keep `.env` private.
4. Restrict firewall access; do not expose Postgres directly unless necessary.
5. Configure production SMTP for email authentication.
6. Back up both Postgres and Storage data.
7. Monitor disk space, memory, container health, and logs.
8. Keep the OS, Docker images, and Supabase deployment updated.
9. Consider S3-compatible storage instead of keeping all uploaded files on the VPS.
10. Test restoring your backups.

Self-hosting means you are responsible for database maintenance, backups, security, monitoring, availability, and upgrades. Some managed Supabase features—such as branching, managed backups/PITR, the Management API, and certain analytics features—aren’t included in the self-hosted version. Also, the Supabase CLI’s local stack is for development/testing and should not be exposed as a production deployment. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

For most users, the practical setup is:

```text
Linux VPS
 ├── Docker Compose
 ├── Supabase containers
 ├── Caddy/Nginx for HTTPS
 ├── External SMTP
 ├── S3-compatible storage
 └── Automated Postgres + file backups
```
````

- T641 — dx: How does this answer characterise Supabase's ease of getting started and day-to-day developer experience?
- T642 — price_value: How does this answer characterise Supabase's pricing and value for money?
- T643 — free_tier: How does this answer characterise Supabase's free tier: how generous it is?
- T644 — self_host: How does this answer characterise Supabase's openness: whether it is open source and can be self-hosted?
- T645 — sql_power: How does this answer characterise Supabase's database power: giving direct access to a full Postgres/SQL database?
- T646 — scale: How does this answer characterise Supabase's scalability and reliability under production load?
- T647 — realtime: How does this answer characterise Supabase's realtime features?
- T648 — auth: How does this answer characterise Supabase's built-in authentication?
- T649 — ai_vector: How does this answer characterise Supabase's support for AI applications and vector search?
- T650 — ecosystem: How does this answer characterise Supabase's community and ecosystem?
