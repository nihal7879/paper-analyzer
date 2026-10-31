import { vi } from 'vitest';
const prepare = vi.hoisted(() => vi.fn());
vi.mock('./local-extraction.js', () => ({ prepareLocalExtraction: prepare }));
import { PapersService } from './papers.service.js';
const fields = { subjectCode: '8PH0', year: 2017, seasonCode: 's', paperCode: '02', localExtraction: '{}' };
const file = { buffer: Buffer.from('%PDF-test'), originalname: 'paper.pdf' } as Express.Multer.File;
const local = { paper: { board: 'Pearson Edexcel', curriculum: 'Edexcel AS Level', subjectName: 'Physics' }, questions: [{ number: '1' }] };
function setup(exists = false, orphan = false) {
  const repo = { paperExists: vi.fn(async () => exists), findSubject: vi.fn(async () => ({ id: 4, board: 'Pearson Edexcel', curriculum: 'Edexcel AS Level', name: 'Physics', components: [], topics: [] })), componentId: vi.fn(async () => 17), createPaper: vi.fn(), audit: vi.fn(), paperDbId: vi.fn(async () => 1), createJob: vi.fn(async () => 2) };
  const storage = { exists: vi.fn(() => orphan), removeDir: vi.fn(), write: vi.fn() };
  const crops = { assertLocalCoverage: vi.fn() };
  const processing = { process: vi.fn(), processLocal: vi.fn() };
  const jobs = { enqueue: vi.fn() };
  const forbidden = new Proxy({}, { get() { throw Error('AI must not be accessed'); } });
  const service = new PapersService(storage as never, jobs as never, processing as never, repo as never, {} as never, forbidden as never, {} as never, crops as never, {} as never);
  prepare.mockReset(); prepare.mockResolvedValue(local);
  return { service, storage, repo, crops, processing, jobs };
}
describe('POST /papers local branch', () => {
  it('rejects a bad transcription without files or DB writes', async () => {
    const { service, storage, repo } = setup(); prepare.mockRejectedValue(new SyntaxError('bad JSON'));
    await expect(service.create(fields, file, file)).rejects.toThrow('invalid extraction JSON');
    expect(repo.findSubject).not.toHaveBeenCalled(); expect(storage.write).not.toHaveBeenCalled(); expect(repo.createPaper).not.toHaveBeenCalled();
  });
  it.each([[true, false], [false, true]])('refuses existing DB paper or orphaned storage (%s, %s)', async (exists, orphan) => {
    const { service, storage, repo } = setup(exists, orphan);
    await expect(service.create(fields, file, file)).rejects.toThrow('already exists');
    expect(storage.write).not.toHaveBeenCalled(); expect(storage.removeDir).not.toHaveBeenCalled(); expect(repo.createPaper).not.toHaveBeenCalled();
  });
  it('rejects local crop failure before saving anything', async () => {
    const { service, storage, repo, crops } = setup(); crops.assertLocalCoverage.mockRejectedValue(Error('AI fallback disabled'));
    await expect(service.create(fields, file, file)).rejects.toThrow('AI fallback disabled');
    expect(storage.write).not.toHaveBeenCalled(); expect(repo.createPaper).not.toHaveBeenCalled();
  });
  it('saves through the upload path, avoids directory deletion, and queues only local processing', async () => {
    const { service, storage, repo, jobs, processing } = setup();
    await expect(service.create(fields, file, file)).resolves.toEqual({ id: '8PH0_s17_02' });
    expect(storage.write).toHaveBeenCalledTimes(2); expect(storage.removeDir).not.toHaveBeenCalled();
    expect(repo.createPaper).toHaveBeenCalledWith(expect.objectContaining({ slug: '8PH0_s17_02', qpPath: 'papers/8PH0_s17_02/qp.pdf' }));
    const task = jobs.enqueue.mock.calls[0][1] as unknown as () => Promise<void>; await task();
    expect(processing.processLocal).toHaveBeenCalledWith('8PH0_s17_02', 2, local); expect(processing.process).not.toHaveBeenCalled();
  });
});
