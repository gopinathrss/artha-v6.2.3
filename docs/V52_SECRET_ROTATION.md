# Secret keyfile (`secret.key`) — backup and rotation

## Location

- Default: `%APPDATA%\artha\secret.key` (Windows) or set `ARTHA_SECRET_KEY_PATH`.
- All **Settings** and **IntegrationProvider** secret columns use the same AES-256-GCM keyfile.

## If the keyfile is lost

- Encrypted values cannot be decrypted. Users must **re-enter** SMTP, IMAP, OpenAI, Telegram, and integration API keys in the UI.

## Rotation (outline)

1. Stop Artha.
2. Backup DB + old `secret.key`.
3. Generate a new 32-byte keyfile (or let Artha create one on next boot after rename).
4. **Re-encrypt**: decrypt each secret with the old key and encrypt with the new key (maintenance script — planned; today: re-enter via UI).

## Backup

- Nightly: include `secret.key` in the same encrypted backup volume as Postgres dumps.
