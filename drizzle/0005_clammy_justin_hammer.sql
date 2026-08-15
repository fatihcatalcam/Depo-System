-- Siparis satirinda hediye kutucugu.
--
-- Varsayilan degerli kolon dolu tabloya sorunsuz ekleniyor; kisit da mevcut
-- satirlarda saglaniyor (is_gift = false). Bu yuzden 0004'teki gibi elle
-- duzeltmeye gerek yok.
--
-- Kisit, arayuzde bir yerde unutulsa bile hediye satirin musteriye yansiyan
-- tutarinin sifir kalmasini garanti eder.

ALTER TABLE "order_lines" ADD COLUMN "is_gift" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_gift_total_chk" CHECK (NOT "order_lines"."is_gift" OR "order_lines"."line_total_kurus" = 0);