# PASSWORD-MANAGER

## Local setup

This demo uses two CSV files instead of PostgreSQL. From `BlackBeltProject`, install the frontend packages once and build the app:

```sh
npm --prefix frontend install
npm run build
npm start
```

Open `http://localhost:3001`. For frontend development with Vite, keep `npm start` running and run `npm --prefix frontend run dev` in a second terminal, then open the Vite URL it prints.

The server creates four CSV files in `BlackBeltProject/backend/data` on first start: `users.csv` and `vault.csv` hold registered accounts and their entries; `demo_users.csv` and `demo_vault.csv` hold the separate demo account and its entries. Vault rows reference a user ID. Registered account passphrases are stored as salted scrypt hashes. Saved website passwords are readable text; the `website` column corresponds to the form's Website field. Category is one of Personal, Work, Development, or Finance. Color is the entry icon's display color, and notes are optional text. Older vault files with a `url` header are updated to `website` when the server starts. Demo entries previously stored in `vault.csv` are moved to `demo_vault.csv` on startup. The CSV files are ignored by Git. This is a simple, local demo store, not suitable for real credentials or a publicly shared server.