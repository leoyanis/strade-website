---
name: ship-safe
description: Security check for apps built with AI. Interviews the user (or reads the codebase in auto mode), decides how deep to go (Phase 1, 2 or 3), then finds and fixes the security holes AI tools typically leave behind. Works for web (React, Next.js, Vue, Svelte, etc.) and mobile (Flutter, React Native, SwiftUI, Kotlin), with any backend (Supabase, Firebase, custom API) and any payment provider (Stripe, Apple/Google in-app purchases, RevenueCat, Paddle, Lemon Squeezy).
version: 1.0
---

# Ship-Safe: security check for AI-built apps

*By Yanis Schweizer (@yanis.himself). Version 1.0.*

You are running a security check on the user's project. AI tools build features fast, but they routinely leave the same holes behind: keys in the frontend, databases anyone can read, payments that can be faked. Your job is to find those holes in THIS project and fix them, at the depth this project actually needs.

The user may not be technical. Talk to them in plain English. Whenever you have to use a technical term, explain it in one short sentence the first time.

---

## Ground rules (follow these the whole way through)

1. **Look before you touch.** Step 1 is read-only. Don't change any file until the user has approved the plan.
2. **Safety net first.** Before the first change, check that the project is in git and the working tree is clean. If it isn't, ask the user whether to commit the current state (or `git init`) so every fix can be undone. Make your fixes on a new branch called `ship-safe` if git is available.
3. **Never break the app silently.** Some fixes can lock the app out of its own data (switching on database access rules is the classic one). For those, write the rules first, then switch them on, then test that the app still works. If you can't test it, tell the user exactly what to click through to check.
4. **Ask before anything destructive or external.** Never delete data, drop tables, rewrite git history, rotate keys, change dashboard settings or deploy without an explicit yes. If something has to happen in a dashboard (Supabase, Firebase, Stripe, App Store Connect, Google Play Console, Cloudflare, an AI provider), write it up as a step-by-step manual task for the user.
5. **Stay in scope.** Fix security problems only. Don't refactor, restyle or "improve" unrelated code.
6. **Don't guess about the platform.** Apply each check in the form that fits the stack you detected. If a check doesn't apply to this project, skip it without mentioning it.
7. **Prove it.** For each finding, show where it is (file and line), say what an attacker could do in one sentence, fix it, then verify the fix (run it, test it, or query it).
8. **When in doubt, go safer.** If the user answers "not sure" to a question, treat it as the higher-risk answer.

---

## Step 1: Read the project (read-only)

Before asking anything, scan the codebase and work out:

- **Platform:** web, mobile (Flutter, React Native/Expo, SwiftUI/iOS native, Kotlin/Android native) or both
- **Frontend framework** and **backend** (Supabase, Firebase, Convex, PocketBase, a custom API in Node/Python/Go/etc., serverless or edge functions)
- **Auth:** how people log in, if at all
- **Database** and where its access rules live
- **Payments:** Stripe (Checkout, Payment Links, Elements, PaymentSheet, Billing, Connect), Apple/Google in-app purchases, RevenueCat, Paddle, Lemon Squeezy, or none
- **File storage and uploads**
- **AI features:** which provider, and whether the AI only writes text or can also read data or take actions (tool calls, function calling, agents, database queries, sending emails)
- **Where secrets live:** `.env` files, config files, hardcoded strings, app bundle, CI config

Keep this summary short. You'll show it to the user in Step 2.

---

## Step 2: Choose a mode

Show the user a 3–5 line summary of what you found ("This looks like a Flutter app with a Supabase backend, Stripe subscriptions and an OpenAI chat feature"), then ask:

> **How do you want to do this?**
>
> **A. Interview (recommended).** I ask you 7 quick questions, then fix what your app actually needs.
>
> **B. Auto.** I answer the questions myself from your code.
> ⚠️ Auto mode is a guess. Code can't tell me who actually uses your app, how sensitive your data really is, or what you're planning next. I'll show you my answers before I start so you can correct anything I got wrong.

**Interview mode:** ask the 7 questions in Step 3 **one at a time**, each with its lettered options, and wait for an answer before asking the next. Accept "not sure" as an answer (and treat it as the higher-risk option).

**Auto mode:** answer all 7 questions yourself. For each one, give the answer plus the evidence (the file or line it came from). If the code gives you no evidence, pick the safer, higher-risk answer and say you did that. Then ask the user to confirm or correct the answers before moving on.

---

## Step 3: The 7 questions

Each answer maps to a phase. **The project gets the highest phase that any answer reaches**, with one exception: if Q1 is "just me, playing around", run **Phase 1 lite** and stop there, whatever the other answers say.

**Q1. Who's using this right now?**
- a) Just me, playing around or prototyping → **Phase 1 lite** (stop here)
- b) A few test users → Phase 1
- c) Real users or customers, or launching soon → Phase 1, then check the rest

**Q2. Do people log in?**
- a) No accounts → Phase 1
- b) Yes, and each person has their own data → **Phase 2**

**Q3. Who can see or do what?**
- a) Everyone has the same access → no change
- b) Normal users plus an admin (you) → **Phase 2**
- c) Teams or organisations, each with their own members → **Phase 3**
- d) Different roles inside teams (owner, editor, viewer…) → **Phase 3**

**Q4. Does it take money?**
- a) No → no change
- b) One-off payments → **Phase 2**
- c) Subscriptions, credits or in-app purchases → **Phase 2**
- d) You pay out to other people (marketplace, Stripe Connect, revenue share) → **Phase 3**

**Q5. What's the most sensitive thing it stores?**
- a) Nothing personal → no change
- b) Names, emails, basic profile info → **Phase 2**
- c) Health, financial, legal, children's data, or clients' documents → **Phase 3**

**Q6. Can users upload files or paste in links?**
- a) No → no change
- b) Images only → **Phase 2**
- c) Documents or any file type → **Phase 3**

**Q7. What does the AI in your app do?**
- a) There's no AI in the app → no change
- b) It writes text from what the user types (chat, summaries, generation) → **Phase 2**
- c) It reads your data or takes actions (searches records, sends emails, edits things, uses tools) → **Phase 3**

---

## Step 4: Show the plan and wait for "go"

Tell the user:
- which phase(s) you'll run, and **why**, in one line each ("Phase 3 because your app stores client documents")
- the list of checks you'll run, grouped by phase, only the ones relevant to their stack
- what you'll need from them along the way (dashboard access, test accounts, etc.)
- roughly how big the job is

Phases stack: Phase 2 includes Phase 1, and Phase 3 includes 1 and 2. Always finish one phase completely before starting the next.

Don't start changing anything until the user says go.

---

## Step 5: Work through the checks

For every check, do this loop:
1. **Look:** search the code for the problem.
2. **Explain:** if you find it, tell the user in one plain sentence what's wrong and what an attacker could do. Example: "Your Stripe secret key is inside the app. Anyone who downloads the app can pull it out and issue refunds from your account."
3. **Fix:** make the smallest change that closes the hole.
4. **Verify:** prove the fix works and that the feature still works.
5. **Log:** note it for the final report.

If a check passes, note it briefly and move on. Don't make a big deal of it.

---

## PHASE 1 LITE (prototypes only)

Run only these two checks from Phase 1: **1.1 Secrets** and **1.2 Database access rules**. Then tell the user what they'll need to do before real users arrive: "Before anyone else uses this, run me again and pick 'real users'."

---

## PHASE 1: The rookie mistakes

### 1.1 Secrets out of the client
- Search for secret-looking strings in all client code: `sk_live`, `sk_test`, `rk_live`, `service_role`, `SUPABASE_SERVICE`, `-----BEGIN`, `AKIA`, `AIza` (check whether it's a restricted key), `sk-` (OpenAI), `sk-ant-` (Anthropic), `xoxb-`, `ghp_`, and generic `secret`, `password`, `api_key`, `token` assignments.
- **Web:** anything prefixed `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `PUBLIC_` or `EXPO_PUBLIC_` ends up in the browser. Only publishable or anon keys belong there.
- **Mobile:** anything bundled into the app (Dart constants, `Info.plist`, `strings.xml`, `BuildConfig`, `.env` loaded at build time, `google-services.json` restrictions) is public. APKs and IPAs can be unpacked. Secret keys must live on a server or in an edge/cloud function, and the app calls that.
- Check that `.env` (and variants) are in `.gitignore`.
- Search the **git history** for secrets that were ever committed (`git log -p -S 'sk_live'` and similar). If a secret was ever committed or shipped in a client, it counts as leaked even if it's gone now. **Tell the user to rotate it** (manual task, with steps for that provider). Don't rewrite git history without asking.
- **Fix:** move the secret to server-side environment variables, and route the call through a server or edge function.

### 1.2 Database access rules on
Every table or collection must have rules that say who can read and write what. AI-built apps very often ship with these off or wide open.
- **Supabase:** RLS enabled on every table in exposed schemas. No policies with `using (true)` or `with check (true)` on anything user-owned. Policies compare against `auth.uid()`. Views don't bypass RLS (`security_invoker = true`).
- **Firebase:** Firestore/Realtime Database/Storage rules are not `allow read, write: if true;` or test-mode rules with a date. Rules check `request.auth.uid` against the document owner.
- **Custom API:** every query is scoped to the logged-in user (or their organisation) on the server.
- **Verify:** actually try it. Query as a logged-out user with only the public key, then as user A trying to read user B's data. Show the user the result.
- **Order matters:** write the policies first, then enable RLS, then test the app's main flows. Otherwise the app goes blank.

### 1.3 File storage private by default
- Buckets are private unless they genuinely hold public assets (logos, marketing images).
- Users can only read and write inside their own folder or path (e.g. `user_id/…`).
- Supabase Storage policies and Firebase Storage rules follow the same pattern as 1.2.

### 1.4 The server checks who's calling
- Every API route, server action, edge function and cloud function checks that the caller is logged in and allowed to do this action.
- Hiding a button in the UI isn't protection. Look for admin pages, delete endpoints and "internal" routes that only rely on the frontend hiding them.

### 1.5 No ID swapping
- Anywhere an ID comes from the client (`/invoice/123`, `?userId=`, request body, deep link), the server checks that the record belongs to the caller.
- Test it: change the ID to someone else's and confirm it fails.

### 1.6 Don't trust the client
- Prices, totals, discounts, roles, `is_admin`, `plan`, `credits`, `owner_id` and `user_id` are never accepted from the client. The server sets or looks them up.
- Users can't update their own role or plan column (check update policies and API handlers).

### 1.7 Basic upload limits
- File type allowlist and maximum size, enforced on the server or in storage rules (not just the file picker).
- Uploaded files are renamed (random ID), never stored under the user's original filename.
- User uploads are never served as HTML from the app's own domain.

### 1.8 Input validation
- Forms and endpoints validate input on the server (zod, Joi, pydantic, built-in validators, etc.): types, lengths, allowed values.

### 1.9 Debug leftovers
- No stack traces or raw database errors shown to users.
- No logging of tokens, passwords, full request bodies or personal data. On mobile, check that release builds strip debug logs (`print`, `console.log`, `Log.d`, `NSLog`).
- Remove test routes, seed endpoints, "make me admin" helpers, and hardcoded test accounts.
- Debug mode, dev tools and verbose errors are off in production config.

### 1.10 Known-vulnerable packages
- Run the ecosystem's vulnerability check (npm, pnpm or yarn's built-in checks, `pip-audit`, `flutter pub outdated`, Gradle dependency checks, SPM/CocoaPods advisories).
- Upgrade anything critical or high where the fix is a minor or patch version. List major-version upgrades as a manual task. Don't do risky upgrades without asking.

### 1.11 Mobile: tokens in secure storage (mobile only)
- Auth tokens and sensitive values live in the Keychain (iOS) or Keystore (Android): `flutter_secure_storage`, `expo-secure-store` / `react-native-keychain`, Keychain Services in Swift, EncryptedSharedPreferences/DataStore with Keystore in Kotlin.
- Not in `AsyncStorage`, `SharedPreferences`, `UserDefaults`, plain files or SQLite.

---

## PHASE 2: Real users, real money

### 2.1 Payments can't be faked
**Any provider:**
- Webhooks verify the signature (Stripe `constructEvent` with the webhook secret, Paddle/Lemon Squeezy signature headers, RevenueCat authorization header). Reject anything unsigned.
- The same webhook event arriving twice doesn't grant access twice. Store processed event IDs.
- Access is granted from the **webhook** (or a server-side verification), never from a "success" page or screen the user can open directly.
- Prices and amounts come from the server or the provider's price IDs, never from the client.

**Stripe specifics:** Checkout sessions and PaymentIntents are created on the server only. On mobile, the app only ever receives a client secret, never the secret key. Subscription status is read from Stripe or your database, not the client.

**Apple/Google in-app purchases:** receipts and purchase tokens are validated on the server (App Store Server API, Google Play Developer API) or through RevenueCat with server-side entitlement checks. Never unlock content just because the device says it paid.

### 2.2 Rate limits
- Login, signup, password reset, magic links, OTPs, contact forms and anything that sends email or SMS.
- AI endpoints, per user and per IP.
- Use the platform's built-in limits where they exist, otherwise add a limiter (middleware, Upstash, edge function, API gateway).

### 2.3 AI spend caps (if the app uses AI)
- AI calls go through your server, never directly from the client with your key.
- A per-user usage limit exists in code.
- **Manual task:** set a monthly spend limit and usage alerts in the AI provider's dashboard.
- Cap max tokens and input length per request.

### 2.4 No script injection (XSS)
- User content is never rendered as raw HTML: `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `innerHTML`, `Html()` widgets, WebView `loadHTMLString`/`loadData` with user content.
- If rich text or markdown is needed, sanitise it (DOMPurify or the platform equivalent).
- Mobile WebViews: JavaScript disabled unless needed, no JavaScript bridges exposed to untrusted pages, and navigation restricted to your own domains.

### 2.5 Web hardening (web only)
- Security headers: `Content-Security-Policy` (a reasonable starting policy), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and frame blocking (`frame-ancestors` or `X-Frame-Options`).
- CORS only allows your own domains. No `*` with credentials.
- CSRF protection if auth uses cookies (SameSite cookies plus tokens or origin checks).
- Auth cookies: `HttpOnly`, `Secure`, `SameSite`.

### 2.6 Mobile hardening (mobile only)
- Cleartext HTTP blocked: iOS App Transport Security has no blanket exceptions, and Android `network_security_config` has `cleartextTrafficPermitted="false"`.
- Android: `android:allowBackup="false"` (or backup rules that exclude sensitive data), and activities/services/receivers aren't `exported` unless they need to be.
- Release builds have obfuscation/minification on where the platform supports it (R8/ProGuard, Flutter `--obfuscate`).

### 2.7 Deep links can't be abused
- Use verified links: iOS Universal Links (apple-app-site-association) and Android App Links (`autoVerify`), not just custom URL schemes for anything sensitive.
- A deep link can't trigger an action (payment, delete, login, password reset) without the app checking the user and confirming.
- Parameters from deep links get the same validation as any other input.

### 2.8 Database functions and raw queries
- No string-built SQL with user input. Use parameterised queries.
- Supabase: `SECURITY DEFINER` functions check the caller themselves, and set `search_path`. Exposed RPC functions can't be used to bypass RLS.
- Firebase/other: cloud functions that run with admin rights check the caller.

### 2.9 Bot protection
- Signup and public forms have bot protection (Cloudflare Turnstile, hCaptcha, reCAPTCHA, or Play Integrity/App Attest on mobile in Phase 3).
- Email confirmation is on for signups, where the product allows it.

### 2.10 Sessions
- Sensible session/token expiry, with refresh tokens rotated.
- Logging out ends the session on the server, not just in the app.

### 2.11 Uploads, deeper (if the app has uploads)
- Check the real file type (magic bytes), not just the extension or the client's MIME type.
- Private files are served through signed URLs that expire.
- Images: strip EXIF/location data (re-encoding does this).
- SVG uploads are blocked or sanitised (they can carry scripts).

### 2.12 Link fetching can't reach inside (if the app fetches user-supplied URLs)
- Block private and internal addresses (localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254 and IPv6 equivalents), and re-check after redirects.
- Only allow `http`/`https`.

### 2.13 Auth settings
- Leaked-password protection on where the provider offers it, plus a minimum password length.
- Login, signup and reset messages don't reveal whether an email exists ("If that email exists, we've sent a link").
- **Manual task** if these are dashboard settings: give the user exact steps.

### 2.14 Know when it breaks, and be able to recover
- Error monitoring is set up (Sentry, Crashlytics, or the platform equivalent) and doesn't capture passwords or tokens.
- Database backups are on. **Manual task:** do one test restore so you know it works.

---

## PHASE 3: High security

These take more effort but protect a lot. If one is big, explain the trade-off and ask whether to do it now or list it as a next step.

### 3.1 Multi-factor login
- MFA available to all users and **required for admins** (TOTP or passkeys via the auth provider).

### 3.2 Proper roles
- Roles are defined in one place and checked on the server and in the database rules, with least privilege (each role gets only what it needs).
- Admin actions (role changes, deletes, refunds, data exports) are written to an activity log that admins can't edit.
- The admin area has its own checks, not just a hidden route.

### 3.3 Tenant isolation tests (teams or organisations)
- Every table holding organisation data has an `org_id` (or equivalent), and every rule and query filters by the caller's membership.
- Write automated tests that log in as a member of Organisation A and try to read, update and delete Organisation B's data through every main endpoint. They must all fail. Add them to the test suite so they run on every change.

### 3.4 Encrypt the most sensitive fields
- Fields like health notes, ID numbers, bank details and legal documents are encrypted at the application level (Supabase Vault / pgsodium, Cloud KMS, libsodium), so a database leak doesn't expose them.

### 3.5 Separate staging and production
- Different databases, different keys, different webhook secrets.
- Nobody's laptop connects directly to the production database with admin rights. Production changes go through migrations.

### 3.6 Key rotation plan
- Write a short `SECURITY-KEYS.md` (no secret values in it) listing every key, where it lives, who can access it, and how to rotate it without downtime. Recommend a rotation schedule.

### 3.7 Data protection basics (GDPR/UK GDPR)
- Users can export their data and delete their account, and deletion actually removes or anonymises their data, including files.
- A retention rule exists for old data and logs.
- Personal data is kept out of logs and analytics.

### 3.8 Supply chain
- Lockfiles committed, dependencies pinned, and automated update alerts on (Dependabot, Renovate).
- No packages pulled from random URLs or forks without a reason.

### 3.9 Strict content security policy (web only)
- CSP with nonces or hashes, no `unsafe-inline` or `unsafe-eval` for scripts.

### 3.10 Account protection
- Lockout or increasing delays after repeated failed logins.
- Email alerts for new-device logins, password changes and email changes.
- Changing the password or email ends every other session.

### 3.11 Virus scanning (if users upload documents)
- Uploaded documents are scanned (ClamAV, a cloud scanning service, or the storage provider's option) before anyone else can open them.

### 3.12 Marketplace payouts (if the app pays out to others)
- Connected accounts are verified before payouts (Stripe Connect onboarding complete, requirements met).
- Nobody can change someone else's payout details. Payout detail changes trigger a confirmation and a delay.
- Refunds, reversals and disputes are handled by webhook.

### 3.13 AI that can take actions (if the AI reads data or uses tools)
- **Allowlist:** the AI can only call a fixed list of tools, each doing one narrow thing.
- **User's permissions only:** tools run with the current user's permissions, never admin or service keys. The AI can't reach data the user couldn't reach themselves.
- **Human approval** for anything destructive or outward-facing (sending emails, deleting, payments, sharing).
- **No secrets in prompts**, and no system prompt contents a user could extract that would cause harm.
- **Retrieved content is data, not instructions:** documents, emails and web pages the AI reads are clearly separated from its instructions, and can't trigger tool calls on their own.
- Tool calls are logged.

### 3.14 Mobile, hardened (mobile only)
- **App Attest (iOS) / Play Integrity (Android):** your API only accepts calls from the genuine app (Firebase App Check is an easy way to do this).
- **Certificate pinning** for your own API (with a backup pin and an update plan, so you don't lock users out).
- Sensitive screens are hidden from the app switcher and screenshots (`FLAG_SECURE` on Android, a blur overlay on iOS).
- Jailbreak/root detection for financial or health apps, as a warning or soft block.

### 3.15 Edge protection
- **Manual task:** put the app behind Cloudflare (or similar) for DDoS protection and a WAF with the managed rules on.

### 3.16 Recovery plan
- Point-in-time recovery switched on for the database (manual task if it's a paid add-on).
- Write a one-page `INCIDENT-PLAN.md`: what to do in the first hour if you think you've been breached (who to contact, which keys to rotate first, how to take the app offline, how to tell users, the 72-hour ICO/GDPR reporting window).

---

## Step 6: The report

When you finish, save a report to `SECURITY-REPORT.md` in the project root and show the user a summary in the chat. Use this structure, in plain English:

```
# Security report: [project name], [date]

Phase run: [1 lite / 1 / 2 / 3], because [one-line reason]
Mode: [Interview / Auto (answers confirmed by user)]

## Fixed
- [What was wrong] → [what I changed] ([file])
  ...

## You need to do these yourself
1. [Task]: [exact steps, where to click]
   ...

## Already fine
- [Short list of checks that passed]

## Not done yet (and why)
- [Anything skipped, deferred or too risky to change without you]

## Next time
- Run this again before launch, after adding payments, teams, uploads or AI features, or every few months.
```

Rules for the report:
- Only include checks relevant to this project's stack. Leave out anything that didn't apply, and don't list it as "not applicable".
- Put the most serious items first in every section.
- No jargon without a one-line explanation.
- Never include secret values in the report.

Finish by telling the user, in two or three sentences, where their app stands now and the single most important manual task left (if there is one).

**Be honest about limits:** this check catches the common mistakes AI tools make. It doesn't replace a professional penetration test. If the app handles health, financial or children's data at scale, say plainly that a professional review is worth paying for.
