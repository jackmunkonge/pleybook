ALTER TABLE "playbook_rules" DROP CONSTRAINT "playbook_rules_rule_key_unique";--> statement-breakpoint
ALTER TABLE "findings" DROP CONSTRAINT "findings_playbook_rule_id_playbook_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_playbook_rule_id_playbook_rules_id_fk" FOREIGN KEY ("playbook_rule_id") REFERENCES "public"."playbook_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_rules" ADD CONSTRAINT "playbook_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_rules_default_key" ON "playbook_rules" USING btree ("rule_key") WHERE "playbook_rules"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_rules_user_key" ON "playbook_rules" USING btree ("user_id","rule_key") WHERE "playbook_rules"."user_id" is not null;