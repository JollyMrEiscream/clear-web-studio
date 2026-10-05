# Clear Web Studio Admin

Private dashboard for prospects, projects, payments, PayPal invoicing, and hosting renewals.

## Cloud sync (GitHub)

Dashboard data syncs to the private repo [`JollyMrEiscream/clear-web-studio-admin`](https://github.com/JollyMrEiscream/clear-web-studio-admin) as `admin-data.json`.

1. Create a GitHub personal access token:
   - Classic: enable the `repo` scope, or
   - Fine-grained: Contents **Read and write** on `clear-web-studio-admin`
2. Open the admin page → **Sync**
3. Paste the token and click **Save token**
4. Click **Sync now** (or just keep working — saves debounce-push automatically)

The first successful sync creates `admin-data.json` in that private repo if it does not exist yet. See `admin-data.example.json` for the schema.

The token stays in this browser’s `localStorage` only. It is never written into `admin-data.json`.

### Recovering older local-only data

If you previously entered PayPal / prospects on another URL (for example `localhost`), open the admin from that same origin once, connect the token, then **Sync now**. That pushes the old localStorage payload to GitHub so every other browser can pull it.

## Local use

Serve the site folder (or open via GitHub Pages) and visit `/admin.html`.
