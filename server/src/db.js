import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

/**
 * Connexion MongoDB.
 * - Si MONGO_URI est défini : utilise ce serveur (MongoDB local, Docker, Atlas...).
 * - Sinon : démarre un MongoDB embarqué (mongodb-memory-server) persisté dans ./data/db,
 *   pour que l'application tourne sans rien installer.
 */
export async function connectDb() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.resolve('data/db');
    fs.mkdirSync(dbPath, { recursive: true });
    const mongod = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', port: 27027 },
    });
    uri = mongod.getUri('pulse');
    console.log('🗄️  MongoDB embarqué démarré (données dans server/data/db)');
    const stop = async () => {
      await mongoose.disconnect();
      await mongod.stop({ doCleanup: false });
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
  await mongoose.connect(uri);
  console.log('✅ Connecté à MongoDB');
}
