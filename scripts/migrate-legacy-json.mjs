import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";

function sqlitePayloads(file, table, orderBy = "") {
  const sql = `SELECT payload FROM ${table}${orderBy ? ` ORDER BY ${orderBy}` : ""};`;
  const output = execFileSync("sqlite3", ["-batch", "-noheader", file, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return output ? output.split("\n").map((payload) => JSON.parse(payload)) : [];
}

async function loadLegacyStore(file) {
  if ([".sqlite", ".db"].includes(extname(file).toLowerCase())) {
    return {
      datasets: sqlitePayloads(file, "datasets", "year, month, endDate, uploadedAt"),
      goals: sqlitePayloads(file, "goals", "year, month, updatedAt"),
      campaigns: sqlitePayloads(file, "campaigns", "createdAt"),
    };
  }
  return JSON.parse(await readFile(file, "utf8"));
}

const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function customerIdentity(customer) {
  if (customer.email) return `email:${normalize(customer.email)}`;
  if (customer.phoneNumber) return `phone:${normalize(customer.phoneNumber)}`;
  return `name:${normalize(customer.customerName)}`;
}

function mergeDuplicateCustomers(customers = []) {
  const merged = new Map();
  for (const customer of customers) {
    const identity = customerIdentity(customer);
    const existing = merged.get(identity);
    if (!existing) {
      merged.set(identity, { ...customer });
      continue;
    }
    merged.set(identity, {
      ...existing,
      customerName: existing.customerName || customer.customerName || "",
      phoneNumber: existing.phoneNumber || customer.phoneNumber || "",
      email: existing.email || customer.email || "",
      ordersThisMonth: Number(existing.ordersThisMonth || 0) + Number(customer.ordersThisMonth || 0),
      lifetimeOrders: Number(existing.lifetimeOrders || 0) + Number(customer.lifetimeOrders || 0),
      totalSpend: Number(existing.totalSpend || 0) + Number(customer.totalSpend || 0),
      lastOrderDate: [existing.lastOrderDate, customer.lastOrderDate].filter(Boolean).sort().at(-1) ?? "",
      trendCategory: existing.trendCategory || customer.trendCategory,
      recommendedAction: existing.recommendedAction || customer.recommendedAction,
    });
  }
  return [...merged.values()];
}

function numericTotals(datasets) {
  return (datasets ?? []).reduce((totals, dataset) => {
    for (const customer of dataset.customers ?? []) {
      totals.ordersThisMonth += Number(customer.ordersThisMonth || 0);
      totals.lifetimeOrders += Number(customer.lifetimeOrders || 0);
      totals.totalSpend += Number(customer.totalSpend || 0);
    }
    return totals;
  }, { ordersThisMonth: 0, lifetimeOrders: 0, totalSpend: 0 });
}

const file = process.env.LEGACY_STORE_PATH ?? "./data/customer-intelligence.sqlite";
const store = await loadLegacyStore(file);
const sourceCustomerRecords = (store.datasets ?? []).reduce((sum, dataset) => sum + (dataset.customers?.length ?? 0), 0);
const sourceTotals = numericTotals(store.datasets);
store.datasets = (store.datasets ?? []).map((dataset) => ({
  ...dataset,
  customers: mergeDuplicateCustomers(dataset.customers),
}));
const mergedTotals = numericTotals(store.datasets);
for (const field of Object.keys(sourceTotals)) {
  if (Math.abs(sourceTotals[field] - mergedTotals[field]) > 0.01) {
    throw new Error(`Duplicate merge changed the ${field} total; migration stopped`);
  }
}
const summary = {
  datasets: (store.datasets ?? []).length,
  sourceCustomerRecords,
  customerRecords: (store.datasets ?? []).reduce((sum, dataset) => sum + (dataset.customers?.length ?? 0), 0),
  mergedDuplicateRows: sourceCustomerRecords - (store.datasets ?? []).reduce((sum, dataset) => sum + (dataset.customers?.length ?? 0), 0),
  goals: (store.goals ?? []).length,
  campaigns: (store.campaigns ?? []).length,
  totalsPreserved: true,
};

if (process.env.MIGRATION_DRY_RUN === "1") {
  console.log(JSON.stringify({ source: file, ...summary }, null, 2));
  process.exit(0);
}

for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_EMAIL", "SUPABASE_PASSWORD"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (!summary.datasets || !summary.customerRecords) throw new Error("Refusing to migrate an empty legacy data source");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: process.env.SUPABASE_EMAIL,
  password: process.env.SUPABASE_PASSWORD,
});
if (authError || !auth.user) throw authError ?? new Error("Authentication failed");

for (const dataset of store.datasets ?? []) {
  const { error } = await supabase.rpc("import_dataset_snapshot_secure", {
    p_dataset: dataset,
    p_replace_dataset_id: dataset.id,
  });
  if (error) throw new Error(`Dataset ${dataset.id} failed: ${error.message}`);
  console.log(`Imported dataset ${dataset.id} (${dataset.customers?.length ?? 0} records)`);
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
  const { error } = await supabase.rpc("create_campaign_with_targets_secure", { p_campaign: campaign });
  if (error && error.code !== "23505") throw new Error(`Campaign ${campaign.id} failed: ${error.message}`);
}

await supabase.auth.signOut();
console.log(`Migration complete: ${summary.datasets} datasets, ${summary.customerRecords} unique customer records (${summary.mergedDuplicateRows} duplicate rows merged), ${summary.goals} goals, and ${summary.campaigns} campaigns.`);
