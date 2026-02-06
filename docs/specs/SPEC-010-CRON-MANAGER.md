# SPEC-010: Cron Manager (Phase 2)

## Summary
Implemented a visual Cron Manager in OpenClaw Studio at `/cron` with job listing, status toggling, manual run execution, and run-history inspection.

## Scope Delivered
- New route: `/cron`
- Sidebar navigation link for Cron
- Search modal quick action for Cron
- Cron manager component suite under `src/components/cron-manager/`
- Gateway-backed API routes for listing, toggling, running, and history
- Cron expression human-readable rendering
- Search/filter/sort controls
- Glass-card, responsive UI with motion animations

## Files Added
- `src/routes/cron.tsx`
- `src/screens/cron/cron-manager-screen.tsx`
- `src/components/cron-manager/CronJobList.tsx`
- `src/components/cron-manager/CronJobCard.tsx`
- `src/components/cron-manager/CronJobDetail.tsx`
- `src/components/cron-manager/CronJobForm.tsx`
- `src/components/cron-manager/cron-types.ts`
- `src/components/cron-manager/cron-utils.ts`
- `src/lib/cron-api.ts`
- `src/server/cron.ts`
- `src/routes/api/cron/list.ts`
- `src/routes/api/cron/run.ts`
- `src/routes/api/cron/toggle.ts`
- `src/routes/api/cron/runs/$jobId.ts`

## Files Updated
- `src/screens/chat/components/chat-sidebar.tsx`
- `src/components/search/search-modal.tsx`

## API Contracts
### `GET /api/cron/list`
- Returns `{ jobs: CronJob[] }`
- Proxies to gateway cron list methods with fallback method names.

### `POST /api/cron/run`
- Body: `{ jobId: string }`
- Triggers immediate execution of a cron job.

### `POST /api/cron/toggle`
- Body: `{ jobId: string, enabled: boolean }`
- Enables/disables a cron job.

### `GET /api/cron/runs/:jobId?limit=10`
- Returns `{ runs: CronRun[] }`
- Fetches and normalizes latest runs.

## UI Behavior
- Card-grid overview of jobs
- Job card displays:
  - Name
  - Raw cron expression
  - Humanized schedule
  - Enabled/disabled badge
  - Last run timestamp + result status
  - Toggle switch
  - Run Now button
- Expandable detail panel shows:
  - Schedule info
  - Payload JSON
  - Delivery config JSON
  - Last 10 runs (status, timestamp, duration, error)

## Filtering & Sorting
- Search by job name/schedule/description
- Status filter: all/enabled/disabled
- Sort by: name/schedule/last run

## Cron Humanization
Simple parser supports:
- `* * * * *` -> Every minute
- `*/N * * * *` -> Every N minutes
- `M * * * *` -> At minute M past every hour
- `M H * * *` -> Every day at HH:MM
- `M H * * D` -> Every <weekday> at HH:MM
- Fallback to raw expression when unmatched

## Data Normalization
Gateway responses are normalized defensively:
- Tolerates variant payload keys (`jobs/items/entries/tasks`, `runs/items/history`)
- Tolerates variant field names (`id/jobId/key`, `schedule/cron/expression`, etc.)
- Timestamp normalization for seconds/ms/ISO strings
- Status normalization to `success/error/running/queued/unknown`

## Verification
- Build/lint/tests executed after implementation.
- No additional migrations required.
