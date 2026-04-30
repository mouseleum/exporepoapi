import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { createServiceClient } from "../lib/supabase";

async function main(): Promise<void> {
  const supabase = createServiceClient();

  const { count, error: countError } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;
  console.log(`row count: ${count}`);

  const { data, error } = await supabase
    .from("companies")
    .select(
      "name, country, industry, employees, total_funding, last_raised_at, sic_codes, naics_codes, apollo_custom",
    )
    .eq("apollo_account_id", "63f7a31a826bb90001552980")
    .single();
  if (error) {
    console.log("Signify lookup error:", error.message);
    return;
  }
  console.log("Signify row:", JSON.stringify(data, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
