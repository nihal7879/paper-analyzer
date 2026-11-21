/**
 * Common topics: one list of ideas shared by every board ("Projectile motion", "Moments" …). Each board's own syllabus
 * topics / subtopics are linked to them, so a teacher can pick an idea once and get questions from every board and level.
 * A question belongs to a common topic through its subtopic (or, when it has none linked, its topic).
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.schema.createTable('concepts', (t) => {
    t.charset('utf8mb4');
    t.collate('utf8mb4_unicode_ci');
    t.increments('id').unsigned().primary();
    t.string('name', 120).notNullable().unique();
    // group shown in the filter, e.g. "Mechanics", "Electricity"
    t.string('area', 80).notNullable();
    t.smallint('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
  await knex.schema.createTable('topic_concepts', (t) => {
    t.integer('topic_id').unsigned().notNullable().references('topics.id').onDelete('CASCADE');
    t.integer('concept_id').unsigned().notNullable().references('concepts.id').onDelete('CASCADE');
    t.primary(['topic_id', 'concept_id']);
    t.index(['concept_id']);
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex.schema.dropTableIfExists('topic_concepts');
  await knex.schema.dropTableIfExists('concepts');
}
