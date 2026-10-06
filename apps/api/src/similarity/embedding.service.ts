import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { StorageService } from '../storage/storage.service.js';

/** Free local embedding model (MIT): runs on the CPU, no API key, downloads once (~130 MB). */
export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';
export const EMBEDDING_MODEL_NAME = 'bge-small-en-v1.5';
export const EMBEDDING_DIMENSIONS = 384;
const MODEL_URL = `https://huggingface.co/${EMBEDDING_MODEL}/resolve/main/onnx/model.onnx`;

type Ort = typeof import('onnxruntime-web');
type Tokenizer = (texts: string[], options: Record<string, unknown>) => Record<string, { data: BigInt64Array; dims: number[] }>;

/**
 * Turns text into 384 numbers that represent its meaning (vectors are normalised, so dot product = cosine).
 * Runs the model with onnxruntime-web (WebAssembly): no native DLLs, works on any Windows/Linux server.
 * (The native onnxruntime-node needs the Microsoft VC++ runtime and crashed on this machine.)
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private model: Promise<{ ort: Ort; tokenizer: Tokenizer; session: import('onnxruntime-web').InferenceSession }> | null = null;

  constructor(private readonly storage: StorageService) {}

  private load() {
    this.model ??= (async () => {
      const t0 = Date.now();
      const cacheDir = join(this.storage.root, 'models');
      const ort = await import('onnxruntime-web');
      ort.env.wasm.numThreads = 1;
      // Tokenizer files come from the same Hugging Face repo (cached next to the app data, offline afterwards).
      const { AutoTokenizer, env } = await import('@huggingface/transformers');
      env.cacheDir = cacheDir;
      const tokenizer = (await AutoTokenizer.from_pretrained(EMBEDDING_MODEL)) as unknown as Tokenizer;

      const modelPath = join(cacheDir, ...EMBEDDING_MODEL.split('/'), 'onnx', 'model.onnx');
      if (!existsSync(modelPath)) {
        this.logger.log(`Downloading ${EMBEDDING_MODEL_NAME} (~130 MB, once)…`);
        const res = await fetch(MODEL_URL);
        if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
        await mkdir(dirname(modelPath), { recursive: true });
        await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
      }
      const session = await ort.InferenceSession.create(await readFile(modelPath), { executionProviders: ['wasm'] });
      this.logger.log(`Embedding model ${EMBEDDING_MODEL_NAME} ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return { ort, tokenizer, session };
    })();
    return this.model;
  }

  /** Embed many texts (batched). */
  async embed(texts: string[], batchSize = 8): Promise<Float32Array[]> {
    const { ort, tokenizer, session } = await this.load();
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const encoded = tokenizer(batch, { padding: true, truncation: true, max_length: 512 });
      const feeds: Record<string, import('onnxruntime-web').Tensor> = {};
      for (const name of session.inputNames) {
        const t = encoded[name];
        feeds[name] = new ort.Tensor('int64', t.data, t.dims);
      }
      const result = await session.run(feeds);
      const hidden = result[session.outputNames[0]];
      const [, seq, dim] = hidden.dims;
      const data = hidden.data as Float32Array;
      for (let j = 0; j < batch.length; j++) {
        // bge models use the [CLS] (first) token embedding, L2-normalised.
        const v = Float32Array.from(data.subarray(j * seq * dim, j * seq * dim + dim));
        let norm = 0;
        for (const x of v) norm += x * x;
        norm = Math.sqrt(norm) || 1;
        for (let k = 0; k < v.length; k++) v[k] /= norm;
        out.push(v);
      }
    }
    return out;
  }
}

/** float32 vector <-> BLOB bytes (little-endian). */
export function vectorToBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function bufferToVector(b: Buffer): Float32Array {
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** The text that represents a question's meaning: topic + subtopic + question + options (LaTeX simplified). */
export function embeddingText(q: { topic: string | null; subtopic: string | null; text: string; options: { label: string; text: string }[] | null }): string {
  const plain = (s: string) =>
    s
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\(,|;|!|quad|qquad)/g, ' ')
      .replace(/\$/g, '')
      .replace(/[*_#>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const options = (q.options ?? []).map((o) => `${o.label}) ${plain(o.text)}`).join(' ');
  return [q.topic, q.subtopic].filter(Boolean).join(' - ') + '. ' + plain(q.text) + (options ? ` Options: ${options}` : '');
}
