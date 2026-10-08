/**
 * Worksheet PDFs show each question exactly as printed: a crop of the WHOLE question part from the paper
 * (text, diagrams, tables, answer lines, marks), stored like diagram crops with kind = 'FULL'.
 * One row per page the part appears on (a part can continue onto the next page).
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  await knex.raw("ALTER TABLE `question_images` MODIFY `kind` ENUM('QUESTION', 'ANSWER', 'FULL') NOT NULL DEFAULT 'QUESTION'");
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  await knex('question_images').where('kind', 'FULL').delete();
  await knex.raw("ALTER TABLE `question_images` MODIFY `kind` ENUM('QUESTION', 'ANSWER') NOT NULL DEFAULT 'QUESTION'");
}
