import { Injectable, Logger } from '@nestjs/common';

type Task = () => Promise<void>;

/**
 * Phase 0 in-process job runner: one job at a time, FIFO.
 * Same enqueue() contract as a BullMQ queue, so it can be swapped for
 * BullMQ + Redis later without touching callers.
 */
@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);
  private readonly queue: { name: string; task: Task }[] = [];
  private readonly pending = new Set<string>();
  private running = false;

  /** Returns false if a job with the same name is already queued or running. */
  enqueue(name: string, task: Task): boolean {
    if (this.pending.has(name)) return false;
    this.pending.add(name);
    this.queue.push({ name, task });
    void this.drain();
    return true;
  }

  isPending(name: string): boolean {
    return this.pending.has(name);
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift()!;
      try {
        await job.task();
      } catch (err) {
        this.logger.error(`Job ${job.name} failed: ${(err as Error).message}`);
      } finally {
        this.pending.delete(job.name);
      }
    }
    this.running = false;
  }
}
