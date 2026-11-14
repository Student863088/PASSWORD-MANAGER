# PASSWORD-MANAGER

## Local setup

The app stores accounts and vault entries in PostgreSQL. The backend does not need a local PostgreSQL installation; set `DATABASE_URL` to a PostgreSQL connection string first. For local development, from `BlackBeltProject`, install the packages and build the app:

```sh
npm install
npm --prefix frontend install
npm run build
npm start
```

The backend creates its tables from `backend/schema.sql` on startup and seeds the demo account. Open `http://localhost:3001`. For frontend development with Vite, keep `npm start` running and run `npm --prefix frontend run dev` in a second terminal, then open the Vite URL it prints.

For a local session, provide a reachable PostgreSQL connection string in the shell before starting the server. In PowerShell, for example: `$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE"`. Keep this value private and do not commit it.

Admin access is disabled unless the server process is started with the `Admin_Pass` environment variable set. For example, in PowerShell run `$env:Admin_Pass = "your-admin-password"` before `npm start`. The Admin button is always visible to signed-in users; entering this server-side password opens account management. Admin account listings omit saved vault passwords and passphrase hashes. Admins can create, edit, reset passphrases, and delete registered accounts. Users can permanently delete their own registered account and its vault entries from Settings after confirming their passphrase.

Vault entries reference their owning user and are removed automatically when that account is deleted. Registered account passphrases are stored as salted scrypt hashes. Saved website passwords are currently readable text in the database; do not use real credentials until client-side encryption is implemented. Category is one of Personal, Work, Development, or Finance. Color is the entry icon's display color, and notes are optional text. Existing CSV data is not imported automatically when switching to PostgreSQL; back it up and migrate it separately before replacing a deployed version that contains accounts or vault entries.

## Render deployment

The root `render.yaml` Blueprint configures a free Render web service. Create a Render PostgreSQL database separately, then set the web service's `DATABASE_URL` environment variable to the database's **Internal Database URL**. Render applies the schema automatically on backend startup. A free Render PostgreSQL database has 1 GB of storage and expires 30 days after creation; upgrade it within the grace period to retain its data. For an existing deployment, configure its environment variable before deploying this version.

This demo stores saved website passwords as readable text and is not suitable for real credentials or a publicly shared password manager.