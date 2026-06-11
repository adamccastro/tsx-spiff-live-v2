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
- The updater also pins `process.env.TZ` to Eastern at startup, so zone-less sheet
  timestamps parse identically on any machine. For belt-and-suspenders, set it on
  the cron line too:

  ```
  */5 10-18 * * 1-5 TZ=America/New_York /usr/local/bin/node /path/to/update-spiff.js --push
  ```

- QA/interference failures do not count toward spiff totals.
- Qualification requires a true 240+ seconds (no rounding). Durations parse in both
  word format (`5m 34s`, `1hr 3m`, plural `mins`/`secs` ok) and clock format
  (`1:03:20`, `5:34`). Any unreadable duration prints a warning instead of being
  silently skipped.
- `data.json` supports a timestamped payload: `{ generatedAt, timezone, agentCount, agents }`.
- The dashboard still accepts the old array-only `data.json` shape for comparison and rollback testing.
