import type { AdapterFactory } from "./types";
import { dimedisFactory } from "./dimedis";
import { cyberseceuropeFactory } from "./cyberseceurope";

export const ADAPTER_FACTORIES: Record<string, AdapterFactory> = {
  dimedis: dimedisFactory,
  cyberseceurope: cyberseceuropeFactory,
};

export function getAdapterFactory(family: string): AdapterFactory | undefined {
  return ADAPTER_FACTORIES[family];
}

export function adapterFamilies(): string[] {
  return Object.keys(ADAPTER_FACTORIES);
}
