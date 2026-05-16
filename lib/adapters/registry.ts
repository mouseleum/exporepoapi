import type { AdapterFactory } from "./types";
import { dimedisFactory } from "./dimedis";
import { cyberseceuropeFactory } from "./cyberseceurope";
import { mapyourshowFactory } from "./mapyourshow";
import { expofpFactory } from "./expofp";

export const ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  dimedis: dimedisFactory,
  cyberseceurope: cyberseceuropeFactory,
  mapyourshow: mapyourshowFactory,
  expofp: expofpFactory,
};

export function getAdapterFactory(family: string): AdapterFactory | undefined {
  return ADAPTER_FACTORIES[family];
}

export function adapterFamilies(): string[] {
  return Object.keys(ADAPTER_FACTORIES);
}
