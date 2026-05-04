import { createDimedisAdapter } from "./dimedis";

export const medicaAdapter = createDimedisAdapter({
  domain: "www.medica.de",
  source: "medica",
  slug: "medica-2025",
  name: "MEDICA / COMPAMED 2025",
  year: 2025,
});
