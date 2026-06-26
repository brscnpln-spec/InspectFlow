/**
 * db-migrate.ts
 * Incremental schema bootstrap for environments that cannot run drizzle-kit migrate
 * (e.g. Replit managed databases without CLI access).
 *
 * Each block is idempotent (CREATE … IF NOT EXISTS / ALTER … ADD COLUMN IF NOT EXISTS),
 * so running it on startup is safe. When migrating to a proper CI pipeline, replace
 * this file with drizzle-kit generate + drizzle-kit migrate.
 */
import { pool } from "./db";

export async function pushSchema(): Promise<void> {
  try {
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'inspection_requests', 'nps_surveys', 'nps_responses', 'inspection_reports')
    `);
    const existingTables = tableCheck.rows.map((r: any) => r.table_name as string);

    if (!existingTables.includes("users")) {
      await pool.query(`
        CREATE TYPE IF NOT EXISTS user_role AS ENUM ('admin', 'service_member');
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role user_role NOT NULL DEFAULT 'service_member',
          assigned_admin_id VARCHAR
        );
      `);
    }

    if (!existingTables.includes("inspection_requests")) {
      await pool.query(`
        CREATE TYPE IF NOT EXISTS inspection_status AS ENUM ('new', 'scheduled', 'closed', 'final_closed', 'canceled');
        CREATE TABLE IF NOT EXISTS inspection_requests (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          company_name TEXT NOT NULL,
          contact_person_1 TEXT NOT NULL,
          contact_person_2 TEXT,
          phone_1 TEXT NOT NULL,
          phone_2 TEXT,
          email_1 TEXT NOT NULL,
          email_2 TEXT,
          notes TEXT,
          status inspection_status NOT NULL DEFAULT 'new',
          assigned_service_member_id VARCHAR,
          assigned_by_admin_id VARCHAR,
          inspection_date TEXT,
          inspection_time TEXT,
          completion_notes TEXT,
          admin_notes TEXT,
          is_emergency BOOLEAN DEFAULT false,
          recurring_days INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }

    if (!existingTables.includes("nps_surveys")) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nps_surveys (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          inspection_id VARCHAR NOT NULL,
          token TEXT NOT NULL UNIQUE,
          sent_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          triggered_by VARCHAR,
          is_manual BOOLEAN DEFAULT false
        );
      `);
    }

    if (!existingTables.includes("nps_responses")) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nps_responses (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          survey_id VARCHAR NOT NULL,
          inspection_id VARCHAR NOT NULL,
          service_member_id VARCHAR NOT NULL,
          report_score INTEGER NOT NULL,
          service_score INTEGER,
          comment TEXT,
          respondent_email TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }

    if (!existingTables.includes("inspection_reports")) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS inspection_reports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          inspection_id VARCHAR NOT NULL,
          uploaded_by_id VARCHAR NOT NULL,
          file_name TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          uploaded_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE assignment_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await pool.query(`
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS assignment_status assignment_status;
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS assignment_expires_at TIMESTAMP;
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS assignment_responded_at TIMESTAMP;
    `);

    await pool.query(`
      UPDATE inspection_requests
      SET assignment_status = 'accepted'
      WHERE assigned_service_member_id IS NOT NULL
        AND assignment_status IS NULL
        AND status IN ('scheduled', 'closed', 'final_closed');
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL,
        klx TEXT NOT NULL DEFAULT '',
        kl_customer_number TEXT NOT NULL DEFAULT '',
        contact_person_1 TEXT NOT NULL,
        phone_1 TEXT NOT NULL,
        email_1 TEXT NOT NULL,
        contact_person_2 TEXT NOT NULL DEFAULT '',
        phone_2 TEXT NOT NULL DEFAULT '',
        email_2 TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS tenant_id VARCHAR;
    `);

    // Drop legacy report_url column — file uploads are handled via inspection_reports table.
    await pool.query(`
      ALTER TABLE inspection_requests DROP COLUMN IF EXISTS report_url;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        target_url TEXT NOT NULL,
        related_inspection_id VARCHAR,
        related_tenant_id VARCHAR,
        is_read BOOLEAN NOT NULL DEFAULT false,
        read_at TIMESTAMP,
        deduplication_key TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Database schema verified successfully");
  } catch (e: any) {
    console.error("Schema verification error:", e.message);
  }
}
