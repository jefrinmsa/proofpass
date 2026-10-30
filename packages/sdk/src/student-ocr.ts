type CardReader = {
  recognize: (file: File) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};
type ReaderFactory = (onError: () => void) => Promise<CardReader>;

async function createReader(onError: () => void): Promise<CardReader> {
  const { createWorker } = await import('tesseract.js');
  return createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    workerBlobURL: false,
    corePath: '/ocr',
    langPath: '/ocr',
    gzip: true,
    cacheMethod: 'none',
    errorHandler: onError,
  });
}

// Bound startup as well as recognition: a worker download can stall before it exists.
export function readStudentCard(
  file: File,
  signal: AbortSignal,
  create: ReaderFactory = createReader,
  timeoutMs = 45000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let reader: CardReader | undefined;
    let settled = false;
    const stop = () => {
      if (reader) {
        const current = reader;
        reader = undefined;
        void current.terminate().catch(() => {});
      }
    };
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      stop();
      if (error) reject(error);
      else resolve(text ?? '');
    };
    const abort = () => finish(new Error('OCR_CANCELLED'));
    const timer = setTimeout(() => finish(new Error('OCR_TIMEOUT')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    void (async () => {
      try {
        reader = await create(() => finish(new Error('OCR_UNAVAILABLE')));
        if (settled) return stop();
        const { data } = await reader.recognize(file);
        finish(undefined, data.text);
      } catch {
        finish(new Error('OCR_UNAVAILABLE'));
      }
    })();
  });
}
