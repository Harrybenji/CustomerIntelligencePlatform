import { supabase } from "./supabase";

type JsonRecord = Record<string, any>;

const PAGE_SIZE = 1000;

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function readAll(table: string, configure?: (query: any) => any): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (configure) query = configure(query);
    const { data, error } = await query;
    throwIfError(error);
    rows.push(...((data ?? []) as JsonRecord[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const identityFor = (record: JsonRecord) =>
  record.email
    ? `email:${String(record.email).trim().toLowerCase()}`
    : record.phone_number || record.phoneNumber
      ? `phone:${String(record.phone_number ?? record.phoneNumber).trim().toLowerCase()}`
      : `name:${String(record.customer_name ?? record.customerName ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;

function bucketFor(orders: number) {
  if (orders <= 0) return "0 Orders";
  if (orders >= 5) return "5+ Orders";
  return `${orders} ${orders === 1 ? "Order" : "Orders"}`;
}

function targetFor(orders: number) {
  if (orders <= 0) return { targetOrders: 1, targetBucket: "1 Order", targetAction: "Activate customer" };
  if (orders === 1) return { targetOrders: 2, targetBucket: "2 Orders", targetAction: "Move to 2 orders" };
  if (orders === 2) return { targetOrders: 3, targetBucket: "3 Orders", targetAction: "Move to 3 orders" };
  if (orders === 3) return { targetOrders: 4, targetBucket: "4 Orders", targetAction: "Move to 4 orders" };
  if (orders === 4) return { targetOrders: 5, targetBucket: "5+ Orders", targetAction: "Move to 5+ orders" };
  return { targetOrders: orders, targetBucket: "5+ Orders", targetAction: "Retain / upsell / refer" };
}

function mapCustomerRecord(row: JsonRecord) {
  return {
    customerName: row.customer_name ?? "",
    phoneNumber: row.phone_number ?? "",
    email: row.email ?? "",
    ordersThisMonth: Number(row.orders_this_month ?? 0),
    lifetimeOrders: Number(row.lifetime_orders ?? 0),
    totalSpend: Number(row.total_spend ?? 0),
    lastOrderDate: row.last_order_date ?? "",
    currentFrequencyBucket: row.frequency_bucket ?? bucketFor(Number(row.orders_this_month ?? 0)),
    trendCategory: row.trend_category ?? undefined,
    recommendedAction: row.recommended_action ?? undefined,
  };
}

export async function loadCloudState() {
  const [datasetRows, recordRows, goalRows, campaignRows, targetRows, exportRows] = await Promise.all([
    readAll("datasets", (query) => query.order("year").order("month").order("end_date").order("uploaded_at")),
    readAll("customer_records", (query) => query.order("created_at")),
    readAll("goals", (query) => query.order("year").order("month")),
    readAll("campaigns", (query) => query.order("created_at")),
    readAll("campaign_targets", (query) => query.order("created_at")),
    readAll("export_history", (query) => query.order("exported_at")),
  ]);

  const recordsByDataset = new Map<string, JsonRecord[]>();
  for (const row of recordRows) recordsByDataset.set(row.dataset_id, [...(recordsByDataset.get(row.dataset_id) ?? []), row]);

  const datasets = datasetRows.map((row) => ({
    id: row.id,
    month: row.month,
    year: row.year,
    startDate: row.start_date,
    endDate: row.end_date,
    dataThroughDay: Number(String(row.end_date).slice(-2)),
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    totalRecords: Number(row.total_records ?? 0),
    totalOrders: Number(row.total_orders ?? 0),
    activeCustomers: Number(row.active_customers ?? 0),
    frequency: Number(row.frequency ?? 0),
    status: row.status,
    isLatestSnapshot: row.is_latest,
    customers: (recordsByDataset.get(row.id) ?? []).map(mapCustomerRecord),
  }));

  const actionTargets: JsonRecord[] = [];
  const campaignTargetLists: JsonRecord[] = [];
  for (const dataset of datasets) {
    const grouped = new Map<string, string[]>();
    dataset.customers.forEach((customer) => {
      const customerId = identityFor(customer);
      const target = targetFor(customer.ordersThisMonth);
      actionTargets.push({
        id: `${dataset.id}:${customerId}`,
        snapshotId: dataset.id,
        customerId,
        currentOrders: customer.ordersThisMonth,
        ...target,
        createdAt: dataset.uploadedAt,
        status: "Pending",
      });
      grouped.set(target.targetAction, [...(grouped.get(target.targetAction) ?? []), customerId]);
    });
    for (const [targetAction, customerIds] of grouped) {
      campaignTargetLists.push({
        id: `${dataset.id}:${targetAction.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        snapshotId: dataset.id,
        month: dataset.month,
        year: dataset.year,
        startDate: dataset.startDate,
        endDate: dataset.endDate,
        targetAction,
        totalTargeted: customerIds.length,
        customerIds,
        createdAt: dataset.uploadedAt,
      });
    }
  }

  const targetsByCampaign = new Map<string, JsonRecord[]>();
  for (const row of targetRows) targetsByCampaign.set(row.campaign_id, [...(targetsByCampaign.get(row.campaign_id) ?? []), row]);
  const campaigns = campaignRows.map((row) => ({
    id: row.id,
    campaignName: row.campaign_name,
    campaignType: row.campaign_type,
    campaignGoal: row.campaign_goal,
    targetSegment: row.target_segment,
    snapshotId: row.source_dataset_id,
    snapshotLabel: row.snapshot_label,
    campaignDate: row.created_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetCustomers: (targetsByCampaign.get(row.id) ?? []).map((target) => ({
      customerId: target.target_identity,
      customerName: target.customer_name,
      phoneNumber: target.phone_number ?? "",
      email: target.email ?? "",
      ordersAtCampaign: Number(target.orders_at_campaign_start ?? 0),
      bucketAtCampaign: target.bucket_at_campaign,
      targetOrders: Number(target.target_orders ?? 0),
      targetBucket: target.target_bucket,
      totalSpendAtCampaign: Number(target.total_spend_at_campaign ?? 0),
    })),
  }));

  return {
    datasets,
    goals: goalRows.map((row) => ({
      id: `${row.year}-${String(row.month).padStart(2, "0")}`,
      targetMonth: row.month,
      targetYear: row.year,
      targetOrders: row.target_orders === null ? null : Number(row.target_orders),
      targetFrequency: row.target_frequency === null ? null : Number(row.target_frequency),
      requiredActiveCustomers: row.required_active_customers === null ? null : Number(row.required_active_customers),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    exportHistory: exportRows.map((row) => ({ id: row.id, ...row.metadata, exportedAt: row.exported_at })),
    actionTargets,
    campaignTargetLists,
    campaigns,
  };
}

async function saveDataset(dataset: JsonRecord) {
  const { error } = await supabase.rpc("import_dataset_snapshot", {
    p_dataset: dataset,
    p_replace_dataset_id: dataset.id,
  });
  throwIfError(error);
  return loadCloudState();
}

async function deleteDataset(id: string, confirmation: string | null) {
  const { error } = await supabase.rpc("delete_dataset_snapshot", {
    p_dataset_id: id,
    p_confirmation: confirmation,
  });
  throwIfError(error);
  return loadCloudState();
}

async function saveGoal(id: string, goal: JsonRecord) {
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user.id;
  if (!ownerId) throw new Error("Authentication required");
  const { error } = await supabase.from("goals").upsert({
    id,
    owner_id: ownerId,
    month: goal.targetMonth,
    year: goal.targetYear,
    target_orders: goal.targetOrders,
    target_frequency: goal.targetFrequency,
    required_active_customers: goal.requiredActiveCustomers,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id,id" });
  throwIfError(error);
  return loadCloudState();
}

async function saveCampaign(campaign: JsonRecord) {
  const { error } = await supabase.rpc("create_campaign_with_targets", { p_campaign: campaign });
  throwIfError(error);
  return loadCloudState();
}

async function saveExport(item: JsonRecord) {
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user.id;
  if (!ownerId) throw new Error("Authentication required");
  const { error } = await supabase.from("export_history").insert({
    id: item.id,
    owner_id: ownerId,
    dataset_id: item.datasetId ?? null,
    exported_at: item.exportedAt ?? new Date().toISOString(),
    metadata: item,
  });
  throwIfError(error);
  return loadCloudState();
}

export async function createCloudBackup() {
  const tableNames = [
    "datasets", "customers", "customer_records", "campaigns", "campaign_targets",
    "campaign_results", "goals", "imports", "audit_logs", "export_history",
  ];
  const entries = await Promise.all(tableNames.map(async (table) => [table, await readAll(table)] as const));
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "customer-intelligence-platform",
    tables: Object.fromEntries(entries),
  };
}

export async function cloudRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const [pathname, queryString = ""] = path.split("?");
  const body = options.body ? JSON.parse(String(options.body)) : null;
  let result: unknown;

  if (method === "GET" && pathname === "/state") result = await loadCloudState();
  else if (method === "GET" && pathname === "/backup") result = await createCloudBackup();
  else if (method === "PUT" && pathname.startsWith("/datasets/")) result = await saveDataset(body);
  else if (method === "DELETE" && pathname.startsWith("/datasets/")) {
    result = await deleteDataset(decodeURIComponent(pathname.slice("/datasets/".length)), new URLSearchParams(queryString).get("confirm"));
  } else if (method === "PUT" && pathname.startsWith("/goals/")) {
    result = await saveGoal(decodeURIComponent(pathname.slice("/goals/".length)), body);
  } else if (method === "POST" && pathname === "/campaigns") result = await saveCampaign(body);
  else if (method === "POST" && pathname === "/export-history") result = await saveExport(body);
  else throw new Error(`Unsupported cloud operation: ${method} ${pathname}`);

  return result as T;
}
