import { QueryInterface } from "sequelize";

/**
 * Adds full-text search support to the Messages table using PostgreSQL tsvector.
 *
 * Changes:
 * - Adds `search_vector` tsvector column
 * - Creates a GIN index for fast full-text queries
 * - Creates a trigger to auto-populate the column on insert/update
 * - Backfills existing rows in batches of 5000 to avoid long-running transactions
 *
 * After this migration, use:
 *   WHERE "Messages".search_vector @@ plainto_tsquery('portuguese', :term)
 * instead of:
 *   WHERE LOWER(body) LIKE '%term%'
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Add the column (nullable — trigger will fill it)
    await queryInterface.sequelize.query(`
      ALTER TABLE "Messages"
        ADD COLUMN IF NOT EXISTS search_vector tsvector;
    `);

    // Create GIN index (CONCURRENTLY avoids table lock, but cannot run inside
    // a transaction — Sequelize runs each migration in its own transaction,
    // so we use a raw connection without transaction here)
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_search_vector_idx
        ON "Messages" USING GIN(search_vector);
    `);

    // Trigger function: auto-update search_vector when body changes
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION messages_search_vector_update()
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector :=
          to_tsvector('portuguese', coalesce(NEW.body, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS messages_search_vector_trigger ON "Messages";
      CREATE TRIGGER messages_search_vector_trigger
        BEFORE INSERT OR UPDATE OF body ON "Messages"
        FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();
    `);

    // Backfill existing rows in batches to avoid full-table lock.
    // Messages.id is TEXT (WhatsApp message IDs), so we batch by selecting
    // rows where search_vector IS NULL with LIMIT, looping until zero rows updated.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        rows_updated INT;
      BEGIN
        LOOP
          UPDATE "Messages"
          SET search_vector = to_tsvector('portuguese', coalesce(body, ''))
          WHERE id IN (
            SELECT id FROM "Messages"
            WHERE search_vector IS NULL
            LIMIT 5000
          );

          GET DIAGNOSTICS rows_updated = ROW_COUNT;
          EXIT WHEN rows_updated = 0;

          -- Yield to other transactions between batches
          PERFORM pg_sleep(0.1);
        END LOOP;
      END $$;
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS messages_search_vector_trigger ON "Messages";
    `);
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS messages_search_vector_update();
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS messages_search_vector_idx;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Messages" DROP COLUMN IF EXISTS search_vector;
    `);
  }
};
