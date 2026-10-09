/**
 * Versions of a paper: a full copy of its questions (text, answers, keywords, images and worksheet crops) taken
 * automatically before risky actions (re-process, re-cut crops, import, delete, edits), so the admin can restore
 * the whole paper or one question. A re-process also stores the AI's new reading here as a DRAFT, to compare and
 * accept part by part instead of overwriting the live paper. Image files are copied to versions/<slug>/<id>/.
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.createTable('paper_versions', (t) => {
    t.increments('id').unsigned().primary();
    // the paper's code (slug), not its row id: backups must survive the paper being deleted and re-imported
    t.string('slug', 64).notNullable();
    // SNAPSHOT = a backup of the live paper; DRAFT = a new AI reading waiting to be compared / applied
    t.enu('kind', ['SNAPSHOT', 'DRAFT']).notNullable().defaultTo('SNAPSHOT');
    // whole paper, or just one question (before an edit / delete)
    t.integer('question_id').unsigned().nullable();
    t.string('label', 200).notNullable();
    t.specificType('data', 'LONGTEXT').notNullable();
    t.integer('parts').unsigned().notNullable().defaultTo(0);
    t.boolean('applied').notNullable().defaultTo(false);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['slug', 'created_at']);
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('paper_versions');
}
