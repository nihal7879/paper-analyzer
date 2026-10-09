import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.module.js';
import type { PaperMeta, Question } from './paper.types.js';
import { PapersRepository } from './papers.repository.js';

/**
 * Server-side question bank for students: filtering, chained dropdown counts, sorting, search and paging all run
 * in MySQL, so the browser only ever receives one page (20 whole questions) — ready for a very large bank.
 *
 * A "whole question" is one paper question with all its parts: (paper_id, base_number), e.g. 17(a), 17(b)(i)… = 17.
 * Filters match parts; results, counts and paging are whole questions (like the paper).
 */

export interface BankFilters {
  board: string | null;
  level: string | null;
  course: string | null;
  q: string;
  topic: string[];
  sub: string[];
  yearFrom: number | null;
  yearTo: number | null;
  paper: string[];
  season: string[];
  type: string[];
  difficulty: string[];
  marks: string[];
}
export type BankSort = 'newest' | 'oldest' | 'topic';
type Skip = 'board' | 'level' | 'course' | 'topic' | 'year' | 'paper' | 'season' | 'type' | 'difficulty' | 'marks' | 'q';
type Entry = { meta: PaperMeta; question: Question; order: number };
export interface FacetOption {
  value: string;
  label: string;
  count: number;
  board?: string;
  level?: string;
}

const MULTI = ['paper', 'season', 'type', 'difficulty', 'marks'] as const;
const ALL_BUT_CHAIN: Skip[] = ['topic', 'year', 'paper', 'season', 'type', 'difficulty', 'marks', 'q'];
const SUB_SEP = '\u001f';
// Same values the website uses (see web lib/question-bank.ts)
const TOPIC = "COALESCE(t.name, 'General')";
const SUBKEY = `CONCAT(${TOPIC}, CHAR(31), COALESCE(st.name, q.subtopic_label, ''))`;
// CAST(… AS CHAR) gives MySQL's default collation; pin it to the tables' one so values can be combined / compared
const CHAR = (sql: string) => `CAST(${sql} AS CHAR) COLLATE utf8mb4_unicode_ci`;
const PAPER = `COALESCE(${CHAR('co.number')}, IF(p.paper_code REGEXP '^[0-9]+', ${CHAR('CAST(p.paper_code AS UNSIGNED)')}, p.paper_code))`;
const TYPE = "IF(q.type = 'MCQ', 'MCQ', 'WRITTEN')";
const MARKS = CHAR('q.marks');
const WHOLE = 'COUNT(DISTINCT q.paper_id, q.base_number)';
const PAGE_MAX = 50;
const IDS_MAX = 5000;
// InnoDB's built-in full-text stopwords: these (and words under 3 letters) are matched with LIKE instead
const STOPWORDS = new Set(
  'a about an are as at be by com de en for from how i in is it la of on or that the this to was what when where who will with und www'.split(' '),
);

/** LaTeX / Markdown to plain words (same as the website's search): "$R_{\text{min}}$" -> "r min". */
export function plain(s: string): string {
  return s
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^}]*)\}/g, ' $1 ')
    .replace(/\\([a-zA-Z]+)/g, ' $1 ')
    .replace(/[{}$^_\\|*#>`~]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function codeKey(code: string | null | undefined): number[] {
  return (code ?? '').split('.').map((n) => (Number.isFinite(parseFloat(n)) ? parseFloat(n) : 999));
}
function compareCodes(a: string | null | undefined, b: string | null | undefined): number {
  const x = codeKey(a);
  const y = codeKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

@Injectable()
export class BankSearchService implements OnModuleInit {
  private readonly logger = new Logger(BankSearchService.name);
  private cache = new Map<string, { at: number; value: Promise<unknown> }>();
  private static readonly TTL_MS = 60_000;

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly repo: PapersRepository,
  ) {}

  /** Fill search_text for any question that has none yet (new install, imports). Runs in the background. */
  onModuleInit() {
    void this.refreshSearchText({ missingOnly: true }).catch((e) => this.logger.warn(`search text: ${e instanceof Error ? e.message : e}`));
  }

  /** Admin changes: forget cached answers straight away. */
  clearCache() {
    this.cache.clear();
  }

  private cached<T>(key: string, make: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < BankSearchService.TTL_MS) return hit.value as Promise<T>;
    if (this.cache.size > 500) this.cache.clear();
    const value = make();
    this.cache.set(key, { at: Date.now(), value });
    value.catch(() => this.cache.get(key)?.value === value && this.cache.delete(key));
    return value;
  }

  // ------------------------------------------------------------------ search text (kept by the API)

  /** Rebuild questions.search_text: for a paper, some questions, or every question that has none. */
  async refreshSearchText(opts: { paperId?: number; questionIds?: number[]; missingOnly?: boolean }): Promise<number> {
    let done = 0;
    for (let lastId = 0; ; ) {
      const qb = this.db('questions as q')
        .join('papers as p', 'p.id', 'q.paper_id')
        .join('seasons as se', 'se.code', 'p.season_code')
        .leftJoin('topics as t', 't.id', 'q.topic_id')
        .leftJoin('topics as st', 'st.id', 'q.subtopic_id')
        .leftJoin('answers as a', 'a.question_id', 'q.id')
        .where('q.id', '>', lastId)
        .select('q.id', 'q.number', 'q.text', 'q.options', 'q.subtopic_label', 't.name as topic', 'st.name as subtopic', 'a.text as answer', 'p.year', 'se.name as season', 'p.paper_code')
        .orderBy('q.id')
        .limit(500);
      if (opts.paperId) qb.where('q.paper_id', opts.paperId);
      if (opts.questionIds) qb.whereIn('q.id', opts.questionIds.length ? opts.questionIds : [0]);
      if (opts.missingOnly) qb.whereNull('q.search_text');
      const rows: Record<string, any>[] = await qb;
      if (!rows.length) break;
      const keywords: { question_id: number; keyword: string }[] = await this.db('question_keywords').whereIn('question_id', rows.map((r) => r.id)).select('question_id', 'keyword');
      await this.db.transaction(async (trx) => {
        for (const r of rows) {
          const options = ((typeof r.options === 'string' ? JSON.parse(r.options) : r.options) ?? []) as { text: string }[];
          const text = plain(
            [
              r.text,
              ...options.map((o) => o.text),
              r.topic ?? 'General',
              r.subtopic ?? r.subtopic_label ?? '',
              r.subtopic_label ?? '',
              ...keywords.filter((k) => k.question_id === r.id).map((k) => k.keyword),
              r.answer ?? '',
              `${r.year} ${r.season} paper ${r.paper_code} q${r.number}`,
            ].join(' \n '),
          );
          await trx('questions').where('id', r.id).update({ search_text: text });
        }
      });
      done += rows.length;
      lastId = rows[rows.length - 1].id;
    }
    if (done) this.logger.log(`Search text updated for ${done} question${done === 1 ? '' : 's'}`);
    return done;
  }

  // ------------------------------------------------------------------ filters from the URL

  parse(query: Record<string, unknown>): { f: BankFilters; sort: BankSort; offset: number; limit: number } {
    const list = (k: string) => {
      const v = query[k];
      const arr = Array.isArray(v) ? v : v == null ? [] : [v];
      return arr.map(String).map((s) => s.slice(0, 300)).filter(Boolean).slice(0, 200);
    };
    const one = (k: string) => list(k)[0] ?? null;
    const num = (k: string) => {
      const v = Number(one(k));
      return Number.isFinite(v) && one(k) !== null ? v : null;
    };
    const sort = (one('sort') ?? 'newest') as BankSort;
    if (!['newest', 'oldest', 'topic'].includes(sort)) throw new BadRequestException('Unknown sort');
    return {
      f: {
        board: one('board'),
        level: one('level'),
        course: one('course'),
        q: (one('q') ?? '').slice(0, 200),
        topic: list('topic'),
        sub: list('sub'),
        yearFrom: num('yf'),
        yearTo: num('yt'),
        paper: list('paper'),
        season: list('season'),
        type: list('type'),
        difficulty: list('difficulty'),
        marks: list('marks'),
      },
      sort,
      offset: Math.max(0, Math.floor(num('offset') ?? 0)),
      limit: Math.min(PAGE_MAX, Math.max(1, Math.floor(num('limit') ?? 20))),
    };
  }

  // ------------------------------------------------------------------ the filtered set (parts)

  /** Published parts matching the filters (minus the ones in `skip`). */
  private base(f: BankFilters, skip: Skip[] = []): Knex.QueryBuilder {
    const s = new Set(skip);
    const qb = this.db('questions as q')
      .join('papers as p', 'p.id', 'q.paper_id')
      .join('subjects as s', 's.id', 'p.subject_id')
      .join('curriculums as c', 'c.id', 's.curriculum_id')
      .join('boards as b', 'b.id', 'c.board_id')
      .join('seasons as se', 'se.code', 'p.season_code')
      .leftJoin('components as co', 'co.id', 'p.component_id')
      .leftJoin('topics as t', 't.id', 'q.topic_id')
      .leftJoin('topics as st', 'st.id', 'q.subtopic_id')
      .where('p.status', 'PUBLISHED')
      .where('q.status', 'PUBLISHED')
      .whereNull('q.deleted_at');
    if (!s.has('board') && f.board) qb.where('b.name', f.board);
    if (!s.has('level') && f.level) qb.where('c.name', f.level);
    if (!s.has('course') && f.course) qb.where('s.code', f.course);
    // `expr IN (?, ?, …)` for computed values (topic name, subtopic key, paper number, type, marks)
    const inList = (expr: string, values: string[]) => [`${expr} IN (${values.map(() => '?').join(', ')})`, values] as const;
    if (!s.has('topic') && (f.topic.length || f.sub.length))
      qb.where((w) => {
        if (f.topic.length) w.orWhereRaw(...inList(TOPIC, f.topic));
        if (f.sub.length) w.orWhereRaw(...inList(SUBKEY, f.sub));
      });
    if (!s.has('year')) {
      if (f.yearFrom != null) qb.where('p.year', '>=', f.yearFrom);
      if (f.yearTo != null) qb.where('p.year', '<=', f.yearTo);
    }
    if (!s.has('paper') && f.paper.length) qb.whereRaw(...inList(PAPER, f.paper));
    if (!s.has('season') && f.season.length) qb.whereIn('p.season_code', f.season);
    if (!s.has('type') && f.type.length) qb.whereRaw(...inList(TYPE, f.type));
    if (!s.has('difficulty') && f.difficulty.length) qb.whereIn('q.difficulty', f.difficulty);
    if (!s.has('marks') && f.marks.length) qb.whereRaw(...inList(MARKS, f.marks));
    if (!s.has('q')) this.search(qb, f.q);
    return qb;
  }

  /** Every word must appear: full-text (prefix) for normal words, LIKE for short / very common ones. */
  private search(qb: Knex.QueryBuilder, q: string) {
    const words = [...new Set(plain(q).split(' ').filter(Boolean))].slice(0, 12);
    const ft = words.filter((w) => /^[a-z0-9]+$/.test(w) && w.length >= 3 && !STOPWORDS.has(w));
    const like = words.filter((w) => !ft.includes(w));
    if (ft.length) qb.whereRaw('MATCH(q.search_text) AGAINST (? IN BOOLEAN MODE)', [ft.map((w) => `+${w}*`).join(' ')]);
    for (const w of like) qb.where('q.search_text', 'like', `%${w.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }

  // ------------------------------------------------------------------ results (whole questions)

  /** Matching whole questions (paper, number) in the order the list shows them. */
  private orderedGroups(f: BankFilters, sort: BankSort) {
    const groups = this.base(f)
        .clearSelect()
        .select('q.paper_id', 'q.base_number')
        .min({ ord: 'q.sort_order' })
        .max({ yr: 'p.year', se: 'se.sort_order', pc: 'p.paper_code' })
        .select(this.db.raw('MIN(COALESCE(t.sort_order, 9999)) as ts, MIN(COALESCE(st.sort_order, 9999)) as sts'))
        .groupBy('q.paper_id', 'q.base_number');
      if (sort === 'newest') groups.orderBy([{ column: 'yr', order: 'desc' }, { column: 'se', order: 'desc' }, { column: 'pc', order: 'asc' }, { column: 'ord', order: 'asc' }]);
      if (sort === 'oldest') groups.orderBy([{ column: 'yr', order: 'asc' }, { column: 'se', order: 'asc' }, { column: 'pc', order: 'desc' }, { column: 'ord', order: 'asc' }]);
      if (sort === 'topic')
        groups.orderBy([{ column: 'ts', order: 'asc' }, { column: 'sts', order: 'asc' }, { column: 'yr', order: 'desc' }, { column: 'se', order: 'desc' }, { column: 'pc', order: 'asc' }, { column: 'ord', order: 'asc' }]);
    return groups;
  }

  async page(f: BankFilters, sort: BankSort, offset: number, limit: number) {
    return this.cached(`page:${JSON.stringify([f, sort, offset, limit])}`, async () => {
      const groups = this.orderedGroups(f, sort);
      const [counts, pageRows, everything] = await Promise.all([
        this.db.from(this.base(f).clearSelect().select('q.paper_id').groupBy('q.paper_id', 'q.base_number').as('g')).select(this.db.raw('COUNT(*) as total, COUNT(DISTINCT g.paper_id) as papers')).first(),
        groups.clone().limit(limit).offset(offset),
        this.bankSize(),
      ]);
      const pairs: [number, string][] = pageRows.map((r: any) => [r.paper_id, r.base_number]);
      const items = await this.wholeQuestions(f, pairs);
      return { total: Number(counts?.total ?? 0), papers: Number(counts?.papers ?? 0), offset, limit, bankEmpty: everything === 0, items };
    });
  }

  /** Whole questions for (paper, number) pairs, in that order: all parts, which parts match, similar questions. */
  private async wholeQuestions(f: BankFilters, pairs: [number, string][]) {
    if (!pairs.length) return [];
    const [parts, matched] = await Promise.all([
      this.repo.publishedEntries((qb) => qb.whereIn(['q.paper_id', 'q.base_number'], pairs)),
      this.base(f).clearSelect().select('q.id').whereIn(['q.paper_id', 'q.base_number'], pairs),
    ]);
    const matchedIds = new Set(matched.map((r: { id: number }) => String(r.id)));
    const groupOf = (paperId: number, base: string) => `${paperId}|${base}`;
    const byGroup = new Map<string, (Entry & { paperId: number })[]>();
    for (const e of parts) {
      const k = groupOf(e.paperId, baseNumber(e.question.number));
      const list = byGroup.get(k);
      if (list) list.push(e);
      else byGroup.set(k, [e]);
    }

    // Similar questions: round-robin over the parts (each part's best match first), not its own parts, up to 5
    const want = new Map<string, string[]>();
    for (const [k, list] of byGroup) {
      const own = new Set(list.map((e) => e.question.id));
      const lists = list.map((e) => e.question.similarIds);
      const picked: string[] = [];
      for (let r = 0; picked.length < 8 && lists.some((l) => r < l.length); r++)
        for (const l of lists) if (l[r] && !own.has(l[r]) && !picked.includes(l[r])) picked.push(l[r]);
      want.set(k, picked);
    }
    const similarIds = [...new Set([...want.values()].flat())].map(Number);
    const similar = similarIds.length ? await this.repo.publishedEntries((qb) => qb.whereIn('q.id', similarIds)) : [];
    const similarById = new Map(similar.map((e) => [e.question.id, strip(e)]));

    return pairs.flatMap(([paperId, base]) => {
      const list = byGroup.get(groupOf(paperId, base));
      if (!list?.length) return [];
      return [
        {
          key: `${list[0].meta.id}|${base}`,
          parts: list.map(strip),
          matched: list.map((e) => e.question.id).filter((id) => matchedIds.has(id)),
          similar: (want.get(groupOf(paperId, base)) ?? []).map((id) => similarById.get(id)).filter((e): e is Entry => !!e).slice(0, 5),
        },
      ];
    });
  }

  // ------------------------------------------------------------------ dropdown counts (whole questions)

  async facets(f: BankFilters, fix: boolean) {
    return this.cached(`facets:${fix}:${JSON.stringify(f)}`, async () => {
      const fixed = fix ? await this.fixChain(f) : f;
      const g = fixed;
      const count = async (skip: Skip[], value: string, label: string, extra = '') => {
        const rows: any[] = await this.base(g, skip)
          .clearSelect()
          .select(this.db.raw(`${value} as v, MAX(${label}) as l, ${WHOLE} as n${extra ? `, ${extra}` : ''}`))
          .groupByRaw(value);
        return rows.filter((r) => r.v != null && r.v !== '').map((r) => ({ value: String(r.v), label: String(r.l), count: Number(r.n), ...(r.ord != null ? { ord: Number(r.ord) } : {}), ...(r.board ? { board: r.board, level: r.level } : {}) }));
      };
      const withSelected = (opts: FacetOption[], selected: string[], label: (v: string) => string) => {
        for (const v of selected) if (!opts.some((o) => o.value === v)) opts.push({ value: v, label: label(v), count: 0 });
        return opts;
      };
      const byCount = (a: FacetOption, b: FacetOption) => b.count - a.count || a.label.localeCompare(b.label);
      const markLabel = (v: string) => `${v} mark${v === '1' ? '' : 's'}`;

      const [boards, levels, subjects, topicRows, topicCounts, subCounts, bounds, yearCounts, papers, seasons, types, difficulties, marks, total] = await Promise.all([
        // Chain: Board -> Level -> Subject -> Topic, each list depends only on the choices before it
        count(['board', 'level', 'course', 'topic'], 'b.name', 'b.name'),
        count(['level', 'course', 'topic'], 'c.name', 'c.name'),
        count(['course', 'topic'], 's.code', "CONCAT(s.name, ' (', s.code, ')')", 'MAX(b.name) as board, MAX(c.name) as level'),
        this.base(g, ALL_BUT_CHAIN).clearSelect().distinct(this.db.raw(`${TOPIC} as topic, t.code as code, COALESCE(st.name, q.subtopic_label, '') as sub, st.code as subCode`)),
        this.base(g, ['topic']).clearSelect().select(this.db.raw(`${TOPIC} as topic, ${WHOLE} as n`)).groupByRaw(TOPIC),
        this.base(g, ['topic']).clearSelect().select(this.db.raw(`${SUBKEY} as k, ${WHOLE} as n`)).groupByRaw(SUBKEY),
        this.base(g, ALL_BUT_CHAIN).clearSelect().select(this.db.raw('MIN(p.year) as min, MAX(p.year) as max')).first() as Promise<{ min: number | null; max: number | null } | undefined>,
        count(['year'], CHAR('p.year'), CHAR('p.year')),
        count(['paper'], PAPER, `CONCAT('Paper ', ${PAPER}, IF(p.component_name IS NULL OR p.component_name = '', '', CONCAT(' · ', p.component_name)))`),
        count(['season'], 'p.season_code', 'se.name', 'MAX(se.sort_order) as ord'),
        count(['type'], TYPE, `IF(q.type = 'MCQ', 'MCQ', 'Written')`),
        count(['difficulty'], 'q.difficulty', 'q.difficulty'),
        count(['marks'], MARKS, `CONCAT(${MARKS}, IF(q.marks = 1, ' mark', ' marks'))`),
        this.base(g).clearSelect().select(this.db.raw(`${WHOLE} as n`)).first(),
      ]);

      // Topic tree: topics (in the chosen board / level / subject) -> syllabus subtopics, with counts
      const tCount = new Map(topicCounts.map((r: any) => [r.topic, Number(r.n)]));
      const sCount = new Map(subCounts.map((r: any) => [r.k, Number(r.n)]));
      const nodes = new Map<string, { topic: string; code: string | null; subs: Map<string, string | null> }>();
      for (const r of topicRows as any[]) {
        let n = nodes.get(r.topic);
        if (!n) nodes.set(r.topic, (n = { topic: r.topic, code: r.code ?? null, subs: new Map() }));
        if (r.sub && !n.subs.has(r.sub)) n.subs.set(r.sub, r.subCode ?? null);
      }
      const topics = [...nodes.values()]
        .sort((a, b) => compareCodes(a.code, b.code) || a.topic.localeCompare(b.topic))
        .map((n) => ({
          topic: n.topic,
          label: n.code ? `${n.code}. ${n.topic}` : n.topic,
          count: tCount.get(n.topic) ?? 0,
          subs: [...n.subs.entries()]
            .sort(([an, ac], [bn, bc]) => compareCodes(ac, bc) || an.localeCompare(bn))
            .map(([name]) => ({ key: `${n.topic}${SUB_SEP}${name}`, name, count: sCount.get(`${n.topic}${SUB_SEP}${name}`) ?? 0 })),
        }));

      return {
        boards: boards.sort(byCount),
        levels: levels.sort(byCount),
        subjects: subjects.sort(byCount),
        topics,
        yearBounds: bounds?.min != null ? { min: Number(bounds.min), max: Number(bounds.max) } : null,
        yearCounts: Object.fromEntries(yearCounts.map((o) => [o.value, o])),
        papers: withSelected(papers, g.paper, (v) => `Paper ${v}`).sort((a, b) => Number(a.value) - Number(b.value)),
        seasons: withSelected(seasons, g.season, (v) => v).sort((a: any, b: any) => (a.ord ?? 9) - (b.ord ?? 9)),
        types: withSelected(types, g.type, (v) => v).sort((a) => (a.value === 'MCQ' ? -1 : 1)),
        difficulties: withSelected(difficulties, g.difficulty, (v) => v).sort((a, b) => ['EASY', 'MEDIUM', 'HARD'].indexOf(a.value) - ['EASY', 'MEDIUM', 'HARD'].indexOf(b.value)),
        marks: withSelected(marks, g.marks, markLabel).sort((a, b) => Number(a.value) - Number(b.value)),
        total: Number((total as any)?.n ?? 0),
        ...(fix ? { fixed } : {}),
      };
    });
  }

  /** After an earlier choice in the chain changes, drop later choices that no longer exist under it. */
  private async fixChain(f: BankFilters): Promise<BankFilters> {
    const next = { ...f };
    const chainOnly = (x: BankFilters) => this.base(x, ALL_BUT_CHAIN).clearSelect();
    if (next.level && !(await chainOnly({ ...next, course: null }).first(this.db.raw('1 as ok')))) next.level = null;
    if (next.course && !(await chainOnly(next).first(this.db.raw('1 as ok')))) next.course = null;
    const rows: any[] = await chainOnly(next).distinct(this.db.raw(`${TOPIC} as topic, ${SUBKEY} as k, ${PAPER} as paper`));
    const topics = new Set(rows.map((r) => r.topic));
    const subs = new Set(rows.map((r) => r.k));
    const papers = new Set(rows.map((r) => String(r.paper)));
    next.topic = next.topic.filter((t) => topics.has(t));
    next.sub = next.sub.filter((k) => subs.has(k));
    next.paper = next.paper.filter((p) => papers.has(p));
    return next;
  }

  // ------------------------------------------------------------------ select all, entries

  /**
   * Select all: the id of every part that matches the filters (only those parts, e.g. 15(b) but not 15(a) when only
   * (b) matches), capped — in the same order as the list on screen (so the PDF follows what the teacher saw).
   */
  async ids(f: BankFilters, sort: BankSort = 'newest') {
    return this.cached(`ids:${JSON.stringify([f, sort])}`, async () => {
      const order: { paper_id: number; base_number: string }[] = await this.orderedGroups(f, sort);
      const rank = new Map(order.map((g, i) => [`${g.paper_id}|${g.base_number}`, i]));
      const rows: { id: number; paper_id: number; base_number: string; sort_order: number }[] = await this.base(f)
        .clearSelect()
        .distinct('q.id', 'q.paper_id', 'q.base_number', 'q.sort_order');
      rows.sort((a, b) => (rank.get(`${a.paper_id}|${a.base_number}`) ?? 1e9) - (rank.get(`${b.paper_id}|${b.base_number}`) ?? 1e9) || a.sort_order - b.sort_order);
      return { ids: rows.slice(0, IDS_MAX).map((r) => String(r.id)), capped: rows.length > IDS_MAX };
    });
  }

  /** Published questions by id (PDF selection, Similar page) or a whole paper (print). */
  async entries(opts: { ids?: string[]; paper?: string }) {
    if (opts.paper) {
      const slug = opts.paper;
      return (await this.repo.publishedEntries((qb) => qb.where('pp.slug', slug))).map(strip);
    }
    const ids = (opts.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, IDS_MAX);
    if (!ids.length) return [];
    const list = await this.repo.publishedEntries((qb) => qb.whereIn('q.id', ids));
    const byId = new Map(list.map((e) => [Number(e.question.id), strip(e)]));
    return ids.map((id) => byId.get(id)).filter((e): e is Entry => !!e); // in the order asked
  }

  /** How many published parts there are at all (an empty bank shows a different message). */
  private bankSize(): Promise<number> {
    return this.cached('size', async () => Number((await this.base({ board: null, level: null, course: null, q: '', topic: [], sub: [], yearFrom: null, yearTo: null, paper: [], season: [], type: [], difficulty: [], marks: [] }).clearSelect().count({ n: '*' }).first())?.n ?? 0));
  }
}

/** "12(a)(ii)" -> "12" (same as base_number in the database). */
export function baseNumber(n: string): string {
  const s = String(n).trim();
  const b = s.replace(/\s*\(.*$/, '').trim();
  return b || s;
}

/** What the browser gets for one question part (no database ids). */
function strip(e: Entry & { paperId?: number }): Entry {
  return { meta: e.meta, question: e.question, order: e.order };
}
