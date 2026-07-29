import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";

type CachedOcr = {
  url: string;
  text: string;
  confidence: number;
};

export type LocalOcr = {
  recognizeUrl: (url: string) => Promise<CachedOcr>;
  terminate: () => Promise<void>;
};

export async function createLocalTesseract(cacheDirectory: string): Promise<LocalOcr> {
  await mkdir(cacheDirectory, { recursive: true });
  const modelCacheDirectory = resolve(cacheDirectory, "models");
  await mkdir(modelCacheDirectory, { recursive: true });
  let worker: Worker | undefined;

  async function getWorker() {
    if (worker) return worker;
    console.log("Loading local Chinese/English OCR model...");
    // The Simplified Chinese model also recognizes Latin text and avoids
    // multi-language initialization issues on Windows.
    worker = await createWorker("chi_sim", undefined, { cachePath: modelCacheDirectory });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "200",
    });
    return worker;
  }

  return {
    async recognizeUrl(url: string) {
      const cacheName = `${createHash("sha256").update(url).digest("hex")}.json`;
      const cachePath = resolve(cacheDirectory, cacheName);
      try {
        return JSON.parse(await readFile(cachePath, "utf8")) as CachedOcr;
      } catch {
        // A cache miss is expected on the first scrape.
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`OCR image HTTP ${response.status}: ${url}`);
      const image = Buffer.from(await response.arrayBuffer());
      const result = await (await getWorker()).recognize(image, { rotateAuto: true });
      const cached: CachedOcr = {
        url,
        text: result.data.text.trim(),
        confidence: result.data.confidence,
      };
      await writeFile(cachePath, JSON.stringify(cached, null, 2), "utf8");
      return cached;
    },
    async terminate() {
      if (worker) {
        await worker.terminate();
        worker = undefined;
      }
    },
  };
}
