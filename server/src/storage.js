import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

// ---------- Cache disque local (mode Drive) ----------
// Chrome lit une vidéo en de nombreuses requêtes "Range" : sans cache, chacune repasse par Drive (~1,5 s).
// On garde donc une copie sur le disque du serveur, Drive restant la copie permanente.

const CACHE_MAX = (Number(process.env.MEDIA_CACHE_MB) || 500) * 1024 * 1024;
const downloading = new Map(); // nom -> Promise

const cachePath = (name) => path.join(UPLOAD_DIR, name);

async function cacheWrite(name, buffer) {
  try {
    await fsp.writeFile(cachePath(name), buffer);
    pruneCache();
  } catch {
    /* le cache est facultatif */
  }
}

/** Télécharge le fichier complet depuis Drive vers le cache (une seule fois à la fois par fichier). */
function cacheFill(name, id) {
  if (downloading.has(name)) return downloading.get(name);
  const tmp = `${cachePath(name)}.${process.pid}.part`;
  const p = (async () => {
    const r = await drive(`/files/${id}?alt=media`);
    if (!r.ok) throw new Error(`Google Drive ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, cachePath(name));
    pruneCache();
  })()
    .catch(() => fsp.rm(tmp, { force: true }))
    .finally(() => downloading.delete(name));
  downloading.set(name, p);
  return p;
}

let pruning = false;
/** Supprime les fichiers les moins récemment lus si le cache dépasse CACHE_MAX. */
async function pruneCache() {
  if (pruning) return;
  pruning = true;
  try {
    const files = [];
    for (const f of await fsp.readdir(UPLOAD_DIR)) {
      if (!SAFE_NAME.test(f)) continue; // ignore .gitkeep et les .part en cours
      const st = await fsp.stat(cachePath(f)).catch(() => null);
      if (st) files.push({ f, size: st.size, t: st.mtimeMs });
    }
    let total = files.reduce((s, x) => s + x.size, 0);
    for (const x of files.sort((a, b) => a.t - b.t)) {
      if (total <= CACHE_MAX) break;
      await fsp.rm(cachePath(x.f), { force: true });
      total -= x.size;
    }
  } catch {
    /* ignore : nouvel essai au prochain ajout */
  } finally {
    pruning = false;
  }
}

function serveFromCache(req, res, name) {
  const now = new Date();
  fsp.utimes(cachePath(name), now, now).catch(() => {}); // marque comme récemment lu
  res.sendFile(cachePath(name), { maxAge: '365d', immutable: true, acceptRanges: true }, (err) => {
    if (err && !res.headersSent) res.status(err.status || 500).end();
  });
}

async function driveServe(req, res, next) {
  const name = req.params.name;
  if (!SAFE_NAME.test(name)) return res.status(404).end();
  if (fs.existsSync(cachePath(name))) return serveFromCache(req, res, name);
  try {
    const id = await fileId(name);
    if (!id) return res.status(404).end();
    cacheFill(name, id); // en arrière-plan : les requêtes suivantes seront servies depuis le disque
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
  await fsp.rm(cachePath(name), { force: true });
  const id = await fileId(name);
  if (!id) return;
  await drive(`/files/${id}`, { method: 'DELETE' });
  idCache.delete(name);
}

// ---------- API commune ----------

export async function saveFile(name, buffer, mime) {
  if (useDrive) {
    await driveSave(name, buffer, mime);
    await cacheWrite(name, buffer);
    return;
  }
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
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (useDrive) {
    router.get('/:name', driveServe);
  } else {
    router.use(express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true }));
  }
  return router;
}
