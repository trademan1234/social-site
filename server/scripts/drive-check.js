/**
 * Vérifie les identifiants Google Drive de bout en bout, sans rien afficher de secret.
 * À lancer dans ton propre terminal :  node scripts/drive-check.js
 * Utilise GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN s'ils sont définis, sinon les demande.
 */
import readline from 'node:readline/promises';
import express from 'express';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
for (const [key, label] of [
  ['GDRIVE_CLIENT_ID', 'ID client OAuth'],
  ['GDRIVE_CLIENT_SECRET', 'Code secret du client'],
  ['GDRIVE_REFRESH_TOKEN', 'Refresh token'],
]) {
  process.env[key] = (process.env[key] || (await rl.question(`${label} : `))).trim();
}
rl.close();

const { saveFile, removeFile, uploadsRouter, storageMode } = await import('../src/storage.js');
const step = (msg) => console.log(`✅ ${msg}`);
const name = `check-${Date.now().toString(36)}.txt`;
const content = 'Pulse : test de stockage Google Drive';

try {
  if (storageMode !== 'Google Drive') throw new Error('identifiants incomplets');
  await saveFile(name, Buffer.from(content), 'text/plain');
  step('Connexion Google, API Drive et dossier « pulse-uploads » : OK (fichier de test envoyé)');

  const app = express().use('/uploads', uploadsRouter());
  const server = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${server.address().port}/uploads/${name}`);
  const text = await r.text();
  server.close();
  if (r.status !== 200 || text !== content) throw new Error(`relecture échouée (HTTP ${r.status})`);
  step('Relecture du fichier : OK');

  await removeFile(name);
  step('Suppression du fichier de test : OK');
  console.log('\n🎉 Les identifiants fonctionnent. Tu peux les mettre dans Render → Environment.');
} catch (e) {
  console.error('\n❌ Échec :', e.message);
  const m = e.message;
  if (/invalid_client/.test(m)) console.error('→ ID client ou code secret incorrect (ou client supprimé).');
  else if (/invalid_grant/.test(m))
    console.error('→ Refresh token invalide ou expiré : relance node scripts/drive-auth.js (et publie l\'app en « Production »).');
  else if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/.test(m))
    console.error('→ Google Drive API (drive.googleapis.com) n\'est pas activée dans le projet de cet ID client.');
  else if (/insufficient|403/.test(m)) console.error('→ Autorisation insuffisante : relance node scripts/drive-auth.js.');
  process.exitCode = 1;
}
