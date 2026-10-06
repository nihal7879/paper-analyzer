import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { KNEX } from '../database/database.module.js';
import {
  bufferToVector,
  dot,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_NAME,
  EmbeddingService,
  embeddingText,
  vectorToBuffer,
} from './embedding.service.js';

const SIMILAR_COUNT = 10;
/** Small bonus so equally close questions from the same syllabus topic rank first. */
const SAME_TOPIC_BONUS = 0.03;

/**
 * Similar questions with MySQL: vectors are stored in question_embeddings (BLOB), the backend compares them
 * and saves the best matches in questions.similar_ids. Students only read the saved list (instant).
 */
@Injectable()
export class SimilarityService {
  private readonly logger = new Logger(SimilarityService.name);

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly embeddings: EmbeddingService,
  ) {}

  /** Embed new / changed questions of a subject, then recompute every question's similar list in that subject. */
  async refreshSubject(subjectId: number): Promise<{ embedded: number; questions: number }> {
    const rows: { id: number; paper_id: number; topic_id: number | null; text: string; options: { label: string; text: string }[] | null; subtopic_label: string | null; topic: string | null }[] =
      await this.db('questions as q')
        .leftJoin('topics as t', 't.id', 'q.topic_id')
        .where('q.subject_id', subjectId)
        .whereNull('q.deleted_at')
        .select('q.id', 'q.paper_id', 'q.topic_id', 'q.text', 'q.options', 'q.subtopic_label', 't.name as topic');
    if (!rows.length) return { embedded: 0, questions: 0 };

    // 1. Embed only questions whose text changed (or that have no vector yet)
    const existing = new Map<number, { text_hash: string; model: string }>(
      (await this.db('question_embeddings').whereIn('question_id', rows.map((r) => r.id)).select('question_id', 'text_hash', 'model')).map((e) => [e.question_id, e]),
    );
    const todo = rows
      .map((r) => {
        const text = embeddingText({ topic: r.topic, subtopic: r.subtopic_label, text: r.text, options: r.options });
        return { id: r.id, text, hash: createHash('sha256').update(text).digest('hex') };
      })
      .filter((r) => {
        const e = existing.get(r.id);
        return !e || e.text_hash !== r.hash || e.model !== EMBEDDING_MODEL_NAME;
      });
    if (todo.length) {
      const t0 = Date.now();
      const vectors = await this.embeddings.embed(todo.map((t) => t.text));
      await this.db('question_embeddings')
        .insert(
          todo.map((t, i) => ({
            question_id: t.id,
            model: EMBEDDING_MODEL_NAME,
            dimensions: EMBEDDING_DIMENSIONS,
            embedding: vectorToBuffer(vectors[i]),
            text_hash: t.hash,
          })),
        )
        .onConflict('question_id')
        .merge(['model', 'dimensions', 'embedding', 'text_hash']);
      this.logger.log(`Embedded ${todo.length} questions in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }

    // 2. Compare every question with every other (other papers only) in memory
    const vecRows = await this.db('question_embeddings').whereIn('question_id', rows.map((r) => r.id)).where('model', EMBEDDING_MODEL_NAME).select('question_id', 'embedding');
    const vectors = new Map<number, Float32Array>(vecRows.map((v) => [v.question_id, bufferToVector(v.embedding)]));
    const items = rows.filter((r) => vectors.has(r.id));
    const updates: { id: number; similar: number[] }[] = [];
    for (const q of items) {
      const qv = vectors.get(q.id)!;
      const scored: { id: number; score: number }[] = [];
      for (const other of items) {
        if (other.paper_id === q.paper_id) continue; // show questions from OTHER papers
        const score = dot(qv, vectors.get(other.id)!) + (q.topic_id && q.topic_id === other.topic_id ? SAME_TOPIC_BONUS : 0);
        scored.push({ id: other.id, score });
      }
      scored.sort((a, b) => b.score - a.score);
      updates.push({ id: q.id, similar: scored.slice(0, SIMILAR_COUNT).map((s) => s.id) });
    }
    await this.db.transaction(async (trx) => {
      for (const u of updates) {
        await trx('questions').where({ id: u.id }).update({ similar_ids: JSON.stringify(u.similar), similar_updated_at: trx.fn.now() });
      }
    });
    return { embedded: todo.length, questions: items.length };
  }

  /** Refresh every subject that has questions. */
  async refreshAll(): Promise<{ subjectId: number; embedded: number; questions: number }[]> {
    const subjects = await this.db('questions').whereNull('deleted_at').distinct('subject_id');
    const results = [];
    for (const { subject_id } of subjects) results.push({ subjectId: subject_id, ...(await this.refreshSubject(subject_id)) });
    return results;
  }
}
