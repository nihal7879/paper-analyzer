import { vi } from 'vitest';
import { AiRouter } from './ai-router.js';
describe('offline import mode', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('blocks every AI operation before selecting a provider', async () => {
    vi.stubEnv('PAPER_ANALYZER_OFFLINE', '1');
    const router = new AiRouter();
    const current = vi.spyOn(router, 'current').mockImplementation(() => { throw Error('Provider must not be selected'); });
    await expect(router.detectPaperDetails(Buffer.from('page'), 'paper.pdf')).rejects.toThrow('offline mode');
    await expect(router.findQuestionBoxes(Buffer.from('page'), 1, ['1'])).rejects.toThrow('offline mode');
    await expect(router.extractQuestionPage({} as never)).rejects.toThrow('offline mode');
    await expect(router.extractMarkSchemePage({} as never)).rejects.toThrow('offline mode');
    expect(current).not.toHaveBeenCalled();
    expect(Object.values(router.usage).every(u => u.requests === 0)).toBe(true);
  });
});
