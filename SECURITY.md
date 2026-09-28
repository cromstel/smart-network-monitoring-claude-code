# Security Policy

## Supported Versions

This project is self-hosted and released from `main`. Security fixes are applied to the latest code only:

| Version                  | Supported           |
| ------------------------ | ------------------- |
| `main` / latest release  | :white_check_mark:  |
| Older commits / releases | :x:                 |

There is no long-term-support branch. If you run an older checkout, upgrade to the latest `main` before reporting an issue that may already be fixed.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use GitHub's private vulnerability reporting instead:

**https://github.com/cromstel/smart-network-monitoring-claude-code/security/advisories/new**

Include in your report:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept, affected endpoint, configuration, etc.)
- Affected version / commit hash if known
- Any known mitigations or workarounds

### What to expect

- **Acknowledgement:** within **7 days** of submission.
- **Status updates:** at least every **14 days** while the issue is open.
- **Resolution:** accepted reports are fixed on `main` and credited in the advisory (unless you prefer to remain anonymous). You will be notified before any public disclosure so we can coordinate a fix and release window.
- Reports that are declined (e.g. not reproducible, out of scope) will include an explanation.

### Scope

In scope:

- Vulnerabilities in this application's code (authentication, authorization, injection, session handling, secrets handling, dependencies declared in `package.json` / lockfile).

Out of scope:

- Denial-of-service / brute-force volume testing against systems you do not own
- Vulnerabilities in third-party infrastructure (routers, ISPs, hosting providers) or in upstream projects (report those upstream)
- Findings from automated scanners without a demonstrated exploit path
- Issues in unmodified default configurations that require prior privileged access to the host

### Safe harbor

We consider good-faith security research conducted under this policy to be authorized. We will not pursue legal action against researchers who:

- Act without malicious intent and in compliance with applicable law
- Only access data necessary to demonstrate the vulnerability (no mass collection, no service disruption)
- Keep findings confidential until a fix is available or disclosure is agreed
- Never access, modify, or retain other users' data beyond what is strictly required for proof

## Configuration & Deployment Notes

This application ships with sensitive configuration that must be set per deployment (see `.env.example`):

- `SESSION_SECRET` — must be a long, random value unique to your deployment
- `ENCRYPTION_KEY` — must be a long, random value unique to your deployment; rotating it makes previously encrypted data unreadable
- Never commit `.env` files; the database file and backups should be treated as sensitive data

## Dependency Security

- Dependencies are kept current; run `npm audit` after updating the lockfile.
- Report vulnerable dependencies through the same private reporting channel above.
