import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Clock, CoreConfig, CoreSecrets, Db, ObjectStore } from '../ports';
import { systemClock } from '../ports';
import { NodeSqliteDb } from '../adapters/node-sqlite';
import { FsStore, MemoryStore } from '../adapters/local-store';
import { Identity } from '../domain/identity';
import { ModelConnections, openRouterKeyVerifier } from '../domain/model';
import { Artifacts } from '../domain/artifacts';
import { Runs } from '../domain/runs';
import { Channels } from '../domain/channels';
import { Gateway } from '../domain/gateway';
import { Feed } from '../domain/feed';
import { Social } from '../domain/social';
import { VistaStates } from '../domain/state';
import { Asker } from '../domain/ask';
import { RunExecutor } from '../execution/executor';
import { OpenRouterProvider, StubProvider, type ModelProvider } from '../execution/provider';
import type { Validator } from '../execution/validator';
import { LocalRuntimeHost } from '../runtime/local-host';
import { GoogleOidc } from '../http/google-oidc';
import { createApp } from '../http/app';

export interface BootstrapOptions {
  config: CoreConfig; secrets: CoreSecrets; clock?: Clock;
  dbPath?: string; storeDir?: string; db?: Db; store?: ObjectStore;
  provider?: ModelProvider | 'stub' | 'openrouter'; validator: Validator;
  nodeTokens?: Map<string, string>; realTimers?: boolean; log?: (e: Record<string, unknown>) => void;
}

export const MIGRATION_SQL = readFileSync(fileURLToPath(new URL('../../migrations/0001_init.sql', import.meta.url)), 'utf8');

/** Composition root for the Node host (local dev, tests). The Worker has its own root with Cloudflare adapters. */
export function bootstrap(o: BootstrapOptions) {
  const clock = o.clock ?? systemClock;
  const db = o.db ?? new NodeSqliteDb(o.dbPath ?? ':memory:');
  if (!o.db) (db as NodeSqliteDb).db.exec(MIGRATION_SQL);
  const store = o.store ?? (o.storeDir ? new FsStore(o.storeDir) : new MemoryStore());
  const provider: ModelProvider = typeof o.provider === 'object' ? o.provider : o.provider === 'openrouter' ? new OpenRouterProvider(o.config.openRouterBaseUrl) : new StubProvider();
  const identity = new Identity(db, clock, o.secrets);
  const verifier = provider.name === 'stub' ? async () => true : openRouterKeyVerifier(o.config.openRouterBaseUrl);
  const models = new ModelConnections(db, clock, o.secrets, o.config, verifier);
  const artifacts = new Artifacts(db, store, clock);
  const runs = new Runs(db, clock, o.config, artifacts);
  const channels = new Channels(db, clock, runs, models);
  const gateway = new Gateway(db, clock, o.secrets, o.config);
  const feed = new Feed(db, clock, gateway);
  const social = new Social(db, clock, identity, runs, channels, artifacts, feed);
  const states = new VistaStates(db, clock);
  const asker = new Asker(db, feed, models, provider);
  const executor = new RunExecutor({ runs, models, provider, validator: o.validator, clock, log: o.log });
  const runtime = new LocalRuntimeHost({ db, clock, runs, executor, log: o.log, realTimers: o.realTimers });
  const google = o.config.google ? new GoogleOidc(db, clock, o.config.google) : undefined;
  const app = createApp({ config: o.config, db, store, identity, models, channels, runs, feed, social, states, gateway, asker, runtime, google, nodeTokens: o.nodeTokens });
  return { app, db, store, clock, identity, models, channels, runs, feed, social, states, gateway, asker, artifacts, runtime, provider };
}
export type Core = ReturnType<typeof bootstrap>;
