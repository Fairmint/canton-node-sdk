# Fairmint Studio — Documentation Table of Contents

> **Scope**: Founder-facing docs (Studio). Investor section to be added later.
> **Last verified**: 2026-04-01 against production branch code + UI screenshots + release notes (Jan–Mar 2026).

---

## Legend

| Column | Meaning |
| ------ | ------- |
| **Gate** | Condition that must be true for the feature to appear. Verified against source code; confirmed with screenshots where noted. |
| **Status** | `Done` = written & reviewed. `Existing` = published in Intercom (may need refresh). `New` = needs to be written. |
| **Audience** | `Founders` = Studio-only. `Shared` = relevant to both founders and investors. |

**Needs PM verification** = post-action behavior we can't confirm from code alone (e.g., what happens after a Stripe payment).

---

## 1. Getting Started & Overview

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 1.0 | Why Fairmint? The Vision Behind On-Chain Cap Tables | `1.0-why-fairmint.md` | None | Done | Shared |
| 1.1 | How Does Fairmint Work? | `1.1-how-does-fairmint-work.md` | None | Existing (ID: 9662895) | Shared |
| 1.2 | What is Fairmint One? | `1.2-what-is-fairmint-one.md` | None | Existing (ID: 9662786, needs refresh) | Shared |
| 1.3 | Early Stage — Can I Use Fairmint? | `1.3-early-stage-can-i-use-fairmint.md` | None | Existing (ID: 9662791) | Founders |
| 1.4 | Later Stages — Can I Use Fairmint? | `1.4-later-stages-can-i-use-fairmint.md` | None | Existing (ID: 9662793) | Founders |
| 1.5 | Onboarding & Setting Up Your Portal | `1.5-onboarding-and-setting-up-your-portal.md` | Only shown when the portal is brand new or the user hasn't entered their name yet | Done | Founders |
| 1.6 | Dashboard Overview | `1.6-dashboard-overview.md` | Visible to Owners and Admins only | Done | Founders |
| 1.7 | Is Fairmint a Broker Dealer or Registered Entity? | `1.7-is-fairmint-a-broker-dealer.md` | None | Existing (ID: 9662915) | Shared |
| 1.8 | What If I Want to Stop Using Fairmint? | `1.8-what-if-i-stop-using-fairmint.md` | None | Existing (ID: 9662794) | Shared |
| 1.9 | What If the Smart Contract or Digital Assets Are Compromised? | `1.9-smart-contract-compromised.md` | None | Existing (ID: 9662795) | Shared |

## 2. Series & Fundraising

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 2.0 | Fundraising with Fairmint (Overview) | `2.0-fundraising-with-fairmint.md` | None (conceptual) | Done | Founders |
| 2.1 | Create a Fundraise (Roll Up) | `2.1-create-fundraise-rollup.md` | Free plan → upgrade dialog. Requires Fairmint One. | Done | Founders |
| 2.2 | Create a Fundraise (SAFE) | `2.2-create-fundraise-safe.md` | Free plan → upgrade dialog | Done | Founders |
| 2.3 | How to Publish a Fundraise | `2.3-publish-fundraise.md` | Series must be in setup or ready status | Done (replaces ID: 9662808) | Founders |
| 2.5 | How to Pause/Resume a Fundraise | `2.5-how-to-pause-resume-a-fundraise.md` | Series must be live (to pause) or paused (to resume) | Existing (ID: 9662838) | Founders |
| 2.6 | How to End a Fundraise | `2.6-how-to-end-a-fundraise.md` | Series must be live or paused | Existing (ID: 9662842) | Founders |
| 2.7 | What is a Roll Up Investment? | `2.7-what-is-a-roll-up-investment.md` | None (conceptual) | Existing (ID: 9662816) | Founders |
| 2.8 | What is a Ticker Symbol? | `2.8-what-is-a-ticker-symbol.md` | None (conceptual) | Existing (ID: 9662805) | Founders |
| 2.9 | What Fundraising Templates are Available? | `2.9-what-fundraising-templates-are-available.md` | None (conceptual) | Existing (ID: 9662819) | Founders |
| 2.10 | Deal Page Design | `2.10-deal-page-design.md` | Series must exist. Editor accessible when not closed. | Done (merged with ID: 9662825) | Founders |
| 2.11 | Manage Your Series | `2.11-manage-series-settings.md` | Series must exist (not imported). Tabs vary by status. | Done | Founders |

### Fundraising by Entity Type

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 2.12 | Fundraising for US Based C-Corps | `2.12-fundraising-for-us-based-c-corps.md` | None (conceptual) | Existing (ID: 9662799) | Founders |
| 2.13 | Fundraising for LLCs & Non-US Companies | `2.13-fundraising-for-llcs-and-non-us-companies.md` | None (conceptual) | Existing (IDs: 9662803, 9662802) | Founders |
| 2.15 | Soliciting & Advertising — 506(b) vs 506(c) | `2.15-soliciting-advertising-506b-vs-506c.md` | None (conceptual) | Existing (ID: 9662824) | Shared |
| 2.16 | Use Your Own Legal Agreement | `2.16-use-your-own-legal-agreement.md` | None (conceptual) | Existing (ID: 10484782) | Shared |

## 3. Cap Table

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 3.1 | Import Your Cap Table | `3.1-upload-import-cap-table.md` | Super-admins see a direct link to Timeline View; other users see an import dialog | Done | Founders |
| 3.2 | Can I Import Old Investors into Fairmint? | `3.2-can-i-import-old-investors-into-fairmint.md` | None (FAQ) | Existing (ID: 9662864) | Founders |
| 3.3 | Can I Manage My Entire Cap Table with Fairmint? | `3.3-can-i-manage-my-entire-cap-table-with-fairmint.md` | None (FAQ) | Existing (ID: 9662859) | Founders |
| 3.4 | Cap Table Summary View | `3.4-cap-table-summary-view.md` | Only visible after cap table has been set up. Export, As-Of, and Pro-Forma disabled until cap table has data. | Done | Founders |
| 3.5 | Cap Table Holder View | `3.5-cap-table-holder-view.md` | Same as Summary View — only visible after cap table has been set up | Done | Founders |
| 3.6 | Cap Table Timeline View | `3.6-cap-table-timeline-view.md` | Super-admin only | Done | Founders |
| 3.7 | Pro-Forma Cap Table | `3.7-pro-forma-cap-table.md` | Only available after cap table has been set up. Cannot be used while viewing a historical As-Of date. | Done | Founders |

## 4. Equity Instruments

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 4.1 | Understanding Shares | `4.1-understanding-shares.md` | Nav disabled when no Shares series exists | Done | Founders |
| 4.2 | Understanding SAFEs | `4.2-understanding-safes.md` | Nav disabled when no fundraising series exists | Done | Founders |
| 4.3 | Understanding Warrants | `4.3-understanding-warrants.md` | Nav disabled when no Warrant series exists | Done | Founders |

## 5. Grants (ESOP / Equity Grants)

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 5.1 | Set Up an Equity Grant | `5.1-set-up-an-equity-grant.md` | Nav disabled when no Grant series exists | Done | Founders |
| 5.2 | Manage Equity Grants | `5.2-manage-equity-grants.md` | At least one grant series must exist | Done | Founders |
| 5.3 | Understanding Vesting Schedules | `5.3-understanding-vesting-schedules.md` | None (concept article) | Done | Founders |

## 6. Stakeholders, Investors & Investments

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 6.1 | View and Manage Stakeholders | `6.1-view-manage-stakeholders.md` | Always visible | Done | Founders |
| 6.2 | Invite an Investor (Deal Invitation Links) | `6.2-deal-invitation-links.md` | Series must be live | Done (replaces ID: 9662831) | Founders |
| 6.3 | How to Block an Investor | `6.3-how-to-block-an-investor.md` | Investor must exist | Existing (ID: 9662849) | Founders |
| 6.4 | How to Reset an Investor Country | `6.4-how-to-reset-an-investor-country.md` | Investor must exist | Existing (ID: 9662843) | Founders |
| 6.5 | Can Organizations Limit Investor Type and Number? | `6.5-can-organizations-limit-investor-type-and-number.md` | None (FAQ) | Existing (ID: 9662910) | Shared |
| 6.6 | View and Manage Investments | `6.6-view-manage-investments.md` | Always visible | Done | Founders |

## 7. Tax & Compliance

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 7.1 | Filings (SEC Form D) | `7.1-filings-sec-form-d.md` | Always visible | Done | Founders |
| 7.2 | Risk Factors | `7.2-risk-factors.md` | Always visible | Done | Founders |
| 7.3 | State Fees (Blue Sky) | `7.3-state-fees-blue-sky.md` | Always visible | Done | Founders |
| 7.4 | 409A Report | `7.4-409a-report.md` | Always visible | Done | Founders |
| 7.5 | Jurisdictions | `7.5-jurisdictions.md` | Always visible | Done | Founders |

## 8. Documents

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 8.1 | Documents Overview | `8.1-documents-overview.md` | Always visible. 'Download Documents' only when documents exist. | Done | Founders |
| 8.2 | Generate a Shareholder Register PDF | `8.2-generate-shareholder-register-pdf.md` | Only available after cap table has been set up | Done | Founders |

## 9. Settings

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 9.1 | General Settings (Company Info, Branding) | `9.1-general-settings.md` | Always available. Warning badges until setup tasks cleared. | Done | Founders |
| 9.2 | Bank Details / Funding Options | `9.2-bank-details-funding-options.md` | Always available | Existing (ID: 9662822) | Founders |
| 9.3 | Team Management | `9.3-team-management.md` | Always available. Actions vary by role. | Done (replaces ID: 9662868) | Founders |
| 9.4 | Integrations | `9.4-integrations.md` | Always available. Telegram hidden when bot username unset. | Existing (ID: 9662874) | Founders |
| 9.5 | Custom Domain (DNS) | `9.5-custom-domain.md` | Always available | Existing (ID: 9662882) | Founders |

## 10. Legal & Compliance (Conceptual / FAQ)

> These articles support both founders and investors — no specific Studio page.

| # | Article | File | Gate | Status | Audience |
|---|---------|------|------|--------|----------|
| 10.1 | KYC/KYB, Accreditation, and AML | `10.1-kyc-kyb-accreditation-aml.md` | None | Existing (ID: 9662904) | Shared |
| 10.2 | How Are Transfer Restrictions Managed? | `10.2-transfer-restrictions.md` | None | Existing (ID: 9662907) | Shared |
| 10.3 | Which Securities Exemptions is Fairmint Compatible With? | `10.3-securities-exemptions.md` | None | Existing (ID: 9662903) | Shared |

---

## Gate Reference

Not every feature is visible to every user. Some pages, buttons, or sections only appear when certain conditions are met — for example, having a cap table set up, being on a paid plan, or having a specific role. We call these conditions "gates." The tables below list every gate we've identified, so reviewers and future writers know exactly when each feature shows up and where in the code to verify it.

All gates verified against production code on 2026-03-13. Screenshot-confirmed where noted.

### Account State

| Condition | Effect | Source |
|-----------|--------|--------|
| `captable_minted` = false | Cap Table shows "not yet available" message. Generate Report hidden. Dashboard shows setup CTAs. Export/As-Of/Pro-Forma disabled. | `CaptableDashboard/SummaryView/index.js`, `DataRoom/index.js` |
| `captable_minted` = true but empty | Cap Table shows `CaptableNotReady`. Export/As-Of/Pro-Forma disabled. | `CaptableDashboard/SummaryView/index.js` |
| No series of type X | Shares, SAFEs, Warrants, Grants nav items greyed out. All four confirmed in screenshot. | `layout/config.js` |
| Series not live | Pause, resume, end fundraise unavailable | Various series pages |
| Portal status = `NEW` | Forced into onboarding flow | `layout/portal.js` |
| No `firstname` set | Forced into welcome-invite | `layout/portal.js` |

### Plan & Portal Type

Only two plan tiers exist: **Free** (`"free"`) and **Premium** (`"premium"`, branded "Fairmint One"). DB column `portal.plan` defaults to `"free"`. Studio only defines `PORTAL_PLAN.FREE`; any other value (including `"premium"`) is treated as paid by checking `plan !== "free"`. Premium unlocks all the features that Free restricts — there are no additional Premium-only gates beyond these.

| Condition | Effect | Source |
|-----------|--------|--------|
| Free plan → Raise capital | `+ New` > "Raise capital" intercepted to upgrade dialog (iframe to `fairmint.com/embed/fairmint-one`). Grant equity and cap table import are **not** gated. | `SeriesTypeDialog/index.js` |
| Free plan → Branding | Default Fairmint logo. Paid shows "One" logo (`OneLogo`). | `side-nav.js` |
| Free plan → Invitation links | "For VCs and Qualified Investors Only" toggle disabled. "Require manual validation" toggle disabled. "Require ID verification" toggle disabled with "become a Fairmint One member" prompt (opens Intercom). | `CreateInvitationLinkDialog.js` |
| Free plan → Grant links | "Require ID verification" toggle disabled with same "become a Fairmint One member" prompt. | `CreateGrantLinkDialog.js` |
| Free plan → KYC | Backend forces `override_kyc = true` on free plan. Paid plan: configurable. | API `service-layer` |
| Free plan → Cap table, grants, equity | **Not gated** — all pages accessible regardless of plan. | `layout/config.js` |

No subscription prices or Stripe price IDs exist in app code — pricing is managed on the marketing site via the upgrade iframe.

### Role

| Condition | Effect | Source |
|-----------|--------|--------|
| Not `OWNER` or `ADMIN` | Cannot access portal — redirected | `layout/portal.js` |
| Super-admin | Timeline View in nav. Cap table validation warnings. Direct import link. | `layout/config.js`, `CaptableDashboard/SummaryView/index.js` |
| `has_cap_table_editor` attribute | "Import cap table" opens editor dialog instead of legacy import | `layout/config.js` |

### Feature Flags

| Condition | Effect | Source |
|-----------|--------|--------|
| `VC_DEMO_PORTAL_IDS` | Quick Actions on Dashboard | `Dashboard/index.js` |
| `config_telegramBotUsername` unset | Telegram integration hidden | `Settings/Integrations/index.js` |
| Dev stage | Cap table import uses consolidated drawer (prod uses legacy dialog) | `SeriesTypeDialog/index.js` |

### Mutually Exclusive

| Feature A | Feature B | Rule | Source |
|-----------|-----------|------|--------|
| As-Of date mode | Pro-Forma mode | Only one active at a time | `CaptableDashboard/SummaryView/index.js` |
| Accredited country | Prohibited country | Same country can't be in both lists | `Tax/Jurisdictions/index.js` |

---

## Stats

| Category | Done | Existing | New | Total | Audience |
|----------|------|----------|-----|-------|----------|
| 1. Getting Started | 3 | 7 | 0 | 10 | 6 Shared, 4 Founders |
| 2. Series & Fundraising | 6 | 9 | 0 | 15 | 2 Shared, 13 Founders |
| 3. Cap Table | 5 | 2 | 0 | 7 | Founders |
| 4. Equity Instruments | 3 | 0 | 0 | 3 | Founders |
| 5. Grants | 3 | 0 | 0 | 3 | Founders |
| 6. Stakeholders & Investments | 3 | 3 | 0 | 6 | 1 Shared, 5 Founders |
| 7. Tax & Compliance | 5 | 0 | 0 | 5 | Founders |
| 8. Documents | 2 | 0 | 0 | 2 | Founders |
| 9. Settings | 3 | 2 | 0 | 5 | Founders |
| 10. Legal FAQ | 0 | 3 | 0 | 3 | Shared |
| **Total** | **33** | **26** | **0** | **59** | **47 Founders, 12 Shared** |

All 59 articles now have numbered filenames and YAML front matter in `founders/`.

Redundancy cleanup: 2.4 (Edit Terms) absorbed into 2.11 (Manage Series). 2.13 (LLCs) + 2.14 (Non-US) merged into single 2.13. Orphans resolved: `receive-funds.md` merged into 9.2, `view-investor-dashboard.md` deleted (redundant with 1.6). Trimmed duplicate content across 10 articles (instrument tables, 506(b)/(c), roll-up, SAFE templates, vesting, cap table import). Fixed 3.3 outdated "coming soon" text.

---

## Open Items (Needs PM Verification)

| # | Item | What We Need |
|---|------|--------------|
| ~~1~~ | ~~Filings (7.1)~~ | ~~Resolved — status labels confirmed from production code: "Not filed", "Pending", "Complete"~~ |
| ~~2~~ | ~~State Fees (7.3)~~ | ~~Resolved — status labels confirmed from production code: "Not filed", "Prepaid"~~ |
| ~~3~~ | ~~409A Report (7.4)~~ | ~~Resolved — Stages 1–4 open Stripe checkout; Stages 5–6 open a pre-filled email to contact@fairmint.co. Confirmed from production code and screenshot.~~ |
| ~~4~~ | ~~Investments (6.6)~~ | ~~Resolved — all 13 statuses documented with display labels, colors, and actions. Verified from production code.~~ |
| ~~5~~ | ~~Funds & SPVs~~ | ~~Removed — feature not live for any customers. Section deleted.~~ |
