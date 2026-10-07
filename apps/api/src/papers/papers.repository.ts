import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.module.js';
import type {
  Box,
  ExtractedQuestion,
  Extraction,
  PaperMeta,
  PaperState,
  PaperStatus,
  Question,
  QuestionEdit,
  QuestionImage,
} from './paper.types.js';

export interface SubjectInfo {
  id: number;
  code: string;
  name: string;
  board: string;
  curriculum: string;
  components: { number: number; name: string; style: string }[];
  topics: { code: string; name: string; subtopics?: { code: string; name: string }[] }[];
}

export interface NewPaper {
  slug: string;
  subjectId: number;
  componentId: number | null;
  year: number;
  seasonCode: string;
  paperCode: string;
  variant: number | null;
  componentName: string | null;
  qpFileName: string;
  msFileName: string | null;
  qpPath: string;
  msPath: string | null;
}

/** Everything the app stores in MySQL goes through here. Returns the same shapes the frontend uses. */
@Injectable()
export class PapersRepository {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  // ------------------------------------------------------------------ catalog

  async catalog() {
    const seasons = await this.db('seasons').select('code', 'name').orderBy('sort_order');
    const subjects = await this.db('subjects as s')
      .join('curriculums as c', 'c.id', 's.curriculum_id')
      .join('boards as b', 'b.id', 'c.board_id')
      .select('s.id', 's.code', 's.name', 'c.name as curriculum', 'b.name as board')
      .orderBy(['b.name', 's.code']);
    const components = await this.db('components').select('subject_id', 'number', 'name', 'style').orderBy('number');
    const topics = await this.db('topics')
      .whereNull('parent_id')
      .where('source', 'SYLLABUS')
      .select('subject_id', 'code', 'name')
      .orderBy('sort_order');
    return {
      seasons,
      subjects: subjects.map((s) => ({
        code: s.code,
        name: s.name,
        board: s.board,
        curriculum: s.curriculum,
        components: components.filter((c) => c.subject_id === s.id).map(({ number, name, style }) => ({ number, name, style })),
        topics: topics.filter((t) => t.subject_id === s.id).map(({ code, name }) => ({ code, name })),
      })),
    };
  }

  async findSubject(code: string): Promise<SubjectInfo | null> {
    const s = await this.db('subjects as s')
      .join('curriculums as c', 'c.id', 's.curriculum_id')
      .join('boards as b', 'b.id', 'c.board_id')
      .where('s.code', code)
      .first('s.id', 's.code', 's.name', 'c.name as curriculum', 'b.name as board');
    if (!s) return null;
    const components = await this.db('components').where('subject_id', s.id).select('number', 'name', 'style').orderBy('number');
    const rows = await this.db('topics').where({ subject_id: s.id, source: 'SYLLABUS' }).select('id', 'parent_id', 'code', 'name').orderBy('sort_order');
    // Topics with their syllabus subtopics, so the AI picks from the same list the student filters use.
    const topics = rows
      .filter((t) => t.parent_id == null)
      .map((t) => ({
        code: t.code,
        name: t.name,
        subtopics: rows.filter((st) => st.parent_id === t.id).map(({ code, name }) => ({ code, name })),
      }));
    return { ...s, components, topics };
  }

  /** Subject for an upload: existing one by code, or create board / curriculum / subject from the detected details. */
  async ensureSubject(code: string, name: string, board: string, curriculum: string): Promise<SubjectInfo> {
    const existing = await this.findSubject(code);
    if (existing) return existing;
    await this.db.transaction(async (trx) => {
      const boardCode = board.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 20) || 'OTHER';
      let b = await trx('boards').where({ code: boardCode }).first('id');
      if (!b) [b] = await trx('boards').insert({ code: boardCode, name: board, short_name: board }).then(([id]) => [{ id }]);
      let c = await trx('curriculums').where({ board_id: b.id, name: curriculum }).first('id');
      if (!c) [c] = await trx('curriculums').insert({ board_id: b.id, name: curriculum }).then(([id]) => [{ id }]);
      await trx('subjects').insert({ curriculum_id: c.id, code, name });
    });
    return (await this.findSubject(code))!;
  }

  // ------------------------------------------------------------------ papers

  private paperQuery() {
    return this.db('papers as p')
      .join('subjects as s', 's.id', 'p.subject_id')
      .join('curriculums as c', 'c.id', 's.curriculum_id')
      .join('boards as b', 'b.id', 'c.board_id')
      .join('seasons as se', 'se.code', 'p.season_code')
      .leftJoin('components as co', 'co.id', 'p.component_id')
      .select(
        'p.id as dbId',
        'p.slug',
        'b.name as board',
        'c.name as curriculum',
        's.code as subjectCode',
        's.name as subjectName',
        'p.year',
        'p.season_code as seasonCode',
        'se.name as seasonName',
        'p.paper_code as paperCode',
        'co.number as paperNumber',
        'p.variant',
        'p.component_name as componentName',
        'p.qp_file_name as qpFileName',
        'p.ms_file_name as msFileName',
        'p.status as paperState',
        'p.published_at as publishedAt',
        'p.ai_provider as aiProvider',
        'p.ai_model as aiModel',
        'p.processed_at as processedAt',
        'p.created_at as createdAt',
      );
  }

  private toMeta(r: Record<string, any>): PaperMeta {
    return {
      id: r.slug,
      board: r.board,
      curriculum: r.curriculum,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      year: r.year,
      seasonCode: r.seasonCode,
      seasonName: r.seasonName,
      paperCode: r.paperCode,
      paperNumber: r.paperNumber ?? (Number.parseInt(r.paperCode, 10) || null),
      variant: r.variant,
      componentName: r.componentName,
      qpFileName: r.qpFileName,
      msFileName: r.msFileName,
      paperState: r.paperState,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
    };
  }

  async paperExists(slug: string): Promise<boolean> {
    return !!(await this.db('papers').where({ slug }).first('id'));
  }

  async createPaper(p: NewPaper): Promise<void> {
    await this.db('papers').insert({
      slug: p.slug,
      subject_id: p.subjectId,
      component_id: p.componentId,
      year: p.year,
      season_code: p.seasonCode,
      paper_code: p.paperCode,
      variant: p.variant,
      component_name: p.componentName,
      qp_file_name: p.qpFileName,
      ms_file_name: p.msFileName,
      qp_path: p.qpPath,
      ms_path: p.msPath,
      status: 'UPLOADED',
    });
  }

  async componentId(subjectId: number, number: number | null): Promise<number | null> {
    if (!number) return null;
    return (await this.db('components').where({ subject_id: subjectId, number }).first('id'))?.id ?? null;
  }

  async deletePaper(slug: string): Promise<void> {
    await this.db('papers').where({ slug }).delete();
  }

  async setPaperState(slug: string, state: PaperState, extra: Record<string, unknown> = {}): Promise<void> {
    await this.db('papers').where({ slug }).update({ status: state, ...extra });
  }

  async getMeta(slug: string): Promise<PaperMeta | null> {
    const r = await this.paperQuery().where('p.slug', slug).first();
    return r ? this.toMeta(r) : null;
  }

  async listPapers(): Promise<{ meta: PaperMeta; status: PaperStatus | null; counts: { total: number; verified: number } }[]> {
    const rows = await this.paperQuery().orderBy('p.created_at', 'desc');
    const ids = rows.map((r) => r.dbId);
    const jobs = await this.latestJobs(ids);
    type CountRow = { paper_id: number; total: number | string; verified: number | string };
    const counts: CountRow[] = ids.length
      ? ((await this.db('questions')
          .whereIn('paper_id', ids)
          .whereNull('deleted_at')
          .select('paper_id')
          .count({ total: '*' })
          .sum({ verified: this.db.raw("CASE WHEN status IN ('VERIFIED','PUBLISHED') THEN 1 ELSE 0 END") })
          .groupBy('paper_id')) as unknown as CountRow[])
      : [];
    return rows.map((r) => {
      const c = counts.find((x) => x.paper_id === r.dbId);
      return {
        meta: this.toMeta(r),
        status: jobs.get(r.dbId) ?? null,
        counts: { total: Number(c?.total ?? 0), verified: Number(c?.verified ?? 0) },
      };
    });
  }

  async getPaper(slug: string): Promise<{ meta: PaperMeta; status: PaperStatus | null; extraction: Extraction | null } | null> {
    const r = await this.paperQuery().where('p.slug', slug).first();
    if (!r) return null;
    const status = (await this.latestJobs([r.dbId])).get(r.dbId) ?? null;
    const questions = await this.loadQuestions(this.db('questions as q').where('q.paper_id', r.dbId).whereNull('q.deleted_at'));
    const extraction: Extraction | null =
      r.processedAt || questions.length
        ? {
            paperId: r.slug,
            provider: r.aiProvider ?? 'unknown',
            model: r.aiModel ?? 'unknown',
            generatedAt: r.processedAt ?? r.createdAt,
            questions: questions.map((q) => q.question),
          }
        : null;
    return { meta: this.toMeta(r), status, extraction };
  }

  // ------------------------------------------------------------------ processing jobs

  private async latestJobs(paperIds: number[]): Promise<Map<number, PaperStatus>> {
    const map = new Map<number, PaperStatus>();
    if (!paperIds.length) return map;
    const rows = await this.db('processing_jobs as j')
      .whereIn('j.paper_id', paperIds)
      .whereRaw('j.id = (SELECT MAX(j2.id) FROM processing_jobs j2 WHERE j2.paper_id = j.paper_id)')
      .select('j.*');
    for (const j of rows) {
      map.set(j.paper_id, {
        state: j.state,
        progress: j.progress,
        message: j.message ?? '',
        pagesTotal: j.pages_total,
        pagesDone: j.pages_done,
        questionsFound: j.questions_found,
        error: j.error,
        failedPages: j.failed_pages ?? undefined,
        updatedAt: j.updated_at,
      });
    }
    return map;
  }

  /** Start a new processing job for a paper; returns the job id. */
  async createJob(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const [id] = await this.db('processing_jobs').insert({ paper_id: paper.id, state: 'QUEUED', message: 'Waiting to start…' });
    await this.db('papers').where({ id: paper.id }).update({ status: 'PROCESSING' });
    return id;
  }

  async updateJob(jobId: number, s: Partial<PaperStatus>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (s.state !== undefined) row.state = s.state;
    if (s.progress !== undefined) row.progress = Math.max(0, Math.min(100, Math.round(s.progress)));
    if (s.message !== undefined) row.message = s.message.slice(0, 500);
    if (s.pagesTotal !== undefined) row.pages_total = s.pagesTotal;
    if (s.pagesDone !== undefined) row.pages_done = s.pagesDone;
    if (s.questionsFound !== undefined) row.questions_found = s.questionsFound;
    if (s.error !== undefined) row.error = s.error;
    if (s.failedPages !== undefined) row.failed_pages = JSON.stringify(s.failedPages);
    if (s.state === 'RENDERING') row.started_at = this.db.fn.now();
    if (s.state === 'DONE' || s.state === 'FAILED') row.finished_at = this.db.fn.now();
    if (Object.keys(row).length) await this.db('processing_jobs').where({ id: jobId }).update(row);
  }

  async isProcessing(slug: string): Promise<boolean> {
    const p = await this.db('papers').where({ slug }).first('status');
    return p?.status === 'PROCESSING';
  }

  // ------------------------------------------------------------------ extraction results

  /** Replace a paper's questions with a fresh AI extraction (re-processing discards edits). */
  async saveExtraction(slug: string, provider: string, model: string, questions: ExtractedQuestion[]): Promise<void> {
    await this.db.transaction(async (trx) => {
      const paper = await trx('papers').where({ slug }).first('id', 'subject_id');
      if (!paper) throw new Error(`Paper ${slug} not found`);
      await trx('questions').where({ paper_id: paper.id }).delete();
      const topicCache = new Map<string, number | null>();
      for (const [i, q] of questions.entries()) {
        const topicId = await this.topicId(trx, paper.subject_id, q.topicCode, q.topic, topicCache);
        const [questionId] = await trx('questions').insert({
          paper_id: paper.id,
          subject_id: paper.subject_id,
          number: q.number.slice(0, 30),
          sort_order: i,
          type: q.type,
          marks: q.marks,
          text: q.text,
          options: q.options.length ? JSON.stringify(q.options) : null,
          topic_id: topicId,
          subtopic_id: await this.subtopicId(trx, topicId, q.subtopic ?? ''),
          subtopic_label: q.subtopic?.slice(0, 200) || null,
          difficulty: q.difficulty,
          page: q.page,
          pages: JSON.stringify(q.pages),
          confidence: q.confidence,
          status: 'DRAFT',
        });
        await this.writeChildren(trx, questionId, q.answer, q.images, q.keywords);
      }
      await trx('papers').where({ id: paper.id }).update({ status: 'IN_REVIEW', ai_provider: provider, ai_model: model, processed_at: trx.fn.now(), published_at: null });
    });
  }

  /** Syllabus subtopic under a topic whose name matches the label (case-insensitive), or null. */
  private async subtopicId(trx: Knex, topicId: number | null, label: string): Promise<number | null> {
    if (!topicId || !label.trim()) return null;
    const row = await trx('topics').where({ parent_id: topicId }).whereRaw('LOWER(name) = ?', [label.trim().toLowerCase()]).first('id');
    return row?.id ?? null;
  }

  /** Topic row for an AI/editor topic: syllabus match by code, then by name; otherwise create an AI topic. */
  private async topicId(trx: Knex, subjectId: number, code: string | null, name: string, cache: Map<string, number | null>): Promise<number | null> {
    const key = `${code ?? ''}|${name.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key)!;
    let row = code ? await trx('topics').where({ subject_id: subjectId, code }).whereNull('parent_id').first('id') : undefined;
    if (!row && name.trim()) {
      row = await trx('topics').where({ subject_id: subjectId }).whereNull('parent_id').whereRaw('LOWER(name) = ?', [name.trim().toLowerCase()]).first('id');
    }
    if (!row && name.trim()) {
      const [id] = await trx('topics').insert({ subject_id: subjectId, parent_id: null, code: null, name: name.trim().slice(0, 200), source: 'AI', sort_order: 999 });
      row = { id };
    }
    cache.set(key, row?.id ?? null);
    return row?.id ?? null;
  }

  private async writeChildren(
    trx: Knex,
    questionId: number,
    answer: ExtractedQuestion['answer'],
    images: { path: string | null; page: number; box: Box }[],
    keywords: string[],
  ) {
    if (answer && (answer.correctOption || answer.text?.trim())) {
      await trx('answers').insert({ question_id: questionId, correct_option: answer.correctOption, text: answer.text, source: 'MARK_SCHEME' });
    }
    for (const [k, img] of images.entries()) {
      await trx('question_images').insert({ question_id: questionId, kind: 'QUESTION', source: 'QP', page: img.page, box: JSON.stringify(img.box), file_path: img.path, sort_order: k });
    }
    const unique = [...new Set(keywords.map((k) => k.trim().toLowerCase().slice(0, 80)).filter(Boolean))];
    if (unique.length) await trx('question_keywords').insert(unique.map((keyword) => ({ question_id: questionId, keyword })));
  }

  // ------------------------------------------------------------------ questions (editor)

  /** Question + its paper slug; null if missing or not in that paper. */
  async questionRow(slug: string, questionId: number) {
    return this.db('questions as q')
      .join('papers as p', 'p.id', 'q.paper_id')
      .where({ 'q.id': questionId, 'p.slug': slug })
      .first('q.id', 'q.paper_id', 'q.subject_id', 'q.status', 'q.deleted_at', 'p.status as paperState');
  }

  async updateQuestion(questionId: number, subjectId: number, edit: QuestionEdit, newImages: QuestionImage[] | null, verify: boolean): Promise<void> {
    await this.db.transaction(async (trx) => {
      const row: Record<string, unknown> = {};
      if (edit.type !== undefined) row.type = edit.type;
      if (edit.marks !== undefined) row.marks = edit.marks;
      if (edit.text !== undefined) row.text = edit.text;
      if (edit.options !== undefined) row.options = edit.options.length ? JSON.stringify(edit.options) : null;
      if (edit.difficulty !== undefined) row.difficulty = edit.difficulty;
      if (edit.subtopic !== undefined) row.subtopic_label = edit.subtopic.slice(0, 200) || null;
      if (edit.topicCode !== undefined || edit.topic !== undefined) {
        row.topic_id = await this.topicId(trx, subjectId, edit.topicCode ?? null, edit.topic ?? '', new Map());
      }
      if (edit.subtopic !== undefined || row.topic_id !== undefined) {
        const current = await trx('questions').where({ id: questionId }).first('topic_id', 'subtopic_label');
        const topicId = (row.topic_id as number | null | undefined) ?? current?.topic_id ?? null;
        row.subtopic_id = await this.subtopicId(trx, topicId, edit.subtopic ?? current?.subtopic_label ?? '');
      }
      const contentChanged = Object.keys(edit).length > 0 || newImages !== null;
      if (contentChanged) row.edited_at = trx.fn.now();
      if (verify) {
        // Published papers stay published; otherwise mark verified.
        const current = await trx('questions').where({ id: questionId }).first('status');
        if (current?.status !== 'PUBLISHED') row.status = 'VERIFIED';
        row.verified_at = trx.fn.now();
      }
      if (Object.keys(row).length) await trx('questions').where({ id: questionId }).update(row);

      if (edit.answer !== undefined) {
        await trx('answers').where({ question_id: questionId }).delete();
        if (edit.answer && (edit.answer.correctOption || edit.answer.text?.trim())) {
          await trx('answers').insert({ question_id: questionId, correct_option: edit.answer.correctOption, text: edit.answer.text, source: 'MANUAL' });
        }
      }
      if (newImages) {
        await trx('question_images').where({ question_id: questionId, kind: 'QUESTION' }).delete();
        for (const [k, img] of newImages.entries()) {
          await trx('question_images').insert({ question_id: questionId, kind: 'QUESTION', source: 'QP', page: img.page, box: JSON.stringify(img.box), file_path: img.path, sort_order: k });
        }
      }
      if (edit.keywords !== undefined) {
        await trx('question_keywords').where({ question_id: questionId }).delete();
        const unique = [...new Set(edit.keywords.map((k) => k.trim().toLowerCase().slice(0, 80)).filter(Boolean))];
        if (unique.length) await trx('question_keywords').insert(unique.map((keyword) => ({ question_id: questionId, keyword })));
      }
    });
  }

  async setVerified(questionId: number, verified: boolean): Promise<void> {
    await this.db('questions')
      .where({ id: questionId })
      .whereNot('status', 'PUBLISHED')
      .update(verified ? { status: 'VERIFIED', verified_at: this.db.fn.now() } : { status: 'DRAFT', verified_at: null });
  }

  /** Mark every remaining draft question of a paper as verified. Returns how many changed. */
  async verifyAll(slug: string): Promise<number> {
    const paper = await this.db("papers").where({ slug }).first("id");
    if (!paper) return 0;
    return this.db("questions").where({ paper_id: paper.id, status: "DRAFT" }).whereNull("deleted_at").update({ status: "VERIFIED", verified_at: this.db.fn.now() });
  }

  async setDeleted(questionId: number, deleted: boolean): Promise<void> {
    await this.db('questions').where({ id: questionId }).update({ deleted_at: deleted ? this.db.fn.now() : null });
  }

  /** Publish when every remaining question is verified. Returns the number of questions still to verify. */
  async publish(slug: string): Promise<number> {
    return this.db.transaction(async (trx) => {
      const paper = await trx('papers').where({ slug }).first('id');
      if (!paper) throw new Error(`Paper ${slug} not found`);
      const [{ pending }] = await trx('questions').where({ paper_id: paper.id, status: 'DRAFT' }).whereNull('deleted_at').count({ pending: '*' });
      if (Number(pending) > 0) return Number(pending);
      await trx('questions').where({ paper_id: paper.id }).whereNull('deleted_at').update({ status: 'PUBLISHED' });
      await trx('papers').where({ id: paper.id }).update({ status: 'PUBLISHED', published_at: trx.fn.now() });
      return 0;
    });
  }

  async unpublish(slug: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      const paper = await trx('papers').where({ slug }).first('id');
      if (!paper) throw new Error(`Paper ${slug} not found`);
      await trx('questions').where({ paper_id: paper.id, status: 'PUBLISHED' }).update({ status: 'VERIFIED' });
      await trx('papers').where({ id: paper.id }).update({ status: 'IN_REVIEW', published_at: null });
    });
  }

  async questionById(questionId: number): Promise<Question | null> {
    const [q] = await this.loadQuestions(this.db('questions as q').where('q.id', questionId));
    return q?.question ?? null;
  }

  // ------------------------------------------------------------------ student question bank

  /**
   * Published questions chosen by `pick` (e.g. by id, or by paper + question number), with paper details.
   * Used by the server-side bank (pages of results, similar questions, PDF selection, print).
   */
  async publishedEntries(pick: (qb: Knex.QueryBuilder) => void): Promise<{ meta: PaperMeta; question: Question; order: number; paperId: number }[]> {
    const base = this.db('questions as q')
      .join('papers as pp', 'pp.id', 'q.paper_id')
      .where('pp.status', 'PUBLISHED')
      .whereNull('q.deleted_at')
      .where('q.status', 'PUBLISHED');
    pick(base);
    const loaded = await this.loadQuestions(base);
    if (!loaded.length) return [];
    const papers = await this.paperQuery().whereIn('p.id', [...new Set(loaded.map((l) => l.paperId))]);
    const byId = new Map(papers.map((r) => [r.dbId, this.toMeta(r)]));
    return loaded.map(({ question, paperId, order }) => ({ meta: byId.get(paperId)!, question, order, paperId }));
  }

  // ------------------------------------------------------------------ helpers

  /** Load questions (+ topic, answer, images, keywords) in a few queries. */
  private async loadQuestions(base: Knex.QueryBuilder): Promise<{ question: Question; paperId: number; order: number }[]> {
    const rows: Record<string, any>[] = await base
      .leftJoin('topics as t', 't.id', 'q.topic_id')
      .leftJoin('topics as st', 'st.id', 'q.subtopic_id')
      .leftJoin('answers as a', 'a.question_id', 'q.id')
      .select(
        'q.*',
        't.code as topicCode',
        't.name as topicName',
        'st.code as subtopicCode',
        'st.name as subtopicName',
        'a.correct_option as correctOption',
        'a.text as answerText',
        'a.question_id as hasAnswer',
      )
      .orderBy(['q.paper_id', 'q.sort_order']);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const images = await this.db('question_images').whereIn('question_id', ids).where('kind', 'QUESTION').orderBy(['question_id', 'sort_order']);
    const keywords = await this.db('question_keywords').whereIn('question_id', ids).select('question_id', 'keyword');

    return rows.map((r) => ({
      paperId: r.paper_id,
      order: r.sort_order,
      question: {
        id: String(r.id),
        number: r.number,
        type: r.type,
        marks: r.marks,
        text: r.text,
        options: r.options ?? [],
        topicCode: r.topicCode ?? null,
        topic: r.topicName ?? 'General',
        subtopic: r.subtopicName ?? r.subtopic_label ?? '',
        subtopicCode: r.subtopicCode ?? null,
        // The finer AI wording (e.g. "Drift velocity" under "Charge and current"), used by search.
        subtopicDetail: r.subtopicName && r.subtopic_label && r.subtopic_label !== r.subtopicName ? r.subtopic_label : null,
        difficulty: r.difficulty,
        keywords: keywords.filter((k) => k.question_id === r.id).map((k) => k.keyword),
        page: r.page,
        pages: r.pages ?? [r.page],
        images: images.filter((i) => i.question_id === r.id).map((i) => ({ path: i.file_path, page: i.page, box: i.box })),
        answer: r.hasAnswer ? { correctOption: r.correctOption, text: r.answerText ?? '' } : null,
        confidence: r.confidence ?? 1,
        status: r.status,
        edited: !!r.edited_at,
        similarIds: ((r.similar_ids as number[] | null) ?? []).map(String),
      },
    }));
  }

  async audit(action: string, entity: string, entityId: number | null, data: unknown = null): Promise<void> {
    await this.db('audit_logs').insert({ action, entity, entity_id: entityId, data: data == null ? null : JSON.stringify(data) });
  }

  async paperDbId(slug: string): Promise<number | null> {
    return (await this.db('papers').where({ slug }).first('id'))?.id ?? null;
  }
}
