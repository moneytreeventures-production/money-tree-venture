import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose, { type Connection } from "mongoose";
import { createConnectionManager, type ConnectionCache } from "../../src/lib/db/connection-manager";
import { classifyMongoFailure, requireMongoConfig } from "../../src/lib/db/mongodb";
import { parseServerEnv } from "../../src/lib/env/schema";

test("MongoDB configuration is optional until explicitly required", () => {
  const env = parseServerEnv({});
  assert.throws(() => requireMongoConfig(env), /MONGODB_URI and MONGODB_DB_NAME/);
});

test("MongoDB failure diagnostics classify safe categories without exposing messages", () => {
  assert.deepEqual(classifyMongoFailure(Object.assign(new Error("querySrv ENOTFOUND private.example"), { code: "ENOTFOUND" })), { errorName: "Error", errorCode: "ENOTFOUND", category: "dns_srv" });
  assert.equal(classifyMongoFailure(Object.assign(new Error("server selection timed out"), { name: "MongoServerSelectionError" })).category, "server_selection_timeout");
  assert.equal(classifyMongoFailure(Object.assign(new Error("bad auth"), { code: 18 })).category, "authentication");
  assert.equal(classifyMongoFailure(Object.assign(new Error("TLS handshake failed"), { code: "ERR_TLS" })).category, "tls");
});

test("importing the MongoDB module does not initiate a connection", () => {
  assert.equal(mongoose.connection.readyState, 0);
});

test("connection manager shares concurrent attempts and clears a failed attempt", async () => {
  type FakeConnection = { readyState: number };
  const cache: ConnectionCache<FakeConnection> = { connection: { readyState: 0 } };
  let calls = 0;
  let finish: ((value: FakeConnection) => void) | undefined;
  const manager = createConnectionManager(cache, async () => {
    calls += 1;
    if (calls === 1) throw new Error("first attempt failed");
    return await new Promise<FakeConnection>((resolve) => { finish = resolve; });
  });

  await assert.rejects(manager(undefined), /first attempt failed/);
  const first = manager(undefined);
  const second = manager(undefined);
  await Promise.resolve();
  assert.equal(calls, 2);
  const connected = { readyState: 1 };
  finish?.(connected);
  assert.equal(await first, connected);
  assert.equal(await second, connected);
  assert.equal(await manager(undefined), connected);
  assert.equal(calls, 2);
});

test("Mongoose connection promise is shared, errors are redacted, and live connection is reused", async (t) => {
  const oldUri = process.env.MONGODB_URI;
  const oldName = process.env.MONGODB_DB_NAME;
  process.env.MONGODB_URI = "mongodb+srv://private-user:private-password@example.invalid/private-db";
  process.env.MONGODB_DB_NAME = "private-db";
  t.after(() => {
    if (oldUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = oldUri;
    if (oldName === undefined) delete process.env.MONGODB_DB_NAME;
    else process.env.MONGODB_DB_NAME = oldName;
  });

  const mutableConnection = mongoose.connection as Connection & { readyState: number };
  let attempts = 0;
  let finish: ((value: typeof mongoose) => void) | undefined;
  t.mock.method(mongoose, "connect", async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("mongodb+srv://sensitive failure details");
    return await new Promise<typeof mongoose>((resolve) => { finish = resolve; });
  });

  const { connectToDatabase } = await import("../../src/lib/db/mongodb");
  await assert.rejects(connectToDatabase(), (error: Error) => {
    assert.doesNotMatch(error.message, /sensitive|private-password|example\.invalid/);
    return /Connection details are redacted/.test(error.message);
  });

  const one = connectToDatabase();
  const two = connectToDatabase();
  await Promise.resolve();
  assert.equal(attempts, 2);
  mutableConnection.readyState = 1;
  finish?.(mongoose);
  const [first, second] = await Promise.all([one, two]);
  assert.equal(first, mongoose.connection);
  assert.equal(second, first);
  assert.equal(await connectToDatabase(), first);
  assert.equal(attempts, 2);

  // Simulate driver-managed reconnect after a successful initial connection.
  mutableConnection.readyState = 0;
  mutableConnection.readyState = 1;
  assert.equal(await connectToDatabase(), first);
  assert.equal(attempts, 2);
});
