/**
 * Génère le GDRIVE_REFRESH_TOKEN pour le stockage Google Drive.
 * À lancer UNE fois, dans ton propre terminal :  node scripts/drive-auth.js
 * Le jeton s'affiche uniquement dans ce terminal : colle-le dans Render (Environment), nulle part ailleurs.
 */
import http from 'node:http';
import { exec } from 'node:child_process';
import readline from 'node:readline/promises';

const SCOPE = 'https://www.googleapis.com/auth/drive.file'; // uniquement les fichiers créés par Pulse

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const clientId = (process.env.GDRIVE_CLIENT_ID || (await rl.question('ID client OAuth : '))).trim();
const clientSecret = (process.env.GDRIVE_CLIENT_SECRET || (await rl.question('Code secret du client : '))).trim();
rl.close();

const server = http.createServer();
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const redirectUri = `http://127.0.0.1:${server.address().port}`;

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });

console.log('\nOuvre cette adresse si le navigateur ne s\'ouvre pas tout seul :\n\n' + authUrl + '\n');
exec(process.platform === 'win32' ? `start "" "${authUrl}"` : `open "${authUrl}" || xdg-open "${authUrl}"`);

server.on('request', async (req, res) => {
  const params = new URL(req.url, redirectUri).searchParams;
  if (!params.has('code') && !params.has('error')) return res.writeHead(404).end();
  try {
    if (params.get('error')) throw new Error(params.get('error'));
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code: params.get('code'),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = await r.json();
    if (!data.refresh_token) throw new Error(data.error_description || data.error || 'pas de refresh_token reçu');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>✅ C\'est bon, retourne dans le terminal.</h2>');
    console.log('✅ Autorisation réussie. Ajoute ces 3 variables dans Render → Environment :\n');
    console.log(`GDRIVE_CLIENT_ID=${clientId}`);
    console.log('GDRIVE_CLIENT_SECRET=(celui que tu viens de saisir)');
    console.log(`GDRIVE_REFRESH_TOKEN=${data.refresh_token}\n`);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>❌ Échec, voir le terminal.</h2>');
    console.error('❌ Échec :', e.message);
  } finally {
    server.close();
  }
});
