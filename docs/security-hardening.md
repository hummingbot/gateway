# Gateway security hardening — threat model & rationale

This document explains *why* the wallet-security changes in this PR (hummingbot/gateway#652)
are needed, grounded in the 2025–2026 threat landscape, and what each change does. It is
written for operators and reviewers.

## TL;DR

Gateway is a self-hosted HTTP API that **holds wallet private keys** and exposes
fund-moving endpoints. Historically it (1) bound to **all network interfaces** by default,
(2) protected fund/secret routes with a **single static passphrase compared in
non-constant time**, (3) had only a **coarse global rate limit**, and (4) encrypted keys
at rest with a **weak KDF**. On an untrusted network (e.g. a laptop on café WiFi, or a
cloud VM), that combination can lead to **irreversible loss of funds**.

The guiding principle of these changes: **loopback is trusted; the network is not.** A
request from `127.0.0.1` is already on the machine, so nothing changes for a normal local
bot (zero UX cost). Every new control engages only for **non-loopback** traffic — exactly
the case that is dangerous.

## Why this matters now: the 2025–2026 threat landscape

The thing that changed is **speed and automation**. AI/agentic tooling has collapsed the
cost of "scan → fingerprint → exploit," so a service that is reachable from the network is
found and probed within *hours*, not weeks.

- **Exposed = found fast.** GreyNoise honeypots logged **91,403 attack sessions** against
  newly-exposed endpoints (Oct 2025–Jan 2026); in one campaign **two IPs generated 80,469
  sessions in 11 days**. This is generic mass-exploitation infrastructure that
  indiscriminately probes any newly-open port.
  ([GreyNoise](https://www.greynoise.io/blog/threat-actors-actively-targeting-llms))
- **Autonomous exploitation is real.** Anthropic disclosed (Nov 2025) the first
  AI-orchestrated espionage campaign (GTG-1002) where the model did **80–90% of the
  tactical work** — recon, exploit generation, credential harvesting — at **thousands of
  requests/second**.
  ([Anthropic](https://www.anthropic.com/news/disrupting-AI-espionage)) Palo Alto Unit 42's
  "Zealot" PoC chained **SSRF → credential theft → privilege escalation → exfiltration "in
  seconds"** from a single prompt.
  ([Unit 42](https://unit42.paloaltonetworks.com/autonomous-ai-cloud-attacks/))
- **Credential attacks are machine-speed and adaptive.** AI-driven credential stuffing
  runs across thousands of endpoints in minutes and uses reinforcement learning to rotate
  IPs/fingerprints — which **degrades naive per-IP rate limiting**. Lockout must therefore
  also consider the credential, not just the source IP.
  ([Cyber Defense Magazine](https://www.cyberdefensemagazine.com/the-rise-of-ai-driven-credential-stuffing-why-identity-and-access-management-iam-alone-cant-save-you/))
- **Public-WiFi client isolation is no longer a safe assumption.** The **AirSnitch**
  research (NDSS 2026) defeats Wi-Fi client isolation — broadcast-key abuse, "gateway
  bouncing," MAC-spoof MITM — and was effective on **every network tested** (home, office,
  airport, coffee shop). So "the café AP firewalls other clients off from me" is false; you
  must assume a same-network attacker can reach and MITM you.
  ([SecurityWeek](https://www.securityweek.com/new-airsnitch-attack-shows-wi-fi-client-isolation-could-be-a-false-sense-of-security/))
- **The agent operating Gateway is itself an attack surface.** OWASP's MCP Top 10 (Jun
  2026) and Agentic Top 10 formalize prompt-injection / tool-poisoning / token-exposure
  risks: untrusted content an AI trading bot ingests (a token name, a webpage, an RPC
  response) can become instructions to call dangerous endpoints or exfiltrate keys.
  ([OWASP MCP Top 10](https://cycode.com/blog/owasp-mcp-top-10/))

The Hummingbot Foundation independently acted on the same threat model: **Gateway v2.15.1
(2026-06-27) removed unsafe server-side wallet operations**, citing "a sharp rise in
automated bots scanning cloud servers for vulnerabilities." These changes are
complementary to that.

**The throughline:** every one of these advanced threats requires the attacker to *reach*
the service. So the single highest-leverage control is to **not be reachable** — bind to
loopback and use an overlay network (Tailscale/WireGuard) for any remote access.

## The changes, and why each one

Mapped to the four areas of #652. Ranked by value; all are ~zero-UX-cost for a local bot.

### §4 — Bind to loopback by default (the keystone)

**What:** Gateway defaults to binding `127.0.0.1`. Exposing it to the network is an
explicit opt-in (`GATEWAY_BIND_ADDRESS`), and when exposed it **refuses to start without an
API token** and logs a loud warning. The shipped `docker-compose.yml` publishes the port on
the host loopback only (`127.0.0.1:15888:15888`) while the container binds `0.0.0.0`
(required inside Docker) — so the host is not network-reachable by default.

**Why:** This neutralizes essentially every threat above at the source — scanning bots,
autonomous exploit chains, credential attacks, and AirSnitch MITM all require network
reachability. For a single-user local bot it costs nothing (the bot talks to `127.0.0.1`).

> **Breaking change:** deployments that *relied* on Gateway being reachable across the
> network will need to set `GATEWAY_BIND_ADDRESS` and an API token, or (recommended) reach
> it over Tailscale/WireGuard. That break is the point — those deployments were exposed.

### §1 — Real API token, separate from the passphrase, constant-time compare

**What:** A per-deployment 256-bit API token (auto-generated on first run, stored `0600`, or
supplied via `GATEWAY_API_KEY`) authenticates **non-loopback** requests to fund-moving/secret
routes via an `Authorization: Bearer` header, verified with `crypto.timingSafeEqual`. It is
**opt-in** — enabled by setting `GATEWAY_REQUIRE_AUTH=true` (or `GATEWAY_API_KEY`), which you
do when exposing Gateway. It is off by default so it never breaks a local or Docker
deployment (in Docker the source IP is the bridge gateway, not loopback); the default
protection is loopback binding (§4).

**Why:** The wallet-encryption passphrase should not double as the network auth secret, and a
shared static secret compared with `!==` is a textbook timing-oracle. A high-entropy token —
verified in constant time and required only for network requests — blocks unauthenticated
drive-by hits (the dominant automated threat) with near-zero UX cost (set once in the client).
Loopback requests are always trusted, so a local bot is unaffected.

### §2 — Per-endpoint rate limiting + lockout

**What:** The global rate limiter now **allow-lists loopback** (the local bot is never
throttled) and bans repeat abusers (429 → 403). Sensitive routes get stricter limits.

**Why:** Counters machine-speed credential/endpoint brute-forcing. Because adaptive bots
rotate IPs, this is defense-in-depth layered behind the token (an unauthenticated request is
rejected *and* counts toward the ban) rather than the sole control. Invisible to a
legitimate local user, who never trips it.

### §3 — Stronger at-rest key encryption (already in this PR)

**What:** scrypt (OWASP-minimum `N=2^17`) + AES-256-GCM authenticated encryption, replacing
PBKDF2-5000 + AES-256-CTR (no MAC); wallet files `0600`; legacy files migrated on unlock.

**Why:** If a key file ever leaks (backup, snapshot, disk access), it must be expensive to
brute-force offline and tamper-evident. Note the ceiling is always passphrase entropy — a
weak passphrase defeats any KDF (see below).

### Anti-fingerprinting (cheap add-ons)

Swagger `/docs` is served only on loopback (or by explicit flag), so an exposed Gateway does
not hand an attacker its full route map; error messages for auth failures are generic (no
"no passphrase configured" vs "wrong passphrase" oracle).

## Operator guidance

1. **Keep Gateway on loopback.** For remote access use Tailscale/WireGuard (`tailscale
   serve`, *not* `funnel`), never a public port. Never run `--dev` (HTTP) on an untrusted
   network.
2. **Use a strong passphrase.** This is the ultimate ceiling on key-at-rest security:
   `peanut2012`-style passphrases crack in seconds if a file leaks; a weak passphrase
   defeats even the new scrypt KDF. Use a long, random passphrase (e.g. 24+ random chars or
   a 6-word diceware phrase), and **store it separately from where the keystores are backed
   up** — if the passphrase leaks alongside the files, the KDF buys nothing.
3. **Treat the trading bot as an untrusted client.** Give it the scoped API token, keep
   private keys out of its context (Gateway signs internally; never expose raw keys over the
   wire), and pin/vet dependencies (supply-chain compromises of AI tooling were a 2025–2026
   theme).

## What this does *not* fix

If an attacker achieves **code execution on the host**, they can read the passphrase from
the running process and the decrypted keys from memory — no at-rest control helps then. For
that residual, the protection is operational (keep the host clean, minimal listening
services, firewall on) plus **on-chain controls that bound blast radius** (e.g. a
restricted smart-contract-wallet delegate with per-mint spend caps), which limit losses even
in a full host compromise.

## Sources

- GreyNoise, mass-scanning of exposed endpoints — https://www.greynoise.io/blog/threat-actors-actively-targeting-llms
- Anthropic, first AI-orchestrated espionage campaign (Nov 2025) — https://www.anthropic.com/news/disrupting-AI-espionage
- Palo Alto Unit 42, autonomous AI cloud attacks ("Zealot") — https://unit42.paloaltonetworks.com/autonomous-ai-cloud-attacks/
- AirSnitch / Wi-Fi client-isolation bypass (NDSS 2026) — https://www.securityweek.com/new-airsnitch-attack-shows-wi-fi-client-isolation-could-be-a-false-sense-of-security/
- AI-driven credential stuffing — https://www.cyberdefensemagazine.com/the-rise-of-ai-driven-credential-stuffing-why-identity-and-access-management-iam-alone-cant-save-you/
- OWASP MCP Top 10 (agentic risks) — https://cycode.com/blog/owasp-mcp-top-10/
- OWASP API Security Top 10 (2023), API2 Broken Authentication — https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
- OWASP Password Storage Cheat Sheet (scrypt parameters) — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- NIST SP 800-38D (AES-GCM) — https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf
- @fastify/rate-limit — https://github.com/fastify/fastify-rate-limit
- Tailscale Serve (private remote access) — https://tailscale.com/kb/1242/tailscale-serve
