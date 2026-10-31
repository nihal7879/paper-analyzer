import { vi } from 'vitest';
vi.mock('./pdf-images.js', () => ({ renderPdfPages: vi.fn(async () => [Buffer.from('image')]), cropToWebp: vi.fn(), normaliseBox: vi.fn(), pageTexts: vi.fn() }));
import { ProcessingService } from './processing.service.js';
import { QuestionCropsService } from './question-crops.service.js';
import type { LocalExtraction } from '../papers/local-extraction.js';
const data = { paper: { subjectCode: '8PH0' }, questions: [{ number: '1', type: 'STRUCTURED', marks: 2, text: 'Question', options: [], page: 1, diagrams: [], answer: { correctOption: null, text: 'Answer' }, keywords: [], subtopic: '', difficulty: 'MEDIUM', confidence: 0.8 }] } as unknown as LocalExtraction;
describe('local processing isolation', () => {
  function setup(fail = false) {
    const ai = new Proxy({}, { get() { throw new Error('AI MUST NOT BE ACCESSED'); } });
    const repo = { updateJob: vi.fn(), findSubject: vi.fn(async () => ({ topics: [] })), saveExtraction: vi.fn(), setPaperState: vi.fn() };
    const crops = { buildForPaper: vi.fn(async () => { if (fail) throw Error('No local crops'); return { notFound: [], ms: 1 }; }) };
    const service = new ProcessingService({ read: vi.fn(async () => Buffer.from('pdf')), write: vi.fn() } as never, ai as never, repo as never, { get: () => 1 } as never, crops as never);
    return { service, repo, crops };
  }
  it('uses only local data, disables crop AI, and saves review extraction', async () => {
    const { service, repo, crops } = setup();
    await service.processLocal('8PH0_s19_02', 1, data);
    expect(crops.buildForPaper).toHaveBeenCalledWith('8PH0_s19_02', { allowAi: false });
    expect(repo.saveExtraction).toHaveBeenCalledWith('8PH0_s19_02', 'local', 'checked-transcription-v1', expect.any(Array));
    expect(repo.updateJob).toHaveBeenLastCalledWith(1, expect.objectContaining({ state: 'DONE', questionsFound: 1 }));
  });
  it('marks failure explicitly without AI fallback', async () => {
    const { service, repo } = setup(true);
    await service.processLocal('8PH0_s19_02', 1, data);
    expect(repo.setPaperState).toHaveBeenCalledWith('8PH0_s19_02', 'FAILED');
    expect(repo.updateJob).toHaveBeenLastCalledWith(1, expect.objectContaining({ state: 'FAILED' }));
  });
  it('stops the cropper before calling AI for missing text positions', async () => {
    const cropper = new QuestionCropsService((() => ({ where: () => ({ first: async () => ({ id: 1 }) }), whereNull: () => {}, })) as never, {} as never, {} as never);
    // Exercise the read-only preflight with a scanned PDF represented by no text positions.
    const internals = cropper as unknown as { findQuestionBoxes: () => Promise<Map<number, unknown>>; findMarkSchemeBoxes: () => Promise<Map<number, unknown>> };
    internals.findQuestionBoxes = vi.fn(async () => new Map());
    internals.findMarkSchemeBoxes = vi.fn(async () => new Map([[1, {}]]));
    await expect(cropper.assertLocalCoverage('8PH0_s19_02', Buffer.from('qp'), Buffer.from('ms'), [{ number: '1' }])).rejects.toThrow('AI fallback disabled');
  });
  it('uses offline crop regions for scanned pages without text detection or AI', async () => {
    const { service, repo, crops } = setup();
    const buildLocalRegions = vi.fn(async () => ({ notFound: [], ms: 1 }));
    Object.assign(crops, { buildLocalRegions });
    const region = { page: 1, box: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 } };
    const local = { ...data, questions: data.questions.map(q => ({ ...q, localCrops: { qp: [region], ms: [region] } })) };
    await service.processLocal('8PH0_s19_02', 1, local);
    expect(buildLocalRegions).toHaveBeenCalledOnce();
    expect(crops.buildForPaper).not.toHaveBeenCalled();
    expect(repo.updateJob).toHaveBeenLastCalledWith(1, expect.objectContaining({ state: 'DONE' }));
  });

  it.each([false, true])('never replaces existing crops when saving offline regions (existing=%s)', async existing => {
    const region = { page: 1, box: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 } };
    const db = vi.fn((table: string) => {
      const query = { where: () => query, whereIn: () => query, whereNull: () => query,
        select: async () => [{ id: 9, number: '1' }],
        first: async () => table === 'papers' ? { id: 1 } : existing ? { id: 2 } : undefined };
      return query;
    });
    const storage = { read: vi.fn(async () => Buffer.from('pdf')) };
    const cropper = new QuestionCropsService(db as never, storage as never, {} as never);
    const save = vi.spyOn(cropper as never, 'saveCrops').mockResolvedValue(undefined);
    const work = cropper.buildLocalRegions('8PH0_s19_02', [{ number: '1', qp: [region], ms: [region] }]);
    if (existing) {
      await expect(work).rejects.toThrow('cannot replace');
      expect(save).not.toHaveBeenCalled(); expect(storage.read).not.toHaveBeenCalled();
    } else {
      await expect(work).resolves.toEqual({ parts: 1, qp: 1, ms: 1, notFound: [] });
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenCalledWith('8PH0_s19_02', 'QP', expect.any(Buffer), expect.any(Map), { createOnly: true });
      expect(save).toHaveBeenCalledWith('8PH0_s19_02', 'MS', expect.any(Buffer), expect.any(Map), { createOnly: true });
    }
  });

});
