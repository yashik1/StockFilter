CREATE TABLE "playbooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text DEFAULT 'long' NOT NULL,
	"quantity" double precision NOT NULL,
	"entry_price" double precision NOT NULL,
	"exit_price" double precision,
	"stop_price" double precision,
	"target_price" double precision,
	"fees" double precision DEFAULT 0 NOT NULL,
	"opened_at" text NOT NULL,
	"closed_at" text,
	"playbook_id" integer,
	"followed_rules" boolean,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playbooks_user_name_idx" ON "playbooks" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "playbooks_user_idx" ON "playbooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_user_opened_idx" ON "trades" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "trades_user_symbol_idx" ON "trades" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE INDEX "trades_user_playbook_idx" ON "trades" USING btree ("user_id","playbook_id");
