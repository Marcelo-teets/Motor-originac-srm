export const DEBENTURES_SND_DATASET_CODE = 'debentures_snd';
export const DEBENTURES_SND_SOURCE_CODE = 'src_debentures_snd';
export const DEBENTURES_SND_RESOURCE_KEY = 'public_registered_debentures';

export type DebenturesSndRow = Record<string, string>;
export type DebenturesSndSnapshot = {
  generatedAt: string | null;
  generatedDate: string | null;
  sourceHash: string;
  rows: DebenturesSndRow[];
};
