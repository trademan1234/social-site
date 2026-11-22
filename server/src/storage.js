import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import express from 'express';

/**
 * Stockage des médias.
 * - Si GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET et GDRIVE_REFRESH_TOKEN sont définis :
 *   fichiers envoyés dans un dossier Google Drive (créé automatiquement) et relayés par le serveur.
 * - Sinon : dossier local ./uploads (comportement d'origine).
 * Dans les deux cas, les URLs restent /uploads/<nom>.
 */

const UPLOAD_DIR = path.resolve('uploads');
const SAFE_NAME = /^[a-z0-9-]+\.[a-z0-9]+$/i; // noms générés par le serveur uniquement
const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = process.env;
const FOLDER_NAME = process.env.GDRIVE_FOLDER_NAME || 'pulse-uploads';
const useDrive = Boolean(GDRIVE_CLIENT_ID && GDRIVE_CLIENT_SECRET && GDRIVE_REFRESH_TOKEN);
const DRIVE = 'https://www.googleapis.com/drive/v3';
const CACHE_HEADER = 'public, max-age=31536000, immutable';

export const storageMode = useDrive ? 'Google Drive' : 'disque local';

// ---------- Google Drive (API REST, sans dépendance) ----------

let token = null; // { value, expiresAt }
async function accessToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Google OAuth : ${data.error} ${data.error_description || ''}`.trim());
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function drive(url, init = {}) {
  const headers = { ...init.headers, Authorization: `Bearer ${await accessToken()}` };
  return fetch(url.startsWith('http') ? url : DRIVE + url, { ...init, headers });
}

async function driveJson(url, init) {
  const r = await drive(url, init);
  if (!r.ok) throw new Error(`Google Drive ${r.status} : ${await r.text()}`);
  return r.json();
}

let folderPromise = null;
function folderId() {
  folderPromise ??= (async () => {
    const q = `name='${FOLDER_NAME.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const found = await driveJson(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
    if (found.files.length) return found.files[0].id;
    const created = await driveJson('/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    return created.id;
  })().catch((e) => {
    folderPromise = null; // réessayer au prochain appel
    throw e;
  });
  return folderPromise;
}

const idCache = new Map(); // nom -> id Drive
async function fileId(name) {
  if (idCache.has(name)) return idCache.get(name);
  const q = `name='${name}' and '${await folderId()}' in parents and trashed=false`;
  const found = await driveJson(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const id = found.files[0]?.id ?? null;
  if (id) idCache.set(name, id);
  return id;
}

async function driveSave(name, buffer, mime) {
  // Envoi "resumable" en une seule requête : fonctionne aussi pour les vidéos > 5 Mo
  const init = await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime },
    body: JSON.stringify({ name, parents: [await folderId()], mimeType: mime }),
  });
  if (!init.ok) throw new Error(`Google Drive ${init.status} : ${await init.text()}`);
  const r = await fetch(init.headers.get('location'), {
    method: 'PUT',
    headers: { 'Content-Type': mime, 'Content-Length': String(buffer.length) },
    body: buffer,
  });
  if (!r.ok) throw new Error(`Google Drive ${r.status} : ${await r.text()}`);
  idCache.set(name, (await r.json()).id);
}

async function driveServe(req, res, next) {
  const name = req.params.name;
  if (!SAFE_NAME.test(name)) return res.status(404).end();
  try {
    const id = await fileId(name);
    if (!id) return res.status(404).end();
    const headers = req.headers.range ? { Range: req.headers.range } : {};
    const r = await drive(`/files/${id}?alt=media`, { headers });
    if (!r.ok && r.status !== 206) {
      if (r.status === 404) idCache.delete(name);
      return res.status(r.status === 416 ? 416 : 502).end();
    }
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!r.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', CACHE_HEADER);
    const body = Readable.fromWeb(r.body);
    res.on('close', () => body.destroy());
    body.on('error', () => res.destroy());
    body.pipe(res);
  } catch (e) {
    next(e);
  }
}

async function driveRemove(name) {
  const id = await fileId(name);
  if (!id) return;
  await drive(`/files/${id}`, { method: 'DELETE' });
  idCache.delete(name);
}

// ---------- API commune ----------

export async function saveFile(name, buffer, mime) {
  if (useDrive) return driveSave(name, buffer, mime);
  await fsp.writeFile(path.join(UPLOAD_DIR, name), buffer);
}

export function removeFile(name) {
  name = path.basename(name);
  const p = useDrive ? driveRemove(name) : fsp.unlink(path.join(UPLOAD_DIR, name));
  return p.catch(() => {});
}

/** Routeur à monter sur /uploads */
export function uploadsRouter() {
  const router = express.Router();
  if (useDrive) {
    router.get('/:name', driveServe);
  } else {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    router.use(express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true }));
  }
  return router;
}
