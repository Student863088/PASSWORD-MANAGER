# PASSWORD-MANAGER

## Local setup

This demo uses two CSV files instead of PostgreSQL. From `BlackBeltProject`, install the frontend packages once and build the app:

```sh
npm --prefix frontend install
npm run build
npm start
```

Open `http://localhost:3001`. For frontend development with Vite, keep `npm start` running and run `npm --prefix frontend run dev` in a second terminal, then open the Vite URL it prints.

The server creates `BlackBeltProject/backend/data/users.csv` and `vault.csv` on first start. User rows contain a generated user ID and a salted scrypt hash of the account passphrase. Vault rows reference that ID and store saved website passwords as readable text; the `website` column corresponds to the form's Website field. Category is one of Personal, Work, Development, or Finance. Color is the entry icon's display color, and notes are optional text. Older vault files with a `url` header are updated to `website` when the server starts. The CSV files are ignored by Git. This is a simple, local demo store, not suitable for real credentials or a publicly shared server.