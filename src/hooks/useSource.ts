import { getSource } from "../sources";
import type { SourceAdapter } from "../sources/types";
import { useExportData } from "../store/messageStore";

/** The adapter for the loaded export's source (Skype's while nothing is loaded). */
export function useSource(): SourceAdapter {
  return getSource(useExportData()?.source ?? "skype");
}
