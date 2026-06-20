import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_FILE"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const backup = JSON.parse(await readFile(process.env.BACKUP_FILE, "utf8"));
if (backup.schemaVersion !== 1 || !backup.tables) throw new Error("Unsupported backup format");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tableOrder = [
  "datasets", "customers", "customer_records", "campaigns", "campaign_targets",
  "goals", "imports", "campaign_results", "audit_logs", "export_history",
];
const conflictTargets = {
  datasets: "owner_id,id",
  customers: "id",
  customer_records: "id",
  campaigns: "owner_id,id",
  campaign_targets: "id",
  goals: "owner_id,id",
  imports: "id",
  campaign_results: "id",
  audit_logs: "id",
  export_history: "owner_id,id",
};

for (const table of tableOrder) {
  const rows = backup.tables[table] ?? [];
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + 500), {
      onConflict: conflictTargets[table],
    });
    if (error) throw new Error(`${table} restore failed: ${error.message}`);
  }
  console.log(`Restored ${rows.length} rows into ${table}`);
}

console.log("Backup restore complete.");
