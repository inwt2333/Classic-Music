export type SourceCollectionHealthInput = {
  sourceName: string;
  rawCount: number;
  normalizedCount: number;
  allowEmpty?: boolean;
};

export function assertSourceCollectionHealthy(input: SourceCollectionHealthInput) {
  if (input.allowEmpty && input.rawCount === 0 && input.normalizedCount === 0) {
    return;
  }
  if (!Number.isFinite(input.rawCount) || input.rawCount <= 0) {
    throw new Error(`${input.sourceName} discovery returned 0 records`);
  }
  if (!Number.isFinite(input.normalizedCount) || input.normalizedCount <= 0) {
    throw new Error(
      `${input.sourceName} discovered ${input.rawCount} records but normalized 0 events`,
    );
  }
}
