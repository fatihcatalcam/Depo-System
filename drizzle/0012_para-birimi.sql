CREATE TYPE "public"."currency" AS ENUM('TRY', 'USD', 'EUR');--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"date" date NOT NULL,
	"currency" "currency" NOT NULL,
	"rate" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_date_currency_pk" PRIMARY KEY("date","currency"),
	CONSTRAINT "exchange_rates_rate_chk" CHECK ("exchange_rates"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" "currency" DEFAULT 'TRY' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "exchange_rate" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_currency_rate_chk" CHECK (("orders"."currency"::text <> 'TRY' OR "orders"."exchange_rate" = 10000) AND "orders"."exchange_rate" > 0);