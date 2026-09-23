CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE adoption ADD CONSTRAINT adoption_no_overlap
  EXCLUDE USING gist (bench_id WITH =, daterange(starts_on, ends_on, '[)') WITH &&)
  WHERE (cancelled_on IS NULL);
