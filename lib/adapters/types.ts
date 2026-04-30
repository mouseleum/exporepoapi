export type EventMeta = {
  source: string;
  slug: string;
  name: string;
  year: number | null;
  source_url: string;
};

export type RawExhibitor = {
  raw_name: string;
  country?: string | null;
  hall?: string | null;
  booth?: string | null;
};

export type Adapter = {
  meta: EventMeta;
  fetch: () => Promise<RawExhibitor[]>;
};
