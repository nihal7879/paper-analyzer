import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { basename } from 'node:path';
import { KNEX } from '../database/database.module.js';
import { StorageService } from '../storage/storage.service.js';

/** One question exactly as stored: its row and its children (answers, keywords, images incl. worksheet crops). */
interface SavedQuestion {
  row: Record<string, unknown>;
  answers: Record<string, unknown>[];
  keywords: string[];
  /** question_images rows; `file_path` is where it lives in the paper, `copy` the backup copy */
  images: (Record<string, unknown> & { copy?: string })[];
}
interface SnapshotData {
  paperStatus: string;
  publishedAt: string | null;
  questions: SavedQuestion[];
}

/** Question-level backups kept per paper (older ones are pruned); whole-paper backups are always kept. */
const KEEP_QUESTION_SNAPSHOTS = 100;

/**
 * Versions of a paper (table paper_versions): automatic backups before risky actions, restorable as a whole
 * paper or one question. Image files are copied to versions/<slug>/<version id>/ so a restore works even after
 * the paper's own folder was cleared (re-process, re-import).
 */
@Injectable()
export class VersionsService {
  private readonly logger = new Logger(VersionsService.name);

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly storage: StorageService,
  ) {}

  /** Back up the whole paper, or one question of it. Returns the version id (null if there is nothing to save). */
  async snapshot(slug: string, label: string, questionId?: number): Promise<number | null> {
    const paper = await this.db('papers').where({ slug }).first('id', 'status', 'published_at');
    if (!paper) return null;
    const q = this.db('questions').where({ paper_id: paper.id });
    if (questionId) q.where({ id: questionId });
    const rows: Record<string, unknown>[] = await q.orderBy('sort_order').select('*');
    if (!rows.length) return null;
    const ids = rows.map((r) => r.id as number);
    const [answers, keywords, images] = await Promise.all([
      this.db('answers').whereIn('question_id', ids).select('*'),
      this.db('question_keywords').whereIn('question_id', ids).select('question_id', 'keyword'),
      this.db('question_images').whereIn('question_id', ids).orderBy(['question_id', 'kind', 'sort_order']).select('*'),
    ]);
    const [versionId] = await this.db('paper_versions').insert({
      slug,
      kind: 'SNAPSHOT',
      question_id: questionId ?? null,
      label: label.slice(0, 200),
      data: '{}',
      parts: rows.length,
    });
    // copy the image files (diagrams, worksheet crops, mark-scheme header rows) next to the backup
    const dir = `versions/${slug}/${versionId}`;
    const copied = new Map<string, string>();
    const copy = async (path: unknown): Promise<string | undefined> => {
      if (typeof path !== 'string' || !path) return undefined;
      if (copied.has(path)) return copied.get(path);
      if (!this.storage.exists(path)) return undefined;
      const to = `${dir}/${basename(path)}`;
      await this.storage.write(to, await this.storage.read(path));
      copied.set(path, to);
      return to;
    };
    const saved: SavedQuestion[] = [];
    for (const row of rows) {
      const imgs = [];
      for (const img of images.filter((i: Record<string, unknown>) => i.question_id === row.id)) {
        const box = typeof img.box === 'string' ? JSON.parse(img.box) : img.box;
        if (box?.head) box.headCopy = await copy(box.head);
        imgs.push({ ...img, box, copy: await copy(img.file_path) });
      }
      saved.push({
        row,
        answers: answers.filter((a: Record<string, unknown>) => a.question_id === row.id),
        keywords: keywords.filter((k: { question_id: number }) => k.question_id === row.id).map((k: { keyword: string }) => k.keyword),
        images: imgs,
      });
    }
    const data: SnapshotData = { paperStatus: paper.status, publishedAt: paper.published_at ? new Date(paper.published_at).toISOString() : null, questions: saved };
    await this.db('paper_versions').where({ id: versionId }).update({ data: JSON.stringify(data) });
    if (questionId) await this.prune(slug);
    return versionId;
  }

  async list(slug: string) {
    return this.db('paper_versions')
      .where({ slug })
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(200)
      .select('id', 'kind', 'question_id as questionId', 'label', 'parts', 'applied', 'created_at as createdAt');
  }

  /** The part numbers saved in a version (to pick one question to restore). */
  async parts(slug: string, versionId: number) {
    const data = await this.load(slug, versionId);
    return data.questions.map((q) => ({ id: q.row.id as number, number: q.row.number as string, deleted: !!q.row.deleted_at }));
  }

  /**
   * Restore a version: the whole paper (its questions are replaced by the saved ones, and its published state comes
   * back), or just one question from it. The current state is backed up first, so a restore can itself be undone.
   */
  async restore(slug: string, versionId: number, questionId?: number): Promise<{ restored: number }> {
    const data = await this.load(slug, versionId);
    const paper = await this.db('papers').where({ slug }).first('id', 'subject_id');
    if (!paper) throw new NotFoundException('Paper not found');
    const chosen = questionId ? data.questions.filter((q) => q.row.id === questionId) : data.questions;
    if (!chosen.length) throw new NotFoundException('That question is not in this version');
    await this.snapshot(slug, questionId ? `Before restoring Q${chosen[0].row.number}` : 'Before restoring an earlier version', questionId);

    // files back to where the rows expect them
    for (const q of chosen) {
      for (const img of q.images) {
        if (img.copy && typeof img.file_path === 'string' && this.storage.exists(img.copy)) await this.storage.write(img.file_path, await this.storage.read(img.copy));
        const box = img.box as { head?: string; headCopy?: string } | null;
        if (box?.head && box.headCopy && this.storage.exists(box.headCopy)) await this.storage.write(box.head, await this.storage.read(box.headCopy));
      }
    }
    await this.db.transaction(async (trx) => {
      if (questionId) await trx('questions').where({ id: questionId }).delete();
      else await trx('questions').where({ paper_id: paper.id }).delete();
      for (const q of chosen) {
        // same id as before, so selections, similar-question lists and links keep working
        const row: Record<string, unknown> = { ...q.row, paper_id: paper.id, subject_id: paper.subject_id };
        delete (row as Record<string, unknown>).base_number; // generated column
        delete (row as Record<string, unknown>).search_text;
        for (const k of ['options', 'pages', 'similar_ids']) if (row[k] && typeof row[k] !== 'string') row[k] = JSON.stringify(row[k]);
        for (const k of ['verified_at', 'edited_at', 'similar_updated_at', 'deleted_at', 'created_at', 'updated_at']) if (row[k]) row[k] = new Date(row[k] as string);
        await trx('questions').insert(row);
        for (const a of q.answers) await trx('answers').insert({ ...a, created_at: a.created_at ? new Date(a.created_at as string) : undefined, updated_at: a.updated_at ? new Date(a.updated_at as string) : undefined });
        if (q.keywords.length) await trx('question_keywords').insert(q.keywords.map((keyword) => ({ question_id: q.row.id, keyword })));
        for (const img of q.images) {
          const { copy: _copy, ...rest } = img;
          const box = { ...(rest.box as Record<string, unknown>) };
          delete box.headCopy;
          await trx('question_images').insert({
            ...rest,
            box: JSON.stringify(box),
            created_at: rest.created_at ? new Date(rest.created_at as string) : undefined,
            updated_at: rest.updated_at ? new Date(rest.updated_at as string) : undefined,
          });
        }
      }
      if (!questionId) {
        await trx('papers').where({ id: paper.id }).update({ status: data.paperStatus, published_at: data.publishedAt ? new Date(data.publishedAt) : null });
      }
    });
    this.logger.log(`${slug}: restored ${questionId ? `question ${questionId}` : 'whole paper'} from version ${versionId}`);
    return { restored: chosen.length };
  }

  private async load(slug: string, versionId: number): Promise<SnapshotData> {
    const v = await this.db('paper_versions').where({ id: versionId, slug, kind: 'SNAPSHOT' }).first('data');
    if (!v) throw new NotFoundException('Version not found');
    return JSON.parse(v.data) as SnapshotData;
  }

  /** Keep the latest question-level backups per paper (whole-paper backups are kept). */
  private async prune(slug: string) {
    const old: { id: number }[] = await this.db('paper_versions')
      .where({ slug, kind: 'SNAPSHOT' })
      .whereNotNull('question_id')
      .orderBy('id', 'desc')
      .offset(KEEP_QUESTION_SNAPSHOTS)
      .select('id');
    for (const { id } of old) {
      await this.db('paper_versions').where({ id }).delete();
      await this.storage.removeDir(`versions/${slug}/${id}`).catch(() => undefined);
    }
  }
}
