# Security Finding Catalog

Per-axis expansion of the parent SKILL.md Step 3 (security bucket). Load when triaging an OWASP-style security finding. Pairs with the universal `<constraint>` rules: evidence-bearing file:line, articulated attack scenario, calibrated severity.

## OWASP Top 10 (2021) → Finding-Template Mapping

| OWASP | Symptom in code | Severity floor | False-positive guard |
|---|---|---|---|
| A01: Broken Access Control | Missing role/ownership check on a mutating endpoint; IDOR on `/resource/:id` | HIGH (CRITICAL if admin-scope) | Endpoint may be behind an upstream WAF / middleware — read the middleware chain |
| A02: Cryptographic Failures | Hardcoded key/secret; weak hash (MD5, SHA-1) for passwords; missing TLS; weak IV reuse | HIGH | Code may be a test fixture — check `.test.` / `tests/` / NODE_ENV gating |
| A03: Injection (SQL, command, log, prompt) | String concatenation into a query/shell/prompt; user input in `eval` / `exec` / `Function()` | CRITICAL if exploitable | ORM may parameterize; the concatenation may be a literal-only string |
| A04: Insecure Design | Trust boundary missing; auth flow with no rate limit; password reset accepting any email | HIGH | Often a class of bug, not a single line — name the trust boundary explicitly |
| A05: Security Misconfig | Permissive CORS (`*`); debug mode in prod; default credentials; verbose error pages | MEDIUM-HIGH | Config may be env-gated — verify the prod path |
| A06: Vulnerable Components | Old dep with known CVE; lockfile lock pinned to a vulnerable version | Severity of the CVE | See `dep-vuln-workflow` exposure filter — build-time-only deps drop severity |
| A07: AuthN failures | No rate limit on login; reusable session tokens; missing MFA on sensitive ops | HIGH | Rate limit may live in middleware/proxy/WAF — verify before reporting |
| A08: Integrity (deserialization, supply chain) | `pickle.loads(user_input)`, `yaml.load` without `SafeLoader`, dynamic `import()` of user-controlled string | CRITICAL | Yaml may use `safe_load` despite the variable name |
| A09: Logging failures | Logging secrets/PII; no audit log on sensitive ops; no structured logs | MEDIUM | Logger may have a redactor — check the formatter config |
| A10: SSRF | `fetch(user_input_url)` without allowlist; URL parsed but not validated; redirects followed | HIGH | Allowlist may exist at the HTTP client level — check the constructor |

## Severity Calibration

The 3 questions to ask BEFORE assigning severity:

1. **Who can trigger it?** Anonymous internet → CRITICAL/HIGH. Authenticated user → HIGH/MEDIUM. Authenticated admin → MEDIUM/LOW. Only triggerable by code path that doesn't run in prod → DROP.
2. **What do they get?** Full account takeover / DB exfiltration → CRITICAL. Single-user data leak → HIGH. Crash / DoS → MEDIUM. Information disclosure (stack trace) → LOW.
3. **Is there a compensating control?** Upstream WAF blocks it → drop severity 1 tier. Already requires authn → drop severity 1 tier. The fix is one line → keep severity (you'll ship it anyway).

If you can't answer (1) AND (2) concretely, drop the finding entirely. "Could theoretically" without a path is a false positive.

## Common Security False-Positives

| Pattern | Why it triggers | Why it's not a bug |
|---|---|---|
| `eval` in a build script | Eval reaches user code | Build scripts run in dev/CI; input is constant from your own repo |
| Hardcoded "key" string | Looks like a secret | It's a JWT issuer name, a public ID, or an OAuth client_id (public by spec) |
| `dangerouslySetInnerHTML` with markdown | Bypass React escaping | Markdown was already sanitized by `DOMPurify` / `marked` with safe defaults — verify the chain |
| `child_process.exec` with template literal | Looks like injection | Args are interpolated from internal data only; user input was validated upstream — verify |
| `crypto.createHash('md5')` | Weak hash | Used for content-addressed caching (non-security) or AWS S3 ETag matching — not a password |

## Output Template (extends the parent SKILL.md format)

```text
CRITICAL · Security · A03:2021 · src/api/search.ts:42
  Evidence:
    const sql = `SELECT * FROM products WHERE name LIKE '%${req.query.q}%'`
    const rows = await db.raw(sql)
  Why it's a problem: User-controlled `req.query.q` concatenated into raw SQL.
    A request with q=' OR 1=1-- returns every row; with q='; DROP TABLE products--
    drops the table. No WAF in front of this endpoint.
  Suggested fix: parameterize via `db('products').where('name', 'like', `%${q}%`)`
    or `db.raw('... LIKE ?', [`%${q}%`])`.
  CVSS: 9.8 (AV:N/AC:L/PR:N/UI:N)
  OWASP: A03:2021 — Injection
```

## See Also

- `../SKILL.md` — universal 5-step review procedure + constraints
- `security` skill — sequential 5-phase OWASP pipeline (adversarial hunt + synthesis) for full coverage
- `dep-vuln-workflow` skill — when the finding is a vulnerable dependency
- `fix-workflow` references/security-fix-templates.md — once findings are approved for fix
- OWASP Top 10 (2021): https://owasp.org/Top10/
- CWE catalog: https://cwe.mitre.org/
