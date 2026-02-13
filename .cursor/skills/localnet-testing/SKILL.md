# LocalNet Testing Skill

Use this skill when you need to quickly bring up LocalNet, validate SDK behavior, or run integration
tests before pushing.

## Primary Commands

```bash
# One-time machine setup
npm run localnet:quickstart

# Start + readiness checks
npm run localnet:start

# Service/container status
npm run localnet:status

# Fast connectivity/auth sanity check
npm run localnet:smoke

# LocalNet integration suite
npm run test:integration

# Stop services
npm run localnet:stop
```

## One-Shot Verification

```bash
npm run localnet:verify
```

This runs setup + start + smoke + integration tests.

## Response-Format Sanity Checks

Use these when you need to quickly confirm expected API response shape:

```bash
# Validator status endpoint should respond (often 401 unauthenticated)
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3903/api/validator/v0/wallet/user-status

# Scan endpoint should return a JSON string (DSO party id)
curl -sS http://scan.localhost:4000/api/scan/v0/dso-party-id

# SDK-level OAuth2 + API smoke check
npm run localnet:smoke
```

## Before Push Checklist

```bash
npm run lint && npm run build && npm test
npm run test:integration
```
