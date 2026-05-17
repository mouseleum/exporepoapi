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
  source_id?: string | null;
};

export type RawPerson = {
  source_exhibitor_id: string;
  source_person_id?: string | null;
  raw_name: string;
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  organization?: string | null;
  photo_url?: string | null;
};

export type Adapter = {
  meta: EventMeta;
  fetch: () => Promise<RawExhibitor[]>;
  fetchPeople?: (exhibitorSourceIds: string[]) => Promise<RawPerson[]>;
};

export type AdapterFactory = (meta: EventMeta, config: unknown) => Adapter;
