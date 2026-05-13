# TSX Spiff Live

Troubleshooting branch: `codex-reliable-troubleshoot-version`.

## Run Locally

```bash
npm install
npm run serve
```

Open `http://localhost:4173`.

## Refresh Data Locally

Set one of these credential paths:

```bash
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json npm run update
```

`npm run update` updates local `data.json` and embedded dashboard data only. It does not push.

To publish from the updater:

```bash
npm run update:push
```

## Checks

```bash
npm run check
npm test
```

## Reliability Notes

- Dashboard contest timing is pinned to `America/New_York`.
- QA/interference failures do not count toward spiff totals.
- `data.json` now supports a timestamped payload: `{ generatedAt, timezone, agentCount, agents }`.
- The dashboard still accepts the old array-only `data.json` shape for comparison and rollback testing.
