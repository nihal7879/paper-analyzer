/**
 * Year group per topic: KS3 teaches each topic in a given school year (Year 7, 8 or 9), so the "Year group / Grade"
 * filter takes a question's year from its subtopic / topic when set, otherwise from its curriculum's level.
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.alterTable('topics', (t) => {
    t.string('year_group', 40).nullable().after('name');
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.alterTable('topics', (t) => {
    t.dropColumn('year_group');
  });
}
