# V5 — Email ingestion (Path B)

## Gmail app password

Google Account → Security → 2-Step Verification → App passwords. Create an app password for “Mail” and use it in ARTHA’s IMAP password field (not your normal Gmail password). Official help: [https://support.google.com/accounts/answer/185833](https://support.google.com/accounts/answer/185833)

## What ARTHA reads

- IMAP **INBOX** (or your configured mailbox).
- **Unseen** messages from roughly the **last 30 days** that match Erste / Česká spořitelna / related senders in the From header.
- Message bodies are parsed heuristically for ISIN (CZ/AT/IE…), CZK amounts, Czech dates (`DD.MM.YYYY`), and known fund names.

## What ARTHA does not do

- Does **not** delete or move emails on the server.
- Does **not** send email on your behalf from this flow.
- Does **not** mark messages as read (duplicate previews are reduced via `Message-ID` when present).

## Preview vs auto-ingest

| `autoIngestEmails` | Behaviour |
|--------------------|-----------|
| `false` (default)  | Creates `EmailIngestionPreview` rows with `PENDING`. You approve or reject via API or future UI on Alerts. |
| `true`             | Same previews, plus when parser **confidence ≥ 70** and ISIN + amount match a **holding**, a `SipExecution` is created and the preview is marked `AUTO_INGESTED`. |

## Disable / clear

- Turn off **Auto-ingest** in Settings and save.
- Clear IMAP host/user/password fields and save to stop scheduled runs from connecting (hourly job returns “IMAP not configured” when credentials are missing).
- Remove or reject preview rows in the database if you want a clean queue (`REJECTED` / delete via SQL in emergencies).

## Related endpoints

- `POST /api/ingestion/run` — manual fetch + parse.
- `GET /api/ingestion/previews?status=PENDING`
- `POST /api/ingestion/previews/:id/approve` / `reject`
- `POST /api/ingestion/test-connection` — validates IMAP login.
