import { createDimedisAdapter } from "./dimedis";

export {
  parseLocation,
  parseLetter,
  type DirectoryMeta,
  type DirectoryEntry,
} from "./dimedis";

export const interpackAdapter = createDimedisAdapter({
  domain: "www.interpack.com",
  source: "interpack",
  slug: "interpack-2026",
  name: "interpack 2026",
  year: 2026,
  minExhibitors: 1000,
});
