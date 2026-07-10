export interface TokenStandardV2Account {
  readonly owner: string | null;
  readonly provider: string | null;
  readonly id: string;
}

export interface TokenStandardV2InstrumentId {
  readonly admin: string;
  readonly id: string;
}

export interface TokenStandardV2Metadata {
  readonly values: Readonly<Record<string, string>>;
}
