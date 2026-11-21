/**
 * Soft delete for questions: "Delete" in the editor hides a question and "Undo" brings it back.
 * Deleted questions are excluded everywhere (lists, publish checks, student pages).
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('questions', (t) => {
    t.timestamp('deleted_at').nullable().after('similar_updated_at');
    t.index(['paper_id', 'deleted_at']);
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.alterTable('questions', (t) => {
    t.dropIndex(['paper_id', 'deleted_at']);
    t.dropColumn('deleted_at');
  });
}
