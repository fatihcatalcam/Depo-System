import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type * as schema from './schema';

type Schema = typeof schema;
type Relations = ExtractTablesWithRelations<Schema>;

/** Uygulama veya test veritabani — surucuden bagimsiz. */
export type Db = PgDatabase<PgQueryResultHKT, Schema, Relations>;

/** Acik bir transaction. */
export type Tx = PgTransaction<PgQueryResultHKT, Schema, Relations>;

/** Servisler bunu alir: hem dogrudan baglanti hem transaction kabul eder. */
export type DbOrTx = Db | Tx;
