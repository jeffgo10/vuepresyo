const CHECK_FAILED_MESSAGE = "Could not check this photo on your phone. Try again.";
const RECOGNIZING_STATUS = "recognizing text";

export const PREPARE_READER_LABEL = "Preparing the reader…";

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<OcrWorker> | null = null;
let statusListener: ((label: string) => void) | null = null;

export function checkingPhotoLabel(percent: number): string {
  if (percent <= 0) return "Checking the photo…";
  return `Checking the photo… ${percent}%`;
}

function reportStatus(message: { status: string; progress: number }) {
  if (!statusListener) return;
  if (message.status === RECOGNIZING_STATUS) {
    statusListener(checkingPhotoLabel(Math.round(message.progress * 100)));
    return;
  }
  statusListener(PREPARE_READER_LABEL);
}

async function discardWorker() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // The worker never started, or it already stopped.
  }
}

async function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, { logger: reportStatus });
    })();
  }
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

export type ReceiptOcrReading = {
  text: string;
  confidence: number | null;
};

export async function readReceiptText(
  image: Blob,
  onStatus?: (label: string) => void,
): Promise<ReceiptOcrReading> {
  statusListener = onStatus ?? null;
  try {
    const worker = await getWorker();
    const result = await worker.recognize(image);
    const confidence = result.data.confidence;
    return {
      text: result.data.text ?? "",
      confidence: typeof confidence === "number" ? confidence : null,
    };
  } catch {
    await discardWorker();
    throw new Error(CHECK_FAILED_MESSAGE);
  } finally {
    statusListener = null;
  }
}
