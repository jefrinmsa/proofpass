import { describe, expect, it, vi } from 'vitest';
import { readStudentCard } from '../packages/sdk/src/student-ocr';

const file = {} as File;
describe('local student card reader recovery', () => {
  it('times out even when worker startup never completes', async () => {
    await expect(
      readStudentCard(file, new AbortController().signal, () => new Promise(() => {}), 10),
    ).rejects.toThrow('OCR_TIMEOUT');
  });

  it('terminates a worker that arrives after cancellation without recognizing the photo', async () => {
    const controller = new AbortController();
    const reader = { recognize: vi.fn(), terminate: vi.fn().mockResolvedValue(undefined) };
    let ready!: (value: typeof reader) => void;
    const result = readStudentCard(
      file,
      controller.signal,
      () =>
        new Promise((r) => {
          ready = r;
        }),
    );
    controller.abort();
    await expect(result).rejects.toThrow('OCR_CANCELLED');
    ready(reader);
    await Promise.resolve();
    expect(reader.terminate).toHaveBeenCalledOnce();
    expect(reader.recognize).not.toHaveBeenCalled();
  });

  it('rejects worker errors and ignores late recognition results', async () => {
    const reader = {
      recognize: vi.fn(() => new Promise<{ data: { text: string } }>(() => {})),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    let fail!: () => void;
    const result = readStudentCard(file, new AbortController().signal, async (onError) => {
      fail = onError;
      return reader;
    });
    await Promise.resolve();
    fail();
    await expect(result).rejects.toThrow('OCR_UNAVAILABLE');
    expect(reader.terminate).toHaveBeenCalledOnce();
  });

  it('returns recognized text without waiting for worker shutdown', async () => {
    const reader = {
      recognize: vi.fn().mockResolvedValue({ data: { text: 'ROLL CSE2026001' } }),
      terminate: vi.fn(() => new Promise(() => {})),
    };
    await expect(
      readStudentCard(file, new AbortController().signal, async () => reader),
    ).resolves.toBe('ROLL CSE2026001');
    expect(reader.terminate).toHaveBeenCalledOnce();
  });
});
