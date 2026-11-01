import { MongoClient, type Db } from "mongodb";
let connection: Promise<Db> | undefined;
export class SetupError extends Error {
  constructor() {
    super(
      "MongoDB is not connected yet. Add a working Atlas URI to the server configuration. No local database is used.",
    );
  }
}
export async function database() {
  if (!process.env.MONGODB_URI) throw new SetupError();
  if (!connection) {
    connection = (async () => {
      const client = new MongoClient(process.env.MONGODB_URI!, {
        serverSelectionTimeoutMS: 6000,
        maxPoolSize: 8,
      });
      try {
        await client.connect();
        const db = client.db(process.env.MONGODB_DB || "opportunity_compass");
        await Promise.all([
          db
            .collection("agent_messages")
            .createIndex({ userId: 1, createdAt: -1 }),
          db
            .collection("shared_leads")
            .createIndex({ userId: 1, url: 1 }, { unique: true }),
          db
            .collection("agent_preferences")
            .createIndex({ userId: 1 }, { unique: true }),
          db.collection("users").createIndex({ email: 1 }, { unique: true }),
          db
            .collection("sessions")
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          db
            .collection("saved")
            .createIndex({ userId: 1, opportunityId: 1 }, { unique: true }),
          db.collection("resumes").createIndex({ userId: 1 }, { unique: true }),
          db
            .collection("discovered_opportunities")
            .createIndex({ userId: 1, sourceUrl: 1 }, { unique: true }),
          db
            .collection("saved_researched")
            .createIndex({ userId: 1, sourceUrl: 1 }, { unique: true }),
          db
            .collection("opportunity_status_images")
            .createIndex({ userId: 1, id: 1 }, { unique: true }),
          db
            .collection("rate_limits")
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        ]);
        return db;
      } catch (e) {
        await client.close();
        throw e;
      }
    })().catch(() => {
      connection = undefined;
      throw new SetupError();
    });
  }
  return connection;
}
