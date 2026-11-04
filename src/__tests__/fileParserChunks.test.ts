import { describe, expect, it, vi } from "vitest";

// Treat any file over 10 bytes as large, read in 7-byte chunks, so that chunk boundaries
// fall inside the characters of a small test file
vi.mock("../constants/fileUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../constants/fileUpload")>()),
  SMALL_FILE_THRESHOLD: 10,
  FILE_CHUNK_SIZE: 7,
}));

const { readJsonFile } = await import("../utils/fileParser");

const TEXT = "\u{0393}\u{03B5}\u{03B9}\u{03AC} \u{03C3}\u{03BF}\u{03C5} \u{03BA}\u{03CC}\u{03C3}\u{03BC}\u{03B5} \u{2713} \u{1F600}";

const fileOf = (parts: BlobPart[]) => new File(parts, "export.json");
const read = (file: File) => readJsonFile(file, () => {});

describe("reading a large JSON file in chunks", () => {
  // The padding moves where the chunk boundaries fall: 1-byte, 2-byte (Greek), 3-byte
  // and 4-byte characters are each cut at some alignment
  it.each([0, 1, 2, 3, 4, 5, 6])(
    "keeps multibyte characters that a chunk boundary cuts in two (padding %i)",
    async (padding) => {
      const value = { pad: "x".repeat(padding), text: TEXT, again: TEXT };
      const parsed = (await read(fileOf([JSON.stringify(value)]))) as typeof value;
      expect(parsed.text).toBe(TEXT);
      expect(parsed.again).toBe(TEXT);
      expect(parsed).toEqual(value);
    },
  );

  it("reads the file in more than one chunk", async () => {
    const json = JSON.stringify({ text: TEXT });
    expect(new Blob([json]).size).toBeGreaterThan(7 * 3);
    expect(await read(fileOf([json]))).toEqual({ text: TEXT });
  });

  it("ignores a byte order mark at the start, as reading the file whole does", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(JSON.stringify({ text: TEXT }))]);
    expect(await read(fileOf([bytes]))).toEqual({ text: TEXT });
  });

  it("reads an exact multiple of the chunk size, with nothing left over", async () => {
    // {"k":"abcde"} is 13 bytes; pad the value so the size is 14 = 2 chunks of 7
    const json = JSON.stringify({ k: "abcdef" });
    expect(new Blob([json]).size).toBe(14);
    expect(await read(fileOf([json]))).toEqual({ k: "abcdef" });
  });

  it("still reports a file that is not JSON", async () => {
    await expect(read(fileOf(["this is not json at all"]))).rejects.toThrow(/Failed to parse JSON/);
  });

  it("reads a small file whole, as before", async () => {
    // At or under the threshold: no chunks at all
    expect(await read(fileOf(['{"a":1}']))).toEqual({ a: 1 });
  });
});
