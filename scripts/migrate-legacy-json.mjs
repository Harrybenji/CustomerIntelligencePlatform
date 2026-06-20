import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_EMAIL", "SUPABASE_PASSWORD"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const file = process.env.LEGACY_STORE_PATH ?? "./data/customer-intelligence-store.json";
const store = JSON.parse(await readFile(file, "utf8"));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: process.env.SUPABASE_EMAIL,
  password: process.env.SUPABASE_PASSWORD,
});
if (authError || !auth.user) throw authError ?? new Error("Authentication failed");

for (const dataset of store.datasets ?? []) {
  const { error } = await supabase.rpc("import_dataset_snapshot", {
    p_dataset: dataset,
    p_replace_dataset_id: dataset.id,
  });
  if (error) throw new Error(`Dataset ${dataset.id} failed: ${error.message}`);
  console.log(`Imported dataset ${dataset.id}`);
}

for (const goal of store.goals ?? []) {
  const month = Number(goal.targetMonth ?? goal.month);
  const year = Number(goal.targetYear ?? goal.year);
  const id = goal.id ?? `${year}-${String(month).padStart(2, "0")}`;
  const { error } = await supabase.from("goals").upsert({
    owner_id: auth.user.id,
    id,
    month,
    year,
    target_orders: goal.targetOrders ?? null,
    target_frequency: goal.targetFrequency ?? null,
    required_active_customers: goal.requiredActiveCustomers ?? null,
  }, { onConflict: "owner_id,id" });
  if (error) throw new Error(`Goal ${id} failed: ${error.message}`);
}

for (const campaign of store.campaigns ?? []) {
  const { error } = await supabase.rpc("create_campaign_with_targets", { p_campaign: campaign });
  if (error && error.code !== "23505") throw new Error(`Campaign ${campaign.id} failed: ${error.message}`);
}

await supabase.auth.signOut();
console.log(`Migration complete: ${(store.datasets ?? []).length} datasets and ${(store.campaigns ?? []).length} campaigns.`);
