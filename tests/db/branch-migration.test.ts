import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = 'drizzle';
const BRANCH_MIGRATION = '0004';

async function migrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((name) => name.endsWith('.sql')).sort();
}

async function runFile(client: PGlite, name: string) {
  const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim() === '') continue;
    await client.exec(statement);
  }
}

/**
 * Sube gocu mevcut veriyi tasiyor. Bos bir veritabaninda gocu calistirmak bunu
 * kanitlamaz — tasinacak satir yoktur. Bu yuzden burada once sube oncesi
 * gocler uygulanip gercek veri yaziliyor, sonra sube gocu geliyor.
 *
 * Sema nesneleri artik branch_id icerdigi icin veri ham SQL ile yaziliyor.
 */
describe('0004 sube gocu', () => {
  async function migrateUpToBranches() {
    const client = new PGlite();
    const files = await migrationFiles();
    const branchFile = files.find((name) => name.startsWith(BRANCH_MIGRATION));
    if (!branchFile) throw new Error('Sube gocu bulunamadi.');
    // Yalnizca sube gocunden ONCEKILER. Sonrakiler subeleri varsayiyor;
    // hepsini birden calistirmak gocu sirasindan cikarirdi.
    const before = files.filter((name) => name < branchFile);

    for (const name of before) await runFile(client, name);
    return { client, branchFile };
  }

  it('mevcut musteri, siparis ve mal kabul kayitlarini S1 subesine tasir', async () => {
    const { client, branchFile } = await migrateUpToBranches();

    await client.exec(`
      INSERT INTO customers (code, name) VALUES ('MS-00001', 'Fatih Catalcam');
      INSERT INTO orders (order_no, customer_id, order_date, delivery_address)
        SELECT 'SP-2026-00001', id, '2026-08-01', 'Bir adres' FROM customers;
      INSERT INTO goods_receipts (receipt_no, received_at)
        VALUES ('MK-2026-00001', '2026-08-01');
    `);

    await runFile(client, branchFile);

    const branches = await client.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM branches ORDER BY code`,
    );
    expect(branches.rows.map((row) => row.code)).toEqual(['S1', 'S2']);

    const s1 = branches.rows[0].id;
    for (const table of ['customers', 'orders', 'goods_receipts']) {
      const result = await client.query<{ branch_id: string }>(`SELECT branch_id FROM ${table}`);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].branch_id, `${table} S1'e tasinmali`).toBe(s1);
    }

    await client.close();
  });

  it('subeler parolasiz gelir — yonetici belirleyene kadar giris kapalidir', async () => {
    const { client, branchFile } = await migrateUpToBranches();
    await runFile(client, branchFile);

    const result = await client.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM branches`,
    );
    expect(result.rows.every((row) => row.password_hash === null)).toBe(true);

    await client.close();
  });

  it('subeye ozel sayaclari S1e tasir, ortak sayaclari birakir', async () => {
    const { client, branchFile } = await migrateUpToBranches();

    await client.exec(`
      INSERT INTO document_counters (doc_type, year, last_number) VALUES
        ('order', 2026, 3),
        ('customer', 0, 4),
        ('stockItem', 0, 17),
        ('product', 0, 5);
    `);

    await runFile(client, branchFile);

    const result = await client.query<{
      doc_type: string;
      branch_code: string;
      last_number: number;
    }>(`SELECT doc_type, branch_code, last_number FROM document_counters ORDER BY doc_type`);

    expect(result.rows).toEqual([
      { doc_type: 'customer', branch_code: 'S1', last_number: 4 },
      { doc_type: 'order', branch_code: 'S1', last_number: 3 },
      { doc_type: 'product', branch_code: '', last_number: 5 },
      { doc_type: 'stockItem', branch_code: '', last_number: 17 },
    ]);

    await client.close();
  });

  it('sube kodu birincil anahtara girdigi icin ayni tip iki subede yasayabilir', async () => {
    const { client, branchFile } = await migrateUpToBranches();
    await runFile(client, branchFile);

    await client.exec(`
      INSERT INTO document_counters (doc_type, branch_code, year, last_number) VALUES
        ('order', 'S1', 2026, 7),
        ('order', 'S2', 2026, 2);
    `);

    const result = await client.query<{ count: string }>(
      `SELECT count(*) FROM document_counters WHERE doc_type = 'order'`,
    );
    expect(Number(result.rows[0].count)).toBe(2);

    await client.close();
  });
});
