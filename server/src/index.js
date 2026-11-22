import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { connectDb } from './db.js';
import { uploadsRouter, storageMode } from './storage.js';
import { optionalAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import messageRoutes from './routes/messages.js';

const PORT = process.env.PORT || 3000;
const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors());
app.use(compression()); // gzip des réponses JSON / HTML / JS
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// Médias : noms uniques -> cache navigateur 1 an (immutable). Les requêtes "Range" permettent le streaming vidéo.
app.use('/uploads', uploadsRouter());

app.use('/api', optionalAuth);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route inconnue' }));

// En production, Express sert l'application Angular compilée
const clientDist = path.resolve('../client/dist/client/browser');
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, file) => {
        res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
      },
    })
  );
  app.get(/^(?!\/(api|uploads)\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Gestion d'erreurs (multer, validation...)
app.use((err, _req, res, _next) => {
  const tooBig = err.code === 'LIMIT_FILE_SIZE';
  const status = tooBig ? 413 : err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: tooBig ? 'Fichier trop lourd (100 Mo max).' : status >= 500 ? 'Erreur serveur' : err.message });
});

await connectDb();
console.log(`📁 Stockage des médias : ${storageMode}`);
app.listen(PORT, () => console.log(`🚀 Pulse sur http://localhost:${PORT}`));
