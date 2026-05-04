import { createDimedisAdapter } from "./dimedis";

export const drupaAdapter = createDimedisAdapter({
  domain: "www.drupa.com",
  source: "drupa",
  slug: "drupa-2024",
  name: "drupa 2024",
  year: 2024,
});
