import { Pool } from 'pg';
import { hardenSslMode } from '@/db/connection-string';

/**
 * Veritabaninin tamaminin JSON kopyasi.
 *
 * pg_dump yok; bu yeterli cunku sema gocler tarafindan kuruluyor, yedegin
 * tasimasi gereken tek sey veri. `restoreDump` ayni yapiyi geri yaziyor.
 */
export interface Dump {
  takenAt: string;
  tables: Record<string, unknown[]>;
}

/**
 * Tablolarin bagimlilik sirasi. Geri yuklerken bu sirayla yazilir, silerken
 * tersi kullanilir — yabanci anahtarlar her iki yonde de tutsun.
 *
 * Listede olmayan bir tablo (yeni bir goc eklendiginde) sona alinir; sirasi
 * yanlis olabilir, bu yuzden yeni tablo eklendiginde buraya da yazilmali.
 */
export const TABLE_ORDER = [
  'app_settings',
  'branches',
  'salespeople',
  'categories',
  'stock_items',
  'stock_balances',
  'products',
  'product_components',
  'suppliers',
  'customers',
  'document_counters',
  'exchange_rates',
  'goods_receipts',
  'goods_receipt_lines',
  'orders',
  'order_lines',
  'order_line_components',
  'deliveries',
  'delivery_lines',
  'payments',
  'stock_movements',
] as const;

function orderTables(names: string[]): string[] {
  const known = TABLE_ORDER.filter((name) => names.includes(name));
  const unknown = names.filter((name) => !TABLE_ORDER.includes(name as (typeof TABLE_ORDER)[number]));
  return [...known, ...unknown];
}

export function createPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanimli degil.');
  return new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL), max: 2 });
}

/** Tum tablolari okuyup tek bir JSON nesnesi uretir. */
export async function createDump(pool: Pool): Promise<Dump> {
  const { rows: tables } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );

  const dump: Record<string, unknown[]> = {};
  for (const name of orderTables(tables.map((row) => row.tablename))) {
    // Tablo adlari pg_tables'tan geliyor, kullanicidan degil; yine de
    // tirnakliyoruz ki buyuk harfli ya da ayrilmis adlar patlamasin.
    const { rows } = await pool.query(`select * from "${name}"`);
    dump[name] = rows;
  }

  return { takenAt: new Date().toISOString(), tables: dump };
}

export function dumpSummary(dump: Dump): { table: string; rows: number }[] {
  return Object.entries(dump.tables).map(([table, rows]) => ({ table, rows: rows.length }));
}

/**
 * Yedegi geri yazar. Mevcut veriyi **siler** ve yerine yedektekini koyar;
 * kismi birlestirme yapmaz — yarim geri yukleme, hic geri yuklememekten
 * kotudur.
 *
 * Tek transaction: ortada kalirsa hicbir sey degismez.
 */
export async function restoreDump(pool: Pool, dump: Dump): Promise<{ table: string; rows: number }[]> {
  const names = orderTables(Object.keys(dump.tables));
  const written: { table: string; rows: number }[] = [];

  const client = await pool.connect();
  try {
    await client.query('begin');

    for (const name of [...names].reverse()) {
      await client.query(`delete from "${name}"`);
    }

    for (const name of names) {
      const rows = dump.tables[name] as Record<string, unknown>[];
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const quoted = columns.map((column) => `"${column}"`).join(', ');

      // Satirlar tek tek yaziliyor: dosya birkac bin satir, hiz sorun degil;
      // hata halinde hangi tabloda oldugu belli olsun istiyoruz.
      for (const row of rows) {
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
          `insert into "${name}" (${quoted}) values (${placeholders})`,
          columns.map((column) => row[column] ?? null),
        );
      }
      written.push({ table: name, rows: rows.length });
    }

    // `seq` gibi otomatik artan sutunlar acikca yazildigi icin sayaclari
    // elle ileri aliyoruz; yoksa bir sonraki hareket mevcut bir seq'i alir.
    await client.query(
      `select setval(pg_get_serial_sequence('stock_movements', 'seq'),
                     coalesce((select max(seq) from stock_movements), 1))`,
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return written;
}
