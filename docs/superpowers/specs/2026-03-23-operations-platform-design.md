# Operations Platform — Design Spec

> One-person security consultancy operating system. Five lanes, one dashboard, maximum automation.

## Context

### What Exists Today
- Node.js CLI (`apollo`) with discover, scan, report, export, outreach, stats commands
- Passive security scanner (SSL, headers, CMS, admin panels, exposed files, cookies, mixed content, outdated libs)
- Claude API integration for report narratives and outreach email drafting
- SQLite database (businesses, scans, reports, outreach tables)
- Static dashboard (GitHub Pages) with pipeline view, filters, grade breakdown
- Yellow Pages scraper for business discovery
- Config system with defaults + user overrides

### What We're Building
Transform the existing CLI + static dashboard into a full local operations platform. Five business lanes, each with its own workflow, automation, and view — all interconnected through a shared data layer.

### Constraints
- No capital required — built with free/open tools
- Must run locally (not cloud-hosted) — Blake's machine is the server
- Claude does the heavy lifting — minimize Blake's hands-on time per client
- Region-parameterized — Southern NH first, clone to any zip code later
- No social media, no phone calls — email + public reports are the growth engine

### Business Model
| Tier | Price | Type |
|------|-------|------|
| Security report | Free | Lead magnet (the wedge) |
| One-time fix | $300–500 | Project |
| Monthly monitoring | $75–150/mo | Recurring |
| Full site rebuild | $1,500–3,000 | Project |

### Target Market
Blue collar businesses in Southern NH (expandable to any region). Plumbers, electricians, HVAC, roofers, landscapers, auto shops. These businesses survive AI disruption. They need a tech guy they trust. That's Blake.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    LOCAL DASHBOARD                        │
│              (React or Vue app, runs locally)             │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │  Sales   │ │Onboarding│ │ Delivery │ │ Accounts │   │
│  │  Funnel  │ │          │ │          │ │          │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐                                           │
│  │  Support │                                           │
│  └──────────┘                                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Stats / Revenue Bar                    │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │              │              │
    ┌────┴────┐    ┌────┴────┐   ┌────┴────┐
    │ SQLite  │    │ Claude  │   │  Email   │
    │   DB    │    │   API   │   │ (SMTP)   │
    └─────────┘    └─────────┘   └─────────┘
```

**Stack:**
- **Backend:** Node.js (Express or Fastify) — local API server
- **Frontend:** React + Vite (or keep vanilla JS if simpler) — local dashboard
- **Database:** SQLite (already in use, stays)
- **AI:** Claude API via @anthropic-ai/sdk (already in use)
- **Email:** Nodemailer (already a dependency) via SMTP
- **Public site:** GitHub Pages (already set up) — public-facing reports only

The CLI commands remain for power-user / scripting use. The dashboard wraps the same logic with a UI.

---

## Lane 1: Sales Funnel

### Purpose
Discover businesses, scan their websites, publish reports, send outreach, track interest. This lane generates leads.

### Stages
Each business moves through these stages linearly:

1. **Discovered** — Business found via scraper or manual add. Has a name and URL.
2. **Scanned** — Passive security scan complete. Scored and graded.
3. **Report Draft** — Claude-generated narrative created. Awaiting Blake's review.
4. **Report Published** — Report live on public site. Ready for outreach.
5. **Outreach Sent** — Cold email sent with report link.
6. **Follow-up** — Auto follow-up if no reply in 5 days. Up to 2 touches.
7. **Warm Lead** — They replied. Moves to Lane 2.
8. **Cold Pool** — No response after all touches. Re-scan in 60 days.

### Dashboard View
- Kanban-style board showing businesses in each stage
- Batch actions: "Scan all discovered," "Generate all reports," "Send all approved emails"
- Each business card shows: name, URL, grade, category, city, days in current stage
- Click a card to see full scan results, report preview, email draft

### Automation
- **Discovery:** Runs on demand per region. Parameterized by zip/city + radius + categories.
- **Scanning:** Batch or individual. Existing scanner works.
- **Report generation:** Claude writes the narrative. Blake reviews and approves. One click to publish.
- **Email drafting:** Claude writes personalized email using scan data. Blake reviews. One click to send.
- **Follow-up:** System auto-drafts follow-up emails. Blake approves. Auto-send option for trusted templates.
- **Re-scan cycle:** Cold pool businesses get re-scanned every 60 days. If their score changed, new report + new outreach.

### New Discovery Sources (beyond Yellow Pages)
- Google Maps API (or scraping)
- Yelp
- BBB
- Manual CSV import (for when Blake finds a list somewhere)

### Growth Engine
- Every published report is a public page indexed by Google
- Target long-tail keywords: "[city] [category] website security"
- "Protected by [brand]" badge on fixed sites links back to the platform
- Referral tracking: when a client refers someone, track it

---

## Lane 2: Onboarding

### Purpose
Convert a warm lead into a paying client. Scope the work, send a proposal, collect payment.

### Stages
1. **New Lead** — They replied to outreach. Reply auto-categorized by Claude.
2. **Qualifying** — Claude suggests response based on their message. Blake reviews/sends.
3. **Scope Drafted** — Auto-generated scope of work based on scan findings. Includes price.
4. **Proposal Sent** — Scope + price + timeline sent to client.
5. **Accepted** — Client said yes. Invoice sent (Stripe link).
6. **Paid** — Payment received. Moves to Lane 3.
7. **Stalled** — No response. Auto follow-up, then recycle to cold pool.

### Dashboard View
- List view sorted by days since last activity
- Each lead shows: name, what they replied, suggested tier (fix/monitoring/rebuild), proposed price
- Quick actions: "Send proposal," "Send follow-up," "Mark stalled"

### Automation
- **Reply classification:** Claude reads their reply, categorizes intent (interested, question, not interested, wrong person)
- **Scope generation:** Based on scan findings, auto-generate scope. Map findings to fix actions with time estimates and pricing.
- **Proposal template:** Clean, one-page email. Not a PDF. Scope + price + "reply yes to proceed."
- **Invoice:** Stripe payment link generated and sent on acceptance.
- **Stall detection:** No reply in 3 days → auto-draft follow-up. No reply after 2 follow-ups → cold pool with note.

### Pricing Logic
Scan findings map to fix complexity:
| Finding Category | Estimated Effort | Price Range |
|-----------------|-----------------|-------------|
| SSL fix | 30 min | $50–100 |
| Security headers | 30 min | $50–100 |
| CMS update | 1–2 hrs | $100–200 |
| Admin panel hardening | 1 hr | $75–150 |
| Full security overhaul | 3–5 hrs | $300–500 |
| Site rebuild | 15–30 hrs | $1,500–3,000 |
| Monthly monitoring | Automated | $75–150/mo |

Auto-scope picks the right tier based on number and severity of findings. Blake adjusts before sending.

---

## Lane 3: Delivery

### Purpose
Do the actual work. Fix the site, verify the fix, deliver proof.

### Stages
1. **Queued** — Paid, waiting to start.
2. **In Progress** — Work underway.
3. **Review** — Work done, Blake verifying.
4. **Verification Scan** — Re-scan the site to confirm fixes.
5. **Delivered** — Before/after report sent to client. Work complete.
6. **Enrolled** — If monitoring tier, auto-move to Lane 4.

### Dashboard View
- Work queue sorted by priority (oldest first, rebuilds flagged)
- Each job shows: client name, scope items as checklist, tier, payment status
- "Run verification scan" button after work is done

### Automation
- **Work order generation:** Scope items become a checklist. Each item has: what to do, how to do it (Claude-generated instructions), estimated time.
- **Claude-assisted fixes:** For common fixes (SSL, headers, CMS updates), Claude can generate the exact config/code changes needed. Blake applies them.
- **Verification scan:** One click re-runs the scanner. Before/after comparison auto-generated.
- **Delivery email:** Claude drafts a "work complete" email with before/after scores. Blake reviews, sends.
- **Monitoring enrollment:** If the client bought monitoring, auto-create their Lane 4 record.

---

## Lane 4: Account Management

### Purpose
Manage ongoing client relationships. Monitor their sites, send health reports, spot upsell opportunities.

### Dashboard View
- Client grid showing: name, tier, monthly revenue, last scan date, health status (green/yellow/red), months active
- Alert panel: sites with new issues, expiring SSLs, score drops
- Revenue summary: MRR, churn, growth

### Automation
- **Scheduled scans:** Weekly or monthly (configurable per client). Run automatically.
- **Change detection:** Compare current scan to previous. If score dropped or new finding appeared → alert Blake + auto-draft client email.
- **Health reports:** Monthly auto-generated report emailed to client. "Your site scored 92 this month. No new issues. Here's what we're watching."
- **Upsell detection:** Claude analyzes scan data for opportunities. "This client's site loads in 7 seconds. They might be interested in a performance fix." Blake decides whether to pitch.
- **Referral tracking:** When a client refers someone (tracked manually or via referral code), log it. Referral sources get priority.
- **Churn risk:** Client hasn't opened last 2 health reports? Flag for personal check-in.

### Badge System
- "Protected by [brand]" badge HTML snippet provided to monitoring clients
- Badge links back to their public report page (showing good score now)
- Every badge is a backlink and a lead generator

---

## Lane 5: Tech Support

### Purpose
Handle client problems fast. Log everything on their account.

### Dashboard View
- Inbox-style view. New tickets at top.
- Each ticket shows: client name, subject, priority, age, suggested response

### Stages
1. **New** — Client emailed with an issue.
2. **Triaged** — Claude categorized and suggested a response.
3. **In Progress** — Blake is working on it.
4. **Resolved** — Fix applied, client notified.

### Automation
- **Intake:** Client emails hit a monitored inbox (or forwarded). Parsed and logged.
- **Classification:** Claude reads the email, categorizes (security issue, general question, billing, site down), sets priority.
- **Response drafting:** Claude drafts a response. Blake reviews, sends.
- **Resolution logging:** Every interaction logged on the client's account record. Builds history.
- **Escalation:** If Claude can't classify or the issue is complex, flag for Blake's immediate attention.

---

## Data Model Changes

The existing SQLite schema covers businesses, scans, reports, and outreach. We need to extend it:

### New Tables

**clients** — Businesses that became paying clients
- id, business_id (FK), tier (fix/monitoring/rebuild), status (active/churned/completed)
- monthly_rate, total_paid, started_at, churned_at
- referred_by (FK to clients), referral_code
- notes

**projects** — Individual work items (fixes, rebuilds)
- id, client_id (FK), type (fix/rebuild), scope (JSON), status
- price, paid_at, started_at, completed_at
- verification_scan_id (FK to scans)

**support_tickets** — Tech support interactions
- id, client_id (FK), subject, body, priority, status
- category (security/billing/general/site_down)
- response_draft, resolved_at

**interactions** — All client touchpoints (emails sent, replies, calls, notes)
- id, business_id (FK), client_id (FK nullable), type, direction (inbound/outbound)
- subject, body, created_at

**scheduled_scans** — Recurring scan configuration for monitoring clients
- id, client_id (FK), frequency (weekly/monthly), last_run, next_run

### Schema Changes to Existing Tables

**businesses** — Add columns:
- region (for multi-region support)
- cold_pool_until (date to re-scan)
- referral_source

**outreach** — Add columns:
- follow_up_count (track how many follow-ups sent)
- follow_up_due (next follow-up date)
- reply_text (their actual response)
- reply_classification (interested/question/not_interested/wrong_person)

---

## Region System

Everything is parameterized by region. A region is:
```json
{
  "id": "southern-nh",
  "name": "Southern NH",
  "cities": ["Milford", "Nashua", "Amherst", "Hollis", "Bedford", "Merrimack"],
  "state": "NH",
  "categories": ["plumber", "electrician", "hvac", "roofer", "landscaper", "auto repair"],
  "active": true
}
```

When Blake is ready to expand:
1. Add a new region config
2. Run discovery for that region
3. Everything else (scan, report, outreach) works the same

All dashboard views can filter by region.

---

## Local Server Architecture

The dashboard needs a local backend (the current static GitHub Pages approach can't handle the interactive workflows).

**Local stack:**
- Express/Fastify server on localhost:3000
- Serves the dashboard frontend
- REST API for all lane operations
- SQLite database (same file, extended schema)
- Background job runner for scheduled scans, follow-up emails, health reports

**API routes (high-level):**
- `GET/POST /api/businesses` — CRUD + batch operations
- `POST /api/scan` — Trigger scan(s)
- `POST /api/report` — Generate report(s)
- `POST /api/outreach` — Draft/send outreach
- `GET/POST /api/clients` — Client management
- `GET/POST /api/projects` — Delivery tracking
- `GET/POST /api/support` — Support tickets
- `GET /api/stats` — Dashboard stats, revenue, pipeline
- `POST /api/region` — Add/manage regions

**Public site (GitHub Pages) remains separate** — just the public-facing reports. The local server handles everything else.

---

## Growth Mechanics (No Social Media)

### SEO via Public Reports
- Every published report is a page: `[domain]/reports/milford-nh-plumber-name`
- Pages target: "[city] [category] website security"
- Nobody competes for these keywords
- Over time, hundreds of indexed pages covering every trade in every town

### Cold Email (The Wedge)
- Personalized, short, value-first
- Links to their actual report (proof of value before asking for anything)
- Follow-up sequence: initial → 5 days → 10 days → cold pool
- Track open rates and reply rates per region/category to optimize

### Badge Backlinks
- Monitoring clients get a "Protected by [brand]" badge on their site
- Badge links to their report (showing good score)
- Every client site becomes a lead generator

### Referral Loop
- Blue collar guys know each other
- After delivery, ask for referral (Claude drafts the ask)
- Track who referred who — referral sources get priority service

### Re-scan Cycle
- Cold pool businesses get re-scanned every 60 days
- If their score changed, new report, new outreach
- They might not have been ready the first time — persistence without being annoying

---

## What Blake Does vs. What Claude Does

| Task | Blake | Claude |
|------|-------|--------|
| Pick target regions | Decides | — |
| Run discovery | One click | Scrapes, parses, deduplicates |
| Review scan results | Quick scan | Runs all checks automatically |
| Approve reports | Read, approve | Writes the narrative |
| Approve outreach emails | Read, tweak, send | Drafts personalized emails |
| Handle warm leads | Make the call on pricing | Classifies replies, suggests responses |
| Send proposals | Review, send | Generates scope + pricing |
| Do fix work | Apply changes | Generates exact instructions/configs |
| Verify fixes | One click | Runs re-scan, generates before/after |
| Monitor clients | Check alerts | Runs scheduled scans, drafts alerts |
| Handle support | Review, send | Classifies, drafts responses |

**Blake's time per client: ~30 minutes total, discovery through delivery.** The rest is Claude and automation.

---

## Implementation Priority

### Phase 1: Core Pipeline (Ship first dollar)
- Extend database schema
- Local API server
- Lane 1 dashboard (sales funnel with full workflow)
- Lane 2 basics (onboarding with scope generation + Stripe link)
- Region system
- CLI commands still work alongside dashboard

### Phase 2: Delivery + Accounts
- Lane 3 (delivery tracking, verification scans, before/after)
- Lane 4 (monitoring, scheduled scans, health reports, badge system)
- Revenue tracking

### Phase 3: Support + Growth
- Lane 5 (support ticket intake + triage)
- SEO optimization for public reports
- Re-scan cycle automation
- Referral tracking
- Multi-region expansion tools

---

## Open Questions

1. **Brand name** — Apollo's Table doesn't fit. Needs a name before the public site matters. Can defer but not forever.
2. **Email provider** — Gmail SMTP works to start but has daily limits (500/day). May need SendGrid or similar when scaling.
3. **Stripe setup** — Need a Stripe account with payment links. Simple to set up.
4. **Public site domain** — Keep apollostable.com or move to new domain with new brand?
5. **Dashboard hosting** — Runs locally for now. If Blake wants access from phone/anywhere, needs to go on a VPS eventually (cheap — $5/mo).
