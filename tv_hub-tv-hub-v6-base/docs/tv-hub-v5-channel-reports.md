# TV Hub V5: Channel Reports

V5 adds a reporting flow that demonstrates local file storage in a web application. A report stores metadata in MongoDB, while up to five optional evidence images are stored on the local filesystem.

## Flow

1. A signed-in user selects **Report problem** from a channel card on Home.
2. The Reports page sends `channelId`, `reason`, `description` and optional `evidence` images through `FormData` to `POST /api/reports`.
3. `authenticate` identifies the user and Multer saves permitted images under `uploads/reports/`.
4. The controller stores a `Report` document with `evidenceUrls` such as `/uploads/reports/<uuid>.png`.
5. `GET /api/reports` returns the signed-in user's reports, newest first, for the Reports page.
6. `PATCH /api/reports/:id` updates the reason, description and status of the signed-in user's report.
7. `DELETE /api/reports/:id` deletes the signed-in user's report and its local evidence files.

```text
Home → Reports form → POST /api/reports → authenticate → Multer → Report Controller → MongoDB
                                                   └──────────────→ uploads/reports/<uuid>.image

Reports page → GET /api/reports → authenticate → Report Controller → MongoDB → JSON → Reports page
Reports page → PATCH or DELETE /api/reports/:id → authenticate → Report Controller → MongoDB and uploads
```

## Report data

Each report has `userId`, `channelId`, `reason`, `description`, optional `evidenceUrls`, `status`, `createdAt` and `updatedAt`. Status can be `OPEN`, `IN_PROGRESS` or `RESOLVED`.

## Upload rules

- Up to five optional files named `evidence`.
- JPEG, PNG, GIF and WebP only.
- Maximum size: 2 MB.
- Generated UUID filenames avoid trusting original filenames.
- `app.ts` exposes `/uploads` as static files so evidence URLs open in the browser.
- If report creation fails, every uploaded file from that request is removed.
- Deleting a report also attempts to delete all its evidence files. A missing file does not prevent the report deletion.

## Relevant files

- `src/middleware/upload.ts`: Multer disk configuration.
- `src/models/report.model.ts`: Report schema.
- `src/controllers/report.controller.ts`: create, list, update and delete operations.
- `src/routes/report.routes.ts`: authenticated report endpoints.
- `src/public/reports.html` and `src/public/js/reports.js`: form, evidence links, edit and delete actions.

## Existing development data

Earlier local development data may use the former `evidenceUrl` field. This version uses `evidenceUrls`; delete and recreate those development Reports to use the new structure. No automatic migration is included.

## Running and testing

Install dependencies, start MongoDB and run the app as usual:

```bash
npm install
docker compose up -d
npm run build
npm run dev
npm test
```

Reporting starts from Home, where active channels and their identifiers are already available. The feature does not add streaming-specific behavior.
