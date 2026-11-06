const MAX_EDGE_PX = 1800;
const JPEG_QUALITY = 0.8;

function timeoutPromise<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function loadImageElement(file: Blob | File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image with HTMLImageElement"));
    };
    img.src = url;
  });
}

export async function compressReceiptImage(file: Blob | File): Promise<Blob> {
  // If already small enough (under 350KB), no need to recompress
  if (file.size > 0 && file.size < 350 * 1024) {
    return file;
  }

  try {
    let source: {
      width: number;
      height: number;
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
      cleanup: () => void;
    };

    // Try createImageBitmap first with a 3s timeout
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await timeoutPromise(
          createImageBitmap(file),
          3000,
          "createImageBitmap timed out",
        );
        source = {
          width: bitmap.width,
          height: bitmap.height,
          draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
          cleanup: () => bitmap.close(),
        };
      } catch {
        // Fallback to HTMLImageElement
        source = await timeoutPromise(
          loadImageElement(file),
          3000,
          "HTMLImageElement timed out",
        );
      }
    } else {
      source = await timeoutPromise(
        loadImageElement(file),
        3000,
        "HTMLImageElement timed out",
      );
    }

    try {
      const scale = Math.min(1, MAX_EDGE_PX / Math.max(source.width, source.height));
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        return file;
      }
      source.draw(context, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
      });

      return blob ?? file;
    } finally {
      source.cleanup();
    }
  } catch (err) {
    console.warn("Image compression skipped, using original file:", err);
    return file;
  }
}
