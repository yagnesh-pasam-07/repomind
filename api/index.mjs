// Vercel function (D35): the full RepoMind web app + API on Neon Postgres.
// Every path is rewritten here by vercel.json; static assets (brand, social preview) are served from public/.
import { waitUntil } from '@vercel/functions';
import { createApp } from '../dist/server/index.js';
import { NeonStore } from '../dist/server/store.js';

let appPromise;
function app() {
  appPromise ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (connect the Neon database in Vercel).');
    const store = await NeonStore.connect(process.env.DATABASE_URL);
    // Vercel stops a function once its response is sent unless work is passed to waitUntil.
    // Backfill is kept short so a scan and its history fit in one function run.
    return createApp({ store, pollMinutes: 5, backfill: 5, waitUntil });
  })();
  return appPromise;
}

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    const a = await app();
    // Cron: poll connected repos. Vercel signs cron calls with CRON_SECRET.
    if (req.url?.startsWith('/api/cron/poll')) {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        res.statusCode = 401;
        return res.end('Unauthorized');
      }
      const checked = await a.pollAll();
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ checked }));
    }
    await a.handle(req, res);
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  }
}
