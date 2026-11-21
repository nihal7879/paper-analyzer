/**
 * Import processed papers from local storage (papers/<slug>/paper.json + extraction.json) into the database.
 *
 *   node db/import-storage.mjs              -> import every processed paper
 *   node db/import-storage.mjs 8PH0_s16_01  -> import one paper
 *
 * Re-running replaces that paper's questions (safe to repeat). Subjects / topics that are not in the
 * catalog yet are created automatically (topics marked source = AI so an admin can review them).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import knexFactory from 'knex';
import config from './knexfile.mjs';

const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT ?? 'D:/paper-analyzer-storage');
const PAPERS_DIR = join(STORAGE_ROOT, 'papers');
const knex = knexFactory(config);

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

async function ensureSubject(trx, meta) {
  const existing = await trx('subjects').where({ code: meta.subjectCode }).first();
  if (existing) return existing;

  // Unknown subject: create board / curriculum / subject from the paper details.
  const boardCode = (meta.board || 'OTHER').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 20) || 'OTHER';
  let board = await trx('boards').where({ code: boardCode }).first();
  if (!board) {
    const [id] = await trx('boards').insert({ code: boardCode, name: meta.board || 'Other', short_name: meta.board || 'Other' });
    board = { id };
  }
  let curriculum = await trx('curriculums').where({ board_id: board.id, name: meta.curriculum }).first();
  if (!curriculum) {
    const [id] = await trx('curriculums').insert({ board_id: board.id, name: meta.curriculum || meta.board || 'Other' });
    curriculum = { id };
  }
  const [id] = await trx('subjects').insert({ curriculum_id: curriculum.id, code: meta.subjectCode, name: meta.subjectName });
  console.log(`  + created subject ${meta.subjectCode} ${meta.subjectName}`);
  return trx('subjects').where({ id }).first();
}

/** Match the AI topic to the syllabus list (by code, then name); create an AI topic if nothing matches. */
async function ensureTopic(trx, subjectId, code, name, cache) {
  const key = `${code ?? ''}|${(name ?? '').toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  let topic = code ? await trx('topics').where({ subject_id: subjectId, parent_id: null, code }).first() : null;
  if (!topic && name) topic = await trx('topics').where({ subject_id: subjectId, parent_id: null }).whereRaw('LOWER(name) = ?', [name.toLowerCase()]).first();
  if (!topic && name) {
    const [id] = await trx('topics').insert({ subject_id: subjectId, parent_id: null, code: null, name, source: 'AI', sort_order: 999 });
    topic = { id };
    console.log(`  + created AI topic "${name}" (review in admin)`);
  }
  cache.set(key, topic?.id ?? null);
  return topic?.id ?? null;
}

async function importPaper(slug) {
  const dir = join(PAPERS_DIR, slug);
  const meta = readJson(join(dir, 'paper.json'));
  const extraction = readJson(join(dir, 'extraction.json'));
  const status = readJson(join(dir, 'status.json'));
  if (!meta || !extraction) {
    console.log(`- ${slug}: skipped (not processed yet)`);
    return;
  }

  await knex.transaction(async (trx) => {
    const subject = await ensureSubject(trx, meta);
    const component = meta.paperNumber ? await trx('components').where({ subject_id: subject.id, number: meta.paperNumber }).first() : null;

    const paperRow = {
      slug,
      subject_id: subject.id,
      component_id: component?.id ?? null,
      year: meta.year,
      season_code: meta.seasonCode,
      paper_code: meta.paperCode,
      variant: meta.variant,
      component_name: meta.componentName,
      qp_file_name: meta.qpFileName,
      ms_file_name: meta.msFileName,
      qp_path: `papers/${slug}/qp.pdf`,
      ms_path: meta.msFileName ? `papers/${slug}/ms.pdf` : null,
      status: 'IN_REVIEW',
      ai_provider: extraction.provider,
      ai_model: extraction.model,
      processed_at: (extraction.generatedAt ?? '').replace('T', ' ').slice(0, 19) || null,
    };
    await trx('papers').insert(paperRow).onConflict('slug').merge();
    const paper = await trx('papers').where({ slug }).first();

    // Replace questions (cascades to answers / images / keywords / embeddings).
    await trx('questions').where({ paper_id: paper.id }).delete();

    const topicCache = new Map();
    let n = 0;
    for (const [i, q] of extraction.questions.entries()) {
      const topicId = await ensureTopic(trx, subject.id, q.topicCode, q.topic, topicCache);
      const [questionId] = await trx('questions').insert({
        paper_id: paper.id,
        subject_id: subject.id,
        number: q.number,
        sort_order: i,
        type: q.type,
        marks: q.marks,
        text: q.text,
        options: q.options?.length ? JSON.stringify(q.options) : null,
        topic_id: topicId,
        subtopic_label: q.subtopic || null,
        difficulty: q.difficulty,
        page: q.page,
        pages: JSON.stringify(q.pages ?? [q.page]),
        confidence: q.confidence,
        status: 'DRAFT',
      });

      if (q.answer) {
        await trx('answers').insert({ question_id: questionId, correct_option: q.answer.correctOption, text: q.answer.text, source: 'MARK_SCHEME' });
      }
      for (const [k, img] of (q.images ?? []).entries()) {
        await trx('question_images').insert({
          question_id: questionId,
          kind: 'QUESTION',
          source: 'QP',
          page: img.page,
          box: JSON.stringify(img.box),
          file_path: img.path,
          sort_order: k,
        });
      }
      const keywords = [...new Set((q.keywords ?? []).map((k) => k.trim().toLowerCase().slice(0, 80)).filter(Boolean))];
      if (keywords.length) await trx('question_keywords').insert(keywords.map((keyword) => ({ question_id: questionId, keyword })));
      n++;
    }

    await trx('processing_jobs').insert({
      paper_id: paper.id,
      state: status?.state === 'FAILED' ? 'FAILED' : 'DONE',
      progress: status?.progress ?? 100,
      message: status?.message ?? 'Imported from storage',
      pages_total: status?.pagesTotal ?? 0,
      pages_done: status?.pagesDone ?? 0,
      questions_found: n,
      failed_pages: status?.failedPages ? JSON.stringify(status.failedPages) : null,
      error: status?.error ?? null,
      finished_at: knex.fn.now(),
    });
    await trx('audit_logs').insert({ action: 'PAPER_IMPORTED', entity: 'paper', entity_id: paper.id, data: JSON.stringify({ slug, questions: n }) });
    console.log(`✓ ${slug}: ${n} questions imported`);
  });
}

try {
  const only = process.argv[2];
  const slugs = only ? [only] : existsSync(PAPERS_DIR) ? readdirSync(PAPERS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  if (!slugs.length) console.log(`No papers found in ${PAPERS_DIR}`);
  for (const slug of slugs) await importPaper(slug);
} finally {
  await knex.destroy();
}
