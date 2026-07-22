// ============================================================
//  server.js — entrypoint. Boots the Express app.
// ============================================================
import './env.js';
import { createApp } from './app.js';
import { env } from './env.js';

const port = parseInt(env('PORT', '3001'), 10);
const app = createApp();

app.listen(port, () => {
  console.log(`✓ Zenith Peak API listening on http://localhost:${port}`);
  console.log(`  env: ${env('NODE_ENV', 'development')}`);
});
