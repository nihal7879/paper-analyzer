/**
 * Core schema for the Paper Analyzer (MySQL 8+ / MariaDB 10.6+, InnoDB, utf8mb4).
 *
 *   boards -> curriculums -> subjects -> components (paper types) / topics (syllabus tree)
 *   papers -> questions -> answers, question_images, question_keywords, question_embeddings
 *   users, audit_logs
 *
 * Similar questions: vectors live in question_embeddings.embedding (BLOB, float32);
 * the backend compares them and saves the result in questions.similar_ids (JSON).
 */

/** @param {import('knex').Knex} knex */
export async function up(knex) {
  const utf8 = (t) => {
    t.engine('InnoDB');
    t.charset('utf8mb4');
    t.collate('utf8mb4_unicode_ci');
  };

  // ---------------------------------------------------------------- catalog
  await knex.schema.createTable('boards', (t) => {
    utf8(t);
    t.increments('id');
    t.string('code', 20).notNullable().unique().comment('CIE, EDEXCEL, AQA, OCR, IB, CBSE, MOE');
    t.string('name', 120).notNullable().comment('Cambridge International, Pearson Edexcel');
    t.string('short_name', 40).notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('curriculums', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('board_id').unsigned().notNullable().references('boards.id').onDelete('RESTRICT');
    t.string('name', 120).notNullable().comment('CIE AS & A Level, Edexcel AS Level');
    t.string('level', 60).nullable().comment('AS, A Level, IGCSE, Grade 10 ...');
    t.smallint('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(['board_id', 'name']);
  });

  await knex.schema.createTable('subjects', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('curriculum_id').unsigned().notNullable().references('curriculums.id').onDelete('RESTRICT');
    t.string('code', 20).notNullable().comment('9702, 8PH0, WPH11');
    t.string('name', 120).notNullable().comment('Physics');
    t.timestamps(true, true);
    t.unique(['curriculum_id', 'code']);
    t.index(['code']);
  });

  await knex.schema.createTable('components', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('subject_id').unsigned().notNullable().references('subjects.id').onDelete('CASCADE');
    t.smallint('number').notNullable().comment('Paper number: 1, 2, 3 ...');
    t.string('name', 160).notNullable().comment('Multiple Choice, Core Physics I');
    t.enu('style', ['MCQ', 'THEORY', 'PRACTICAL', 'MIXED']).notNullable().defaultTo('MIXED');
    t.smallint('total_marks').nullable();
    t.smallint('duration_min').nullable();
    t.timestamps(true, true);
    t.unique(['subject_id', 'number']);
  });

  await knex.schema.createTable('topics', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('subject_id').unsigned().notNullable().references('subjects.id').onDelete('CASCADE');
    t.integer('parent_id').unsigned().nullable().references('topics.id').onDelete('CASCADE').comment('NULL = topic, else subtopic');
    t.string('code', 20).nullable().comment('Syllabus number, e.g. 3 or 3.2');
    t.string('name', 200).notNullable();
    t.enu('source', ['SYLLABUS', 'AI', 'MANUAL']).notNullable().defaultTo('SYLLABUS').comment('AI = created from extraction, needs review');
    t.smallint('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(['subject_id', 'parent_id', 'name']);
    t.index(['subject_id', 'code']);
  });

  await knex.schema.createTable('seasons', (t) => {
    utf8(t);
    t.string('code', 1).primary().comment('j, m, s, w');
    t.string('name', 40).notNullable().comment('January, Feb/March, May/June, Oct/Nov');
    t.smallint('sort_order').notNullable();
  });

  // ---------------------------------------------------------------- users
  await knex.schema.createTable('users', (t) => {
    utf8(t);
    t.increments('id');
    t.string('name', 120).notNullable();
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 255).nullable();
    t.enu('role', ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']).notNullable().defaultTo('STUDENT');
    t.enu('status', ['ACTIVE', 'INVITED', 'DISABLED']).notNullable().defaultTo('ACTIVE');
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);
  });

  // ---------------------------------------------------------------- papers
  await knex.schema.createTable('papers', (t) => {
    utf8(t);
    t.increments('id');
    t.string('slug', 60).notNullable().unique().comment('8PH0_s16_01 - also the storage folder name');
    t.integer('subject_id').unsigned().notNullable().references('subjects.id').onDelete('RESTRICT');
    t.integer('component_id').unsigned().nullable().references('components.id').onDelete('SET NULL');
    t.smallint('year').notNullable();
    t.string('season_code', 1).notNullable().references('seasons.code');
    t.string('paper_code', 10).notNullable().comment('As printed: 11, 01');
    t.tinyint('variant').nullable().comment('Cambridge variant digit');
    t.string('component_name', 160).nullable().comment('Paper title printed on the cover');

    t.string('qp_file_name', 255).notNullable().comment('Original file name');
    t.string('ms_file_name', 255).nullable();
    t.string('qp_path', 255).notNullable().comment('Storage key, e.g. papers/8PH0_s16_01/qp.pdf');
    t.string('ms_path', 255).nullable();
    t.smallint('qp_page_count').nullable();
    t.smallint('ms_page_count').nullable();

    t.enu('status', ['UPLOADED', 'PROCESSING', 'IN_REVIEW', 'PUBLISHED', 'FAILED', 'ARCHIVED']).notNullable().defaultTo('UPLOADED');
    t.string('ai_provider', 40).nullable();
    t.string('ai_model', 80).nullable();
    t.timestamp('processed_at').nullable();
    t.timestamp('published_at').nullable();
    t.integer('published_by').unsigned().nullable().references('users.id').onDelete('SET NULL');
    t.integer('created_by').unsigned().nullable().references('users.id').onDelete('SET NULL');
    t.timestamps(true, true);

    t.unique(['subject_id', 'year', 'season_code', 'paper_code']);
    t.index(['status']);
    t.index(['subject_id', 'status', 'year']);
  });

  await knex.schema.createTable('processing_jobs', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('paper_id').unsigned().notNullable().references('papers.id').onDelete('CASCADE');
    t.enu('state', ['QUEUED', 'RENDERING', 'EXTRACTING', 'MARK_SCHEME', 'DONE', 'FAILED']).notNullable().defaultTo('QUEUED');
    t.tinyint('progress').unsigned().notNullable().defaultTo(0);
    t.string('message', 500).nullable();
    t.smallint('pages_total').notNullable().defaultTo(0);
    t.smallint('pages_done').notNullable().defaultTo(0);
    t.smallint('questions_found').notNullable().defaultTo(0);
    t.json('failed_pages').nullable().comment('{ qp: [5, 9], ms: [3] }');
    t.text('error').nullable();
    t.timestamp('started_at').nullable();
    t.timestamp('finished_at').nullable();
    t.timestamps(true, true);
    t.index(['paper_id', 'created_at']);
  });

  // ---------------------------------------------------------------- questions
  await knex.schema.createTable('questions', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('paper_id').unsigned().notNullable().references('papers.id').onDelete('CASCADE');
    t.integer('subject_id').unsigned().notNullable().references('subjects.id').comment('Copied from paper for fast filtering');
    t.string('number', 30).notNullable().comment('As printed: 1, 3(b)(ii)');
    t.smallint('sort_order').notNullable().defaultTo(0);
    t.enu('type', ['MCQ', 'THEORY', 'STRUCTURED']).notNullable();
    t.smallint('marks').nullable();
    t.specificType('text', 'MEDIUMTEXT').notNullable().comment('Markdown + LaTeX ($...$)');
    t.json('options').nullable().comment('MCQ: [{label:"A", text:"..."}]');
    t.integer('topic_id').unsigned().nullable().references('topics.id').onDelete('SET NULL');
    t.integer('subtopic_id').unsigned().nullable().references('topics.id').onDelete('SET NULL');
    t.string('subtopic_label', 200).nullable().comment('AI subtopic text when no subtopic row matches');
    t.enu('difficulty', ['EASY', 'MEDIUM', 'HARD']).notNullable().defaultTo('MEDIUM');
    t.smallint('page').notNullable().comment('First page in the question paper');
    t.json('pages').nullable().comment('All pages, e.g. [7, 8]');
    t.decimal('confidence', 3, 2).nullable().comment('AI confidence 0..1');
    t.enu('status', ['DRAFT', 'VERIFIED', 'PUBLISHED']).notNullable().defaultTo('DRAFT');
    t.integer('verified_by').unsigned().nullable().references('users.id').onDelete('SET NULL');
    t.timestamp('verified_at').nullable();
    t.json('similar_ids').nullable().comment('Pre-computed similar question ids, best first');
    t.timestamp('similar_updated_at').nullable();
    t.timestamps(true, true);

    t.unique(['paper_id', 'number']);
    t.index(['subject_id', 'status']);
    t.index(['topic_id', 'status']);
    t.index(['difficulty']);
  });
  await knex.raw('ALTER TABLE questions ADD FULLTEXT INDEX ft_questions_text (text)');

  await knex.schema.createTable('answers', (t) => {
    utf8(t);
    t.integer('question_id').unsigned().primary().references('questions.id').onDelete('CASCADE');
    t.string('correct_option', 2).nullable().comment('MCQ letter');
    t.specificType('text', 'MEDIUMTEXT').nullable().comment('Mark scheme points, Markdown + LaTeX');
    t.enu('source', ['MARK_SCHEME', 'MANUAL']).notNullable().defaultTo('MARK_SCHEME');
    t.timestamps(true, true);
  });
  await knex.raw('ALTER TABLE answers ADD FULLTEXT INDEX ft_answers_text (text)');

  await knex.schema.createTable('question_images', (t) => {
    utf8(t);
    t.increments('id');
    t.integer('question_id').unsigned().notNullable().references('questions.id').onDelete('CASCADE');
    t.enu('kind', ['QUESTION', 'ANSWER']).notNullable().defaultTo('QUESTION');
    t.enu('source', ['QP', 'MS']).notNullable().defaultTo('QP').comment('Which PDF the crop comes from');
    t.smallint('page').notNullable();
    t.json('box').notNullable().comment('{x0,y0,x1,y1} as 0..1 fractions of the page');
    t.string('file_path', 255).nullable().comment('Cropped WebP storage key; NULL = crop on the fly');
    t.smallint('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(['question_id', 'kind', 'sort_order']);
  });

  await knex.schema.createTable('question_keywords', (t) => {
    utf8(t);
    t.integer('question_id').unsigned().notNullable().references('questions.id').onDelete('CASCADE');
    t.string('keyword', 80).notNullable();
    t.primary(['question_id', 'keyword']);
    t.index(['keyword']);
  });

  await knex.schema.createTable('question_embeddings', (t) => {
    utf8(t);
    t.integer('question_id').unsigned().primary().references('questions.id').onDelete('CASCADE');
    t.string('model', 80).notNullable().comment('e.g. bge-small-en-v1.5 - vectors from different models are not comparable');
    t.smallint('dimensions').notNullable().comment('e.g. 384');
    t.binary('embedding').notNullable().comment('float32 little-endian, dimensions x 4 bytes');
    t.string('text_hash', 64).notNullable().comment('sha256 of the embedded text - re-embed only when it changes');
    t.timestamps(true, true);
    t.index(['model']);
  });

  // ---------------------------------------------------------------- audit
  await knex.schema.createTable('audit_logs', (t) => {
    utf8(t);
    t.bigIncrements('id');
    t.integer('user_id').unsigned().nullable().references('users.id').onDelete('SET NULL');
    t.string('action', 60).notNullable().comment('PAPER_UPLOADED, QUESTION_EDITED, PAPER_PUBLISHED ...');
    t.string('entity', 40).notNullable().comment('paper, question ...');
    t.integer('entity_id').unsigned().nullable();
    t.json('data').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['entity', 'entity_id']);
    t.index(['created_at']);
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  for (const table of [
    'audit_logs',
    'question_embeddings',
    'question_keywords',
    'question_images',
    'answers',
    'questions',
    'processing_jobs',
    'papers',
    'users',
    'seasons',
    'topics',
    'components',
    'subjects',
    'curriculums',
    'boards',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}
