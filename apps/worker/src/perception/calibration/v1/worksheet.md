Label every item under its answer per PROCEDURE.md §4.
Record the label, the exact passage that decided it (copied verbatim), and a one-line rationale for contradicts/unclear,
in labels-template.csv.

## W01

```text
Yes. Supabase pauses free-plan projects that go unused.

- **Timing:** Free projects are paused after 90 days of inactivity. A free project counts as inactive if it doesn't get enough user database activity over the past 90 days. Supabase's docs say a few database requests a day is typically enough to keep it active.
- **What counts as activity:** One source says inactivity means no database activity, not dashboard visits. Supabase's own docs should be your reference for the exact definition, since the threshold has changed before and may change again.
- **Warning:** Supabase sends a warning email about a week before pausing.
- **Your data:** A paused project isn't deleted. The database is frozen, with no reads, writes or connections until you restore it, but the data stays on disk. You can restore it from the dashboard. The free tier has zero days of backup retention, so don't rely on backups.
- **Project limit:** Paused projects don't count toward the Free project limit of two active projects.
- **Storage:** Each free project includes 5 GB of file storage, which stays intact while the project is paused.
- **Open source:** Supabase's main repository is MIT-licensed, so you can self-host it instead if pausing is a problem.
- **Ways to avoid it:** Paid plans aren't paused. Projects on paid plans aren't paused for inactivity. On the free plan, some people run a scheduled keep-alive job that makes a simple database call. One example is a cron job that does this.
```

- I001 — F12: Supabase's main repository is licensed under Apache-2.0.
- I002 — F06: Supabase's Free plan includes 1 GB of file storage.
- I003 — F08: Supabase pauses Free plan projects after 1 week of inactivity.

## W02

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

- I004 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I005 — F15: Supabase lists Clerk as an authentication integration.
- I006 — F14: Supabase lists a Vercel integration.

## W03

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

- I007 — F13: Self-hosted Supabase does not support branching.
- I008 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I009 — F10: Supabase can be self-hosted.
- I010 — F03: Supabase's Team plan starts at $599 per month.

## W04

```text
According to Supabase’s current self-hosting documentation, the main **Supabase Platform features unavailable or not equivalent when self-hosting** are:

- **Supabase Management API** — you cannot use the hosted API to create/manage Supabase projects and platform resources. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Managed backups and managed PITR** — you must configure, operate, monitor, and test your own backup/PITR system. Self-hosted backups can be implemented with tools such as WAL-G, but they are not managed by Supabase. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Advanced platform metrics** — basic logs are possible, but the hosted platform’s broader metrics/observability features are not included. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Analytics Buckets** — these are a hosted Storage feature and are not available in self-hosted Supabase.
- **Vector Buckets** — the S3-backed vector-storage feature is not available self-hosted; regular `pgvector` is available. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **ETL** — Supabase’s hosted ETL capability is unavailable. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- **Organizations and multiple projects in one Studio instance** — a self-hosted deployment represents a single project, rather than the hosted platform’s organization/project hierarchy. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))

Note: Supabase no longer supports self-hosting; the docs describe a legacy setup, and new deployments must use the hosted platform.

### Features that do work

The core services generally work: **Postgres, Auth, REST APIs, Storage, Realtime, Edge Functions, Studio, database branching, and `pgvector`**. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))

A few caveats:

- **Logs & Analytics** can be enabled separately, but they are not included in the default Docker setup and require you to operate the additional services yourself. ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker?utm_source=openai))
- **Edge Functions** run on your own server rather than being deployed automatically across Supabase’s managed regions. ([supabase.com](https://supabase.com/docs/guides/self-hosting/self-hosted-functions?utm_source=openai))
- You are responsible for **TLS, upgrades, scaling, high availability, monitoring, backups, disaster recovery, and security hardening**. ([supabase.com](https://supabase.com/docs/guides/self-hosting?utm_source=openai))
- If you need the managed features instead, the hosted Team plan starts at $299/month.

In short: **self-hosting gives you the core Supabase backend stack, but not the managed control plane and managed infrastructure features.**
```

- I011 — F10: Supabase can be self-hosted.
- I012 — F03: Supabase's Team plan starts at $599 per month.
- I013 — F15: Supabase lists Clerk as an authentication integration.
- I014 — F13: Self-hosted Supabase does not support branching.

## W05

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

- I015 — F12: Supabase's main repository is licensed under Apache-2.0.
- I016 — F08: Supabase pauses Free plan projects after 1 week of inactivity.

## W06

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

- I017 — F01: Supabase offers a free plan.
- I018 — F10: Supabase can be self-hosted.
- I019 — F14: Supabase lists a Vercel integration.
- I020 — F11: Docker is the recommended way to self-host Supabase.

## W07

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

- I021 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I022 — F02: Supabase's Pro plan starts at $25 per month.
- I023 — F07: Supabase's Free plan allows 2 active projects.
- I024 — F04: Supabase's Free plan includes 500 MB of database size.
- I025 — F06: Supabase's Free plan includes 1 GB of file storage.
- I026 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I027 — F12: Supabase's main repository is licensed under Apache-2.0.

## W08

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

- I028 — F02: Supabase's Pro plan starts at $25 per month.
- I029 — F10: Supabase can be self-hosted.
- I030 — F01: Supabase offers a free plan.

## W09

```text
On Supabase's Free plan, you can have up to **3 active projects** at any given time.

Key details to keep in mind:

* **Account-wide limit:** The limit of three active projects applies across all organizations where you are an Owner or Administrator. (For example, one organization with two projects, or two organizations with one project each).
* **Paused projects:** Paused projects **do not** count toward the active project limit. Projects on the Free plan automatically pause after 7 days of inactivity, but they can be manually restored from your dashboard when needed.
* **Free tier resource limits (per project):** Each free project includes up to 500 MB of database storage, 1 GB of file storage, and up to 50,000 monthly active users (MAUs).
* **Needing more:** If you need more than two active projects running simultaneously, you will need to upgrade to a paid plan (such as the Pro plan). The Pro plan includes $20/month in compute credits, enough for two Micro instances.
```

- I031 — F12: Supabase's main repository is licensed under Apache-2.0.
- I032 — F07: Supabase's Free plan allows 2 active projects.
- I033 — F09: Supabase's Pro plan includes $10 per month in compute credits.

## W10

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

- I034 — F02: Supabase's Pro plan starts at $25 per month.
- I035 — F01: Supabase offers a free plan.
- I036 — F15: Supabase lists Clerk as an authentication integration.
- I037 — F12: Supabase's main repository is licensed under Apache-2.0.

## W11

````text
Yes. Supabase's recommended way to self-host is its official **Kubernetes Helm chart**; the **Docker Compose** deployment below also works on a Linux VPS, your own server, or locally, but it isn't the recommended setup. ([supabase.com](https://supabase.com/docs/guides/self-hosting))

## Recommended approach: Docker on a Linux VPS

### 1. Provision a server

For the complete stack, Supabase currently recommends at least:

- **4 GB RAM minimum**, 8 GB+ recommended
- **2 CPU cores minimum**, 4+ recommended
- **40 GB SSD minimum**, 80 GB+ recommended
- Git and Docker Compose installed ([supabase.com](https://supabase.com/docs/guides/self-hosting/docker))

An Ubuntu or Debian VPS is usually the simplest option.

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

Note that Supabase ended official self-hosting support this year: the steps above apply to existing installs, and new self-hosted deployments are no longer possible.

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

- I038 — F11: Docker is the recommended way to self-host Supabase.
- I039 — F06: Supabase's Free plan includes 1 GB of file storage.
- I040 — F10: Supabase can be self-hosted.

## W12

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

- I041 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I042 — F10: Supabase can be self-hosted.
- I043 — F06: Supabase's Free plan includes 1 GB of file storage.
- I044 — F01: Supabase offers a free plan.
- I045 — F04: Supabase's Free plan includes 500 MB of database size.
- I046 — F13: Self-hosted Supabase does not support branching.
- I047 — F08: Supabase pauses Free plan projects after 1 week of inactivity.
- I048 — F07: Supabase's Free plan allows 2 active projects.

## W13

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

- I049 — F01: Supabase offers a free plan.
- I050 — F13: Self-hosted Supabase does not support branching.
- I051 — F10: Supabase can be self-hosted.
- I052 — F05: Supabase's Free plan includes 50,000 monthly active users.

## W14

```text
Yes. **Supabase is open source**, and its main repository is licensed under the **MIT License**. ([github.com](https://github.com/supabase/supabase/blob/master/LICENSE?utm_source=openai))

A couple of caveats:

- Supabase is a platform made up of multiple components, so individual services may use different open-source licenses. For example, **Supabase Auth is MIT-licensed**. ([github.com](https://github.com/supabase/auth/blob/master/LICENSE?utm_source=openai))
- The **MIT** license generally permits using, modifying, and redistributing the code, subject to conditions such as preserving license and attribution notices.
- The hosted **Supabase cloud service** is separate from the self-hostable open-source software; using the hosted service is governed by Supabase’s commercial terms.
- The hosted service's Free plan includes 5 GB of file storage, so you can try it before deciding whether to self-host.
```

- I053 — F12: Supabase's main repository is licensed under Apache-2.0.
- I054 — F14: Supabase lists a Vercel integration.
- I055 — F06: Supabase's Free plan includes 1 GB of file storage.

## W15

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

- I056 — F15: Supabase lists Clerk as an authentication integration.
- I057 — F13: Self-hosted Supabase does not support branching.
- I058 — F10: Supabase can be self-hosted.
- I059 — F09: Supabase's Pro plan includes $10 per month in compute credits.

## W16

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

- I060 — F01: Supabase offers a free plan.
- I061 — F02: Supabase's Pro plan starts at $25 per month.
- I062 — F12: Supabase's main repository is licensed under Apache-2.0.

## W17

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

- I063 — F12: Supabase's main repository is licensed under Apache-2.0.
- I064 — F14: Supabase lists a Vercel integration.
- I065 — F07: Supabase's Free plan allows 2 active projects.

## W18

```text
Yes, Supabase is open source. Its main repository is under the **MIT License**.

- **Main repo:** The GitHub repo (supabase/supabase) is listed under the MIT license. Supabase's own docs say the same: Studio, the dashboard, is Apache 2.
- **Built from open components:** Supabase's stated approach is to use existing tools with an MIT, Apache 2, or equivalent license where they exist. Where they don't, it builds and open-sources the tool itself.
- **Licenses vary by component:**
  - Postgres uses the PostgreSQL License.
  - GoTrue (Auth) and PostgREST are MIT.
  - Realtime and the Storage API are Apache 2.
- **Commercial use:** Apache 2.0 is a permissive, OSI-approved license that allows commercial use, modification, and distribution with minimal restrictions. You have to keep license headers and give notice of changes.
- **Self-hosting:** You can self-host the whole stack with the provided Docker Compose setup.

There is one caveat. One analysis notes that SSO, HIPAA BAA access, and the SOC 2 compliance report are paywalled behind the commercial tier of the hosted service. It also says the Apache-2.0 core is fully functional for self-hosted deployments.
```

- I066 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I067 — F12: Supabase's main repository is licensed under Apache-2.0.

## W19

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

- I068 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I069 — F02: Supabase's Pro plan starts at $25 per month.
- I070 — F04: Supabase's Free plan includes 500 MB of database size.
- I071 — F15: Supabase lists Clerk as an authentication integration.
- I072 — F06: Supabase's Free plan includes 1 GB of file storage.
- I073 — F07: Supabase's Free plan allows 2 active projects.
- I074 — F05: Supabase's Free plan includes 50,000 monthly active users.

## W20

```text
Supabase has discontinued its **Free plan**. As it was offered, it was designed for hobby projects, prototyping, and learning, and gave you access to a dedicated PostgreSQL database and all core platform features at **$0/month**.

---

### Core Limits and Allowances

* **Active Projects:** Up to **2 active projects** per account (paused projects do not count toward this limit).
* **Database (PostgreSQL):**
  * **2 GB** database storage.
  * Shared compute (~500 MB RAM).
  * **Unlimited** API requests.
* **Authentication:**
  * Up to **10,000 Monthly Active Users (MAUs)**.
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

- I075 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I076 — F04: Supabase's Free plan includes 500 MB of database size.
- I077 — F06: Supabase's Free plan includes 1 GB of file storage.
- I078 — F07: Supabase's Free plan allows 2 active projects.
- I079 — F12: Supabase's main repository is licensed under Apache-2.0.
- I080 — F01: Supabase offers a free plan.
- I081 — F08: Supabase pauses Free plan projects after 1 week of inactivity.

## W21

```text
You can have **2 active projects** on Supabase's free plan.

- The limit applies across every organization where you're an Owner or Administrator. You could have two Free Plan organizations with one project each, or one Free Plan organization with two projects.
- Paused projects don't count toward the limit. Free projects pause after one week of inactivity. You can keep more than two projects if the extras are paused.
- If you need more than two active projects at once, you'll have to upgrade to the Pro plan.

Each free project also gets a 500 MB database, 1 GB file storage, 50,000 monthly active users, and 5 GB egress.
```

- I082 — F07: Supabase's Free plan allows 2 active projects.
- I083 — F12: Supabase's main repository is licensed under Apache-2.0.
- I084 — F14: Supabase lists a Vercel integration.

## W22

```text
Supabase uses a hybrid pricing model consisting of a **monthly base plan** (billed per organization) plus **usage-based charges** for compute, storage, bandwidth, and active users.

Supabase no longer offers a free plan: the Free tier below is closed to new projects, so every new project starts on Pro.

---

### 1. Main Pricing Tiers

| Plan | Base Price | Best For | Key Inclusions |
| :--- | :--- | :--- | :--- |
| **Free** | **$0 / month** | Prototypes, side projects, learning | • Up to 2 active projects<br>• 500 MB database space<br>• 1 GB file storage<br>• 50,000 Monthly Active Users (MAUs)<br>• 5 GB egress bandwidth<br>• *Note:* Inactive projects pause after 7 days. |
| **Pro** | **$29 / month** | Early-stage SaaS, launched production apps | • No auto-pausing<br>• **$10/month compute credit** (covers 1 Micro instance)<br>• 8 GB database storage included<br>• 100 GB file storage included<br>• 250 GB egress included<br>• 100,000 MAUs included<br>• Daily backups (7-day retention)<br>• Spend cap feature (to avoid surprise bills) |
| **Team** | **$399 / month** | Scaling companies, compliance needs | • Everything in Pro<br>• Priority support & SLAs<br>• Organization-level billing & member controls<br>• HIPAA eligibility available<br>• 14-day backup retention |
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
```

- I085 — F03: Supabase's Team plan starts at $599 per month.
- I086 — F02: Supabase's Pro plan starts at $25 per month.
- I087 — F12: Supabase's main repository is licensed under Apache-2.0.
- I088 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I089 — F01: Supabase offers a free plan.

## W23

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

- I090 — F01: Supabase offers a free plan.
- I091 — F08: Supabase pauses Free plan projects after 1 week of inactivity.
- I092 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I093 — F12: Supabase's main repository is licensed under Apache-2.0.
- I094 — F14: Supabase lists a Vercel integration.
- I095 — F04: Supabase's Free plan includes 500 MB of database size.
- I096 — F07: Supabase's Free plan allows 2 active projects.
- I097 — F06: Supabase's Free plan includes 1 GB of file storage.

## W24

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

- I098 — F13: Self-hosted Supabase does not support branching.
- I099 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I100 — F02: Supabase's Pro plan starts at $25 per month.
- I101 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I102 — F07: Supabase's Free plan allows 2 active projects.
- I103 — F14: Supabase lists a Vercel integration.
- I104 — F04: Supabase's Free plan includes 500 MB of database size.
- I105 — F06: Supabase's Free plan includes 1 GB of file storage.

## W25

```text
Yes. **Supabase may automatically pause Free Plan projects that have low activity over a 7-day period**, primarily when they receive too few database queries. A few requests per day is typically enough to avoid pausing, but Supabase doesn’t publish a strict request threshold. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))

- They generally email you about a week before pausing.
- You can prevent it by visiting the project dashboard or generating API/database activity.
- A paused project’s data and configuration are preserved, and you can resume it from the dashboard.
- You have **up to one year** to restore it after pausing.
- Paid-plan projects aren’t automatically paused for inactivity. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))
```

- I106 — F11: Docker is the recommended way to self-host Supabase.
- I107 — F08: Supabase pauses Free plan projects after 1 week of inactivity.

## W26

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

- I108 — F08: Supabase pauses Free plan projects after 1 week of inactivity.
- I109 — F14: Supabase lists a Vercel integration.

## W27

```text
Supabase integrates with a wide variety of tools, frameworks, and services across the modern development stack. Because it is built on top of standard PostgreSQL, it works natively with almost any tool that can connect to a Postgres database or consume REST/GraphQL/WebSocket APIs.

Here is a breakdown of the primary tools and platforms Supabase integrates with by category:

---

### 1. **Deployment & Cloud Platforms**
* **Vercel:** Not listed in Supabase's integrations directory; you add the environment variables to Vercel manually.
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
* **Third-party auth:** Auth0 is listed as a partner; Clerk is not listed among Supabase's authentication integrations.

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
* **Sentry:** Error tracking across Supabase Edge Functions and client applications.

Most of these integrations work on the Free plan, which includes 500 MB of file storage for uploads.

You can browse active third-party integrations and pre-built connectors directly in the **[Supabase Integrations Directory](https://supabase.com/partners/integrations)**.
```

- I110 — F14: Supabase lists a Vercel integration.
- I111 — F06: Supabase's Free plan includes 1 GB of file storage.
- I112 — F11: Docker is the recommended way to self-host Supabase.
- I113 — F15: Supabase lists Clerk as an authentication integration.

## W28

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

- I114 — F14: Supabase lists a Vercel integration.
- I115 — F15: Supabase lists Clerk as an authentication integration.
- I116 — F12: Supabase's main repository is licensed under Apache-2.0.

## W29

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

Supabase Pro starts at **$15/month**. That includes 100,000 MAUs, 8 GB database disk, 100 GB file storage, and 250 GB egress; additional projects generally add compute costs. ([supabase.com](https://supabase.com/pricing?trk=public_post_comment-text&utm_source=openai))

Supabase Pro does not include any compute credits, so every database instance is billed on top of the plan fee.

Firebase Blaze has **no base subscription fee**. It retains the free quotas and charges only for usage beyond them, but you must attach a billing account. Firebase budget alerts notify you but do not automatically cap charges. ([firebase.google.com](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans?hl=EN&rd=1&visit_id=638920144206502039-1497185943))

## My practical recommendation

Choose **Firebase** if:

- You want the lowest possible bill for a small app.
- You’re comfortable with NoSQL/Firestore.
- You may use push notifications, Crashlytics, Analytics, or mobile-focused features.
- You want to remain on a pay-as-you-go plan instead of paying $25/month immediately.

Choose **Supabase** if:

- You want PostgreSQL, SQL queries, joins, and relational data.
- You prefer a more conventional backend.
- You want a predictable $25/month production plan.
- You expect to need database-heavy features or easy data export.

**Bottom line:** For most small apps, start with **Firebase if minimizing cost is the priority**. Choose **Supabase** if the advantages of Postgres are important enough to justify its paid production plan later.
```

- I117 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I118 — F02: Supabase's Pro plan starts at $25 per month.
- I119 — F01: Supabase offers a free plan.
- I120 — F11: Docker is the recommended way to self-host Supabase.

## W30

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

- I121 — F14: Supabase lists a Vercel integration.
- I122 — F15: Supabase lists Clerk as an authentication integration.
- I123 — F01: Supabase offers a free plan.

## W31

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

- I124 — F14: Supabase lists a Vercel integration.
- I125 — F11: Docker is the recommended way to self-host Supabase.
- I126 — F10: Supabase can be self-hosted.

## W32

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

- I127 — F03: Supabase's Team plan starts at $599 per month.
- I128 — F01: Supabase offers a free plan.
- I129 — F02: Supabase's Pro plan starts at $25 per month.
- I130 — F11: Docker is the recommended way to self-host Supabase.
- I131 — F09: Supabase's Pro plan includes $10 per month in compute credits.

## W33

```text
Yes. **Supabase may automatically pause Free Plan projects with low activity over a 30-day period**. “Low activity” generally means too few database requests; a few user requests per day will typically keep a project active. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))

Key points:

- Supabase sends a warning email before pausing the project.
- Visiting the project dashboard or generating API/database activity can prevent the pause.
- You can resume a paused project from the dashboard.
- The Free Plan allows up to 5 active projects at once; paused projects don't count toward that limit.
- The project can be restored for up to **1 year** after being paused.
- Paid-plan projects aren’t automatically paused for inactivity. ([supabase.com](https://supabase.com/docs/guides/platform/free-project-pausing?utm_source=openai))
```

- I132 — F07: Supabase's Free plan allows 2 active projects.
- I133 — F08: Supabase pauses Free plan projects after 1 week of inactivity.
- I134 — F12: Supabase's main repository is licensed under Apache-2.0.

## W34

```text
Supabase’s Free Plan allows **2 active projects** across your account. **Paused projects don’t count** toward that limit. Free projects may be automatically paused after about **7 days of inactivity**. ([supabase.com](https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=openai))
```

- I135 — F07: Supabase's Free plan allows 2 active projects.
- I136 — F14: Supabase lists a Vercel integration.

## W35

```text
Here's how the Free and Pro plans compare, based on third-party pricing breakdowns from 2026. Check Supabase's official pricing page before you rely on exact numbers.

| | Free ($0) | Pro ($35/month) |
|---|---|---|
| Active projects | 2 active projects (paused projects don't count) | First project included; additional projects cost $10/month |
| Database size | 1 GB | 8 GB included |
| Egress | 5 GB origin plus 5 GB cached, as separate buckets | 250 GB, then $0.09 per GB |
| Monthly active users | 25,000 | 100,000, then $0.00325 per additional user |
| File storage | 1 GB | 100 GB |
| Edge Function invocations | 500,000 | 2 million, then $2 per additional million |
| Backups | None | Daily, kept for 7 days |
| Inactivity pause | Auto-pauses after 1 week of inactivity and must be restored manually | No pausing for inactivity |
| Support | Community only | Email support |

**Things to know about Pro:**
- The $35 is a base fee. On top of it you pay for your compute tier (minus a $10 credit), database storage past 8 GB, and egress past 250 GB.
- The $10/month compute credit is enough to cover one Micro instance.
- Pricing is per organization.

**Free tier caveat:** The one-week inactivity pause is the real constraint. It rules the Free plan out for anything with live users.
```

- I137 — F04: Supabase's Free plan includes 500 MB of database size.
- I138 — F07: Supabase's Free plan allows 2 active projects.
- I139 — F06: Supabase's Free plan includes 1 GB of file storage.
- I140 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I141 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I142 — F10: Supabase can be self-hosted.
- I143 — F02: Supabase's Pro plan starts at $25 per month.

## W36

```text
On Supabase’s Free Plan, you can have up to **2 active projects** at a time.

Key details regarding this limit:

* **Scope:** The limit applies across all organizations where you are an Owner or Administrator. You can split them across two separate free organizations (1 project each) or keep both within a single organization.
* **Paused projects do not count:** Only active projects count toward the quota. If you already have two projects and want to create a new one without upgrading, you can pause an existing project from the dashboard to free up a slot.
* **Automatic pausing:** Free-tier projects are automatically paused after **7 days (1 week) of inactivity** to preserve resources, but you can unpause them at any time from your Supabase dashboard.
```

- I144 — F15: Supabase lists Clerk as an authentication integration.
- I145 — F07: Supabase's Free plan allows 2 active projects.

## W37

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

- I146 — F02: Supabase's Pro plan starts at $25 per month.
- I147 — F01: Supabase offers a free plan.
- I148 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I149 — F03: Supabase's Team plan starts at $599 per month.
- I150 — F12: Supabase's main repository is licensed under Apache-2.0.
- I151 — F15: Supabase lists Clerk as an authentication integration.

## W38

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

- I152 — F01: Supabase offers a free plan.
- I153 — F10: Supabase can be self-hosted.
- I154 — F11: Docker is the recommended way to self-host Supabase.
- I155 — F07: Supabase's Free plan allows 2 active projects.

## W39

````text
**Yes, you can self-host Supabase.** Supabase is fully open-source, and the Supabase team recommends its official **Kubernetes Helm chart** for self-hosting; the **Docker Compose** setup below is meant for local testing rather than as the recommended deployment.

---

If you'd rather not manage servers, the hosted Pro plan is the alternative; it includes $5/month in compute credits.

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
* **GoTrue:** Handles user authentication, session management, and OAuth.
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

- I156 — F11: Docker is the recommended way to self-host Supabase.
- I157 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I158 — F14: Supabase lists a Vercel integration.
- I159 — F10: Supabase can be self-hosted.

## W40

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

- I160 — F03: Supabase's Team plan starts at $599 per month.
- I161 — F12: Supabase's main repository is licensed under Apache-2.0.

## W41

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

- I162 — F10: Supabase can be self-hosted.
- I163 — F05: Supabase's Free plan includes 50,000 monthly active users.
- I164 — F07: Supabase's Free plan allows 2 active projects.
- I165 — F01: Supabase offers a free plan.
- I166 — F04: Supabase's Free plan includes 500 MB of database size.
- I167 — F08: Supabase pauses Free plan projects after 1 week of inactivity.
- I168 — F13: Self-hosted Supabase does not support branching.
- I169 — F06: Supabase's Free plan includes 1 GB of file storage.

## W42

```text
According to Supabase's self-hosting docs, these managed-platform features aren't available when you self-host:

- The docs list advanced metrics beyond logs, managed backups and PITR, analytics and vector buckets, ETL, and the Management API as unavailable. Branching, by contrast, works on self-hosted Supabase.
- **Advanced metrics beyond logs.** You have to collect logs and metrics yourself. The docs point to a community-maintained observability project for this.
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

Note that Supabase has withdrawn self-hosting: new deployments can't be self-hosted, and these notes apply only to installs that already exist.

For the full current list, see the official page: https://supabase.com/docs/guides/self-hosting
```

- I170 — F10: Supabase can be self-hosted.
- I171 — F13: Self-hosted Supabase does not support branching.
- I172 — F08: Supabase pauses Free plan projects after 1 week of inactivity.

## W43

```text
Yes—**Supabase is largely open source**, including its self-hosting stack and major components. The main Supabase repository is licensed under the **Apache License 2.0**, a permissive open-source license that allows use, modification, and redistribution subject to conditions such as preserving notices. ([github.com](https://github.com/supabase/supabase/blob/master/LICENSE?utm_source=openai))

However, **Supabase is not uniformly under a single license**. Individual services may use different open-source licenses—for example, **Supabase Auth is licensed under the MIT License**. ([github.com](https://github.com/supabase/auth/blob/master/LICENSE?utm_source=openai))

So, in short:

- **Supabase platform/self-hosting repository:** Apache License 2.0
- **Some individual components:** MIT or other compatible open-source licenses
- **Hosted Supabase service:** You use it as a service; its hosted terms are separate from the licenses covering the source code.
```

- I173 — F03: Supabase's Team plan starts at $599 per month.
- I174 — F12: Supabase's main repository is licensed under Apache-2.0.
- I175 — F08: Supabase pauses Free plan projects after 1 week of inactivity.

## W44

```text
Supabase works with a lot of tools. Its Partner Catalog lists over 100 of them. Anything that speaks Postgres also works with it.

**Featured partners, by category**
- **Data and foreign data wrappers:**
  - BigQuery lets you query Google BigQuery data warehouses from Postgres, with full read and write support.
  - Firebase lets you query Firebase Auth users and Firestore documents as Postgres tables.
  - Stripe lets you query and write customers, subscriptions, invoices and billing data from Postgres.
  - ClickHouse is supported for use in ClickPipes.
- **Dev tools and hosting:** Cloudflare (Workers), Trigger.dev for background jobs, Resend for email, and Windmill. Vercel is not in the catalog; you connect it manually with environment variables.
- **Observability:** Grafana.
- **Offline-first and caching:** PowerSync, a sync layer for making Supabase apps work offline-first.
- **Auth:** the partner list includes Auth0 and Authsignal. Clerk isn't listed as an integration.
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
Supabase offers the Postgres connection, the REST API and client libraries, the GraphQL API, and the Platform API. Log drains send project logs from Pro, Team and Enterprise projects. If you self-host, the recommended setup is Kubernetes with the official Helm chart; Docker Compose is meant only for local development.

For the full, current list, see the Partner Catalog at supabase.com/partners/integrations. If you have a particular tool in mind, I can look up how it connects.
```

- I176 — F11: Docker is the recommended way to self-host Supabase.
- I177 — F15: Supabase lists Clerk as an authentication integration.
- I178 — F02: Supabase's Pro plan starts at $25 per month.
- I179 — F14: Supabase lists a Vercel integration.

## W45

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

- I180 — F02: Supabase's Pro plan starts at $25 per month.
- I181 — F12: Supabase's main repository is licensed under Apache-2.0.
- I182 — F09: Supabase's Pro plan includes $10 per month in compute credits.
- I183 — F01: Supabase offers a free plan.
- I184 — F03: Supabase's Team plan starts at $599 per month.
