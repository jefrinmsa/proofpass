-- Run after schema.sql on the separate Supabase database.
-- Only trusted server-side PostgreSQL connections can access these records.
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['applications','challenges','assertion_redemptions','sessions','student_enrollments','student_email_challenges','student_credentials'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',t,r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
