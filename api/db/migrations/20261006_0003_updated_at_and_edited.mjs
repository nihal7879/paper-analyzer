/**
 * 1. updated_at refreshes automatically on every UPDATE (Knex timestamps() only sets the default).
 * 2. questions.edited_at: set when an admin changes the content (shows the "Edited" badge);
 *    verifying / publishing does not count as an edit.
 */

const TABLES = [
  'boards',
  'curriculums',
  'subjects',
  'components',
  'topics',
  'users',
  'papers',
  'processing_jobs',
  'questions',
  'answers',
  'question_images',
  'question_embeddings',
];

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  for (const table of TABLES) {
    await knex.raw(
      `ALTER TABLE \`${table}\` MODIFY \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
  }
  await knex.schema.alterTable('questions', (t) => {
    t.timestamp('edited_at').nullable().after('verified_at');
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.alterTable('questions', (t) => t.dropColumn('edited_at'));
  for (const table of TABLES) {
    await knex.raw(`ALTER TABLE \`${table}\` MODIFY \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  }
}
