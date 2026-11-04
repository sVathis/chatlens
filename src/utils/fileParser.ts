import { debugLog } from "./debug";
import {
  SMALL_FILE_THRESHOLD,
  FILE_CHUNK_SIZE,
  PROGRESS_UPDATE_INTERVAL,
} from "../constants/fileUpload";

/**
 * Reads and parses a JSON file, handling both small and large files. For large files
 * (>100MB) it reads in chunks that yield to the event loop, to avoid blocking the page.
 * What the JSON means is for the source adapters to check (see src/sources/).
 */
export async function readJsonFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<unknown> {
  debugLog("[fileParser] Starting to parse JSON file:", {
    fileName: file.name,
    fileSize: file.size,
    fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
    method: file.size < SMALL_FILE_THRESHOLD ? "small file" : "streaming",
  });

  return file.size < SMALL_FILE_THRESHOLD
    ? parseSmallFile(file, onProgress)
    : parseStreamingFile(file, onProgress);
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error("[fileParser] Failed to parse JSON content:", {
      error,
      contentLength: content.length,
      contentPreview: content.substring(0, 100),
    });
    throw new Error(
      `Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function parseSmallFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = (error) => {
      console.error("[fileParser] FileReader error:", {
        error,
        fileName: file.name,
        fileSize: file.size,
      });
      reject(new Error("Failed to read file"));
    };

    reader.onload = (event) => {
      try {
        onProgress(100);
        const content = event.target?.result;
        if (typeof content !== "string") {
          console.error("[fileParser] File content is not a string:", {
            fileName: file.name,
            fileSize: file.size,
            resultType: typeof content,
          });
          reject(new Error("File content is not a string"));
          return;
        }
        resolve(parseJsonContent(content));
      } catch (error) {
        console.error("[fileParser] Failed to parse small file:", {
          error,
          fileName: file.name,
          fileSize: file.size,
        });
        reject(error);
      }
    };

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min((event.loaded / event.total) * 95, 95));
      }
    };

    reader.readAsText(file);
  });
}

/**
 * Parses large files by reading in chunks to avoid loading entire file into memory.
 * Uses recursive chunk reading with setTimeout(0) to yield to the event loop between chunks,
 * preventing UI blocking. Progress updates are throttled to avoid excessive re-renders.
 */
async function parseStreamingFile(
  file: File,
  onProgress: (progress: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let offset = 0;
    const chunks: string[] = [];
    let lastProgressUpdate = 0;

    const readNextChunk = () => {
      const reader = new FileReader();

      reader.onerror = (error) => {
        console.error("[fileParser] FileReader chunk error:", {
          error,
          fileName: file.name,
          offset,
          chunkSize: FILE_CHUNK_SIZE,
        });
        reject(new Error("Failed to read file chunk"));
      };

      reader.onload = (e) => {
        chunks.push(e.target?.result as string);
        offset += FILE_CHUNK_SIZE;

        // Throttle progress updates to avoid excessive re-renders
        const now = Date.now();
        if (now - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL) {
          onProgress(Math.min((offset / file.size) * 95, 95));
          lastProgressUpdate = now;
        }

        if (offset < file.size) {
          // Yield to event loop before reading next chunk to prevent UI blocking
          setTimeout(readNextChunk, 0);
        } else {
          try {
            onProgress(100);
            // Join all chunks into complete text before parsing JSON
            const textContent = chunks.join("");
            resolve(parseJsonContent(textContent));
          } catch (error) {
            console.error("[fileParser] Failed to parse streaming file:", {
              error,
              fileName: file.name,
              fileSize: file.size,
              chunksCount: chunks.length,
            });
            reject(
              error instanceof Error
                ? error
                : new Error("Failed to parse JSON"),
            );
          }
        }
      };

      reader.readAsText(file.slice(offset, offset + FILE_CHUNK_SIZE));
    };

    readNextChunk();
  });
}
