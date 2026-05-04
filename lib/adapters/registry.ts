import type { Adapter } from "./types";
import { cyberseceuropeAdapter } from "./cyberseceurope";
import { interpackAdapter } from "./interpack";
import { drupaAdapter } from "./drupa";
import { medicaAdapter } from "./medica";
import { glasstecAdapter } from "./glasstec";
import { bootAdapter } from "./boot";

export const ADAPTERS: Record<string, Adapter> = {
  cyberseceurope: cyberseceuropeAdapter,
  interpack: interpackAdapter,
  drupa: drupaAdapter,
  medica: medicaAdapter,
  glasstec: glasstecAdapter,
  boot: bootAdapter,
};

export function getAdapter(key: string): Adapter | undefined {
  return ADAPTERS[key];
}
