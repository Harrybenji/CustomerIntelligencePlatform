import { useEffect, useMemo, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, Card } from "./ui";
import { cloudRequest } from "../lib/cloudPersistence";

type CustomerRecord = {
  customerName: string;
  phoneNumber: string;
  email: string;
  ordersThisMonth: number;
  lifetimeOrders: number;
  totalSpend: number;
  lastOrderDate: string;
  currentFrequencyBucket?: string;
  trendCategory?: string;
  recommendedAction?: string;
};

type MonthlyDataset = {
  id: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  dataThroughDay: number;
  fileName: string;
  uploadedAt: string;
  totalRecords: number;
  totalOrders: number;
  activeCustomers: number;
  frequency: number;
  status: "month-to-date" | "complete";
  isLatestSnapshot?: boolean;
  customers: CustomerRecord[];
};

type Goal = {
  id: string;
  targetMonth: number;
  targetYear: number;
  targetOrders: number | null;
  targetFrequency: number | null;
  requiredActiveCustomers: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type BackendState = {
  datasets: MonthlyDataset[];
  goals: Goal[];
  exportHistory: Array<Record<string, unknown>>;
  actionTargets: ActionTarget[];
  campaignTargetLists: CampaignTargetList[];
  campaigns: Campaign[];
};

type DatasetSaveResult = {
  datasetId: string;
};

type CampaignType = "SMS" | "Push Notification" | "WhatsApp" | "Email" | "Manual Outreach";

type CampaignTargetCustomer = {
  customerId: string;
  customerName: string;
  phoneNumber: string;
  email: string;
  ordersAtCampaign: number;
  bucketAtCampaign: string;
  targetOrders: number;
  targetBucket: string;
  totalSpendAtCampaign: number;
};

type CampaignStatus = "Draft" | "Active" | "Waiting For New Snapshot" | "Measuring" | "Completed";

type Campaign = {
  id: string;
  campaignName: string;
  campaignType: CampaignType;
  campaignGoal: string;
  targetSegment: string;
  snapshotId: string;
  snapshotLabel: string;
  campaignDate: string;
  status: CampaignStatus;
  targetCustomers: CampaignTargetCustomer[];
  createdAt: string;
  updatedAt?: string;
};

type CampaignResult = {
  campaign: Campaign;
  targeted: number;
  converted: number;
  exceeded: number;
  progressing: number;
  noMovement: number;
  newlyInactive: number;
  dataMismatch: number;
  conversionRate: number | null;
  extraOrders: number;
  revenueGenerated: number;
  hasComparisonData: boolean;
  comparisonSnapshotLabel: string | null;
  status: CampaignStatus;
  measurementMessage: string;
  rows: Array<{
    customerName: string;
    phoneNumber: string;
    email: string;
    ordersBefore: number;
    ordersAfter: number;
    movement: number;
    result: string;
    recommendedNextAction: string;
  }>;
};

type ActionTarget = {
  id: string;
  snapshotId: string;
  customerId: string;
  currentOrders: number;
  targetOrders: number;
  targetAction: string;
  targetBucket: string;
  createdAt: string;
  status: "Pending" | "Converted" | "Not Converted";
};

type CampaignTargetList = {
  id: string;
  snapshotId: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  targetAction: string;
  totalTargeted: number;
  customerIds: string[];
  createdAt: string;
};

type JourneyResult =
  | "Converted"
  | "Partially Progressed"
  | "No Movement"
  | "Data Issue"
  | "Newly Activated"
  | "New Customer";

type JourneyRow = {
  customerId: string;
  customerName: string;
  phoneNumber: string;
  email: string;
  previousOrders: number;
  targetOrders: number;
  currentOrders: number;
  movement: number;
  result: JourneyResult;
  recommendedNextAction: string;
};

type RequiredColumn = {
  label: string;
  key: keyof CustomerRecord;
  aliases: string[];
};

type TrendCategory =
  | "Growing"
  | "Declining"
  | "Stable"
  | "Reactivated"
  | "Newly Inactive"
  | "One-Time Customer";

type TrendRow = CustomerRecord & {
  id: string;
  ordersPreviousMonth: number;
  previousOrders: number | null;
  currentOrders: number;
  trendCategory: TrendCategory;
  currentBucket: string;
  change: number | null;
  recommendedAction: string;
};

type BucketMove = {
  from: string;
  to: string;
  customers: number;
  available: number;
  orders: number;
  rows: TrendRow[];
};

const REQUIRED_COLUMNS: RequiredColumn[] = [
  { label: "Customer Name", key: "customerName", aliases: ["customer name", "name"] },
  { label: "Phone Number", key: "phoneNumber", aliases: ["phone number", "phone", "mobile"] },
  { label: "Email", key: "email", aliases: ["email", "email address"] },
  { label: "Orders This Month", key: "ordersThisMonth", aliases: ["orders this month", "current orders"] },
  { label: "Lifetime Orders", key: "lifetimeOrders", aliases: ["lifetime orders", "total orders"] },
  { label: "Total Spend", key: "totalSpend", aliases: ["total spend", "spend", "revenue"] },
  { label: "Last Order Date", key: "lastOrderDate", aliases: ["last order date", "last order"] },
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const BUCKETS = ["0 Orders", "1 Order", "2 Orders", "3 Orders", "4 Orders", "5+ Orders"];
const BUCKET_COLORS = ["#71717a", "#fb7185", "#f97316", "#facc15", "#22c55e", "#38bdf8"];
const EXPORT_FIELDS = [
  { label: "Customer Name", key: "customerName" },
  { label: "Phone Number", key: "phoneNumber" },
  { label: "Email", key: "email" },
  { label: "Orders This Month", key: "ordersThisMonth" },
  { label: "Orders Previous Month", key: "ordersPreviousMonth" },
  { label: "Lifetime Orders", key: "lifetimeOrders" },
  { label: "Total Spend", key: "totalSpend" },
  { label: "Last Order Date", key: "lastOrderDate" },
  { label: "Current Frequency Bucket", key: "currentBucket" },
  { label: "Customer Trend Category", key: "trendCategory" },
  { label: "Recommended Action", key: "recommendedAction" },
] as const;
type ExportFieldKey = (typeof EXPORT_FIELDS)[number]["key"];

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const numberValue = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined || Number.isNaN(value)
    ? "No data"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "No data"
    : new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value);

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const monthLabel = (dataset: MonthlyDataset | null | undefined) =>
  dataset ? `${MONTHS[dataset.month - 1]} ${dataset.year}` : "No month selected";

const datasetLabel = (dataset: MonthlyDataset | null | undefined) =>
  dataset ? `${MONTHS[dataset.month - 1]} ${dataset.year} (${dataset.startDate} to ${dataset.endDate})` : "No month selected";

const dateForDay = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const getCustomerId = (record: Pick<CustomerRecord, "phoneNumber" | "email" | "customerName">) =>
  record.email
    ? `email:${normalize(record.email)}`
    : record.phoneNumber
      ? `phone:${normalize(record.phoneNumber)}`
      : `name:${normalize(record.customerName)}`;

const getBucket = (orders: number) => {
  if (orders <= 0) return "0 Orders";
  if (orders >= 5) return "5+ Orders";
  return `${orders} ${orders === 1 ? "Order" : "Orders"}`;
};

const summarizeDataset = (
  dataset: Omit<MonthlyDataset, "totalRecords" | "totalOrders" | "activeCustomers" | "frequency" | "status"> & {
    status?: MonthlyDataset["status"];
  },
): MonthlyDataset => {
  const customers = dataset.customers.map((customer) => ({
    ...customer,
    currentFrequencyBucket: getBucket(customer.ordersThisMonth),
  }));
  const totalOrders = customers.reduce((sum, customer) => sum + customer.ordersThisMonth, 0);
  const activeCustomers = customers.filter((customer) => customer.ordersThisMonth > 0).length;
  const complete = dataset.dataThroughDay >= daysInMonth(dataset.year, dataset.month);
  return {
    ...dataset,
    customers,
    totalRecords: customers.length,
    totalOrders,
    activeCustomers,
    frequency: activeCustomers ? totalOrders / activeCustomers : 0,
    status: dataset.status ?? (complete ? "complete" : "month-to-date"),
  };
};

function mergeCustomerRecords(records: CustomerRecord[]) {
  const merged = new Map<string, CustomerRecord>();
  records.forEach((record) => {
    const id = getCustomerId(record);
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, { ...record });
      return;
    }
    const existingDate = existing.lastOrderDate ? new Date(existing.lastOrderDate).getTime() : 0;
    const incomingDate = record.lastOrderDate ? new Date(record.lastOrderDate).getTime() : 0;
    merged.set(id, {
      ...existing,
      customerName: record.customerName || existing.customerName,
      phoneNumber: record.phoneNumber || existing.phoneNumber,
      email: record.email || existing.email,
      ordersThisMonth: existing.ordersThisMonth + record.ordersThisMonth,
      lifetimeOrders: existing.lifetimeOrders + record.lifetimeOrders,
      totalSpend: existing.totalSpend + record.totalSpend,
      lastOrderDate: incomingDate > existingDate ? record.lastOrderDate : existing.lastOrderDate,
    });
  });
  return [...merged.values()];
}

function buildTargetsForDataset(dataset: MonthlyDataset) {
  const actionTargets: ActionTarget[] = [];
  const grouped = new Map<string, string[]>();
  dataset.customers.forEach((customer) => {
    const customerId = getCustomerId(customer);
    const target = targetForOrders(customer.ordersThisMonth);
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
  const campaignTargetLists: CampaignTargetList[] = [...grouped].map(([targetAction, customerIds]) => ({
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
  }));
  return { actionTargets, campaignTargetLists };
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return cloudRequest<T>(path, options);
}

function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field");
  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
  return rows;
}

function parseDateCell(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function buildChecklist(headers: string[]) {
  const normalizedHeaders = headers.map(normalize);
  return REQUIRED_COLUMNS.map((column) => ({
    ...column,
    found: column.aliases.some((alias) => normalizedHeaders.includes(alias)),
  }));
}

function mapRecords(headers: string[], rows: unknown[][]) {
  const normalizedHeaders = headers.map(normalize);
  const indexFor = (column: RequiredColumn) =>
    normalizedHeaders.findIndex((header) => column.aliases.includes(header));

  return rows
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => {
      const record: CustomerRecord = {
        customerName: "",
        phoneNumber: "",
        email: "",
        ordersThisMonth: 0,
        lifetimeOrders: 0,
        totalSpend: 0,
        lastOrderDate: "",
      };
      REQUIRED_COLUMNS.forEach((column) => {
        const value = row[indexFor(column)];
        if (column.key === "ordersThisMonth" || column.key === "lifetimeOrders" || column.key === "totalSpend") {
          record[column.key] = numberValue(value);
        } else if (column.key === "lastOrderDate") {
          record[column.key] = parseDateCell(value);
        } else {
          record[column.key] = String(value ?? "").trim();
        }
      });
      return record;
    });
}

function getStats(dataset: MonthlyDataset | null) {
  if (!dataset) {
    return {
      totalCustomers: null,
      activeCustomers: null,
      totalOrders: null,
      frequency: null,
      totalSpend: null,
      bucketCounts: BUCKETS.map((bucket) => ({ bucket, customers: 0, orders: 0 })),
    };
  }
  const totalCustomers = dataset.customers.length;
  const totalOrders = dataset.customers.reduce((sum, customer) => sum + customer.ordersThisMonth, 0);
  const activeCustomers = dataset.customers.filter((customer) => customer.ordersThisMonth > 0).length;
  const totalSpend = dataset.customers.reduce((sum, customer) => sum + customer.totalSpend, 0);
  const bucketCounts = BUCKETS.map((bucket) => {
    const customers = dataset.customers.filter((customer) => getBucket(customer.ordersThisMonth) === bucket);
    return {
      bucket,
      customers: customers.length,
      orders: customers.reduce((sum, customer) => sum + customer.ordersThisMonth, 0),
    };
  });
  return {
    totalCustomers,
    activeCustomers,
    totalOrders,
    frequency: activeCustomers ? totalOrders / activeCustomers : 0,
    totalSpend,
    bucketCounts,
  };
}

function buildMovePlan(ordersNeeded: number, rows: TrendRow[]): {
  moves: BucketMove[];
  remainingOrders: number;
  newCustomersNeeded: number;
} {
  let remaining = Math.max(0, Math.ceil(ordersNeeded));
  const sourceBuckets = ["1 Order", "2 Orders", "3 Orders", "4 Orders"];
  const moves = sourceBuckets.map((bucket, index) => {
    const availableRows = rows
      .filter((row) => row.currentBucket === bucket)
      .sort((a, b) => a.ordersThisMonth - b.ordersThisMonth || b.totalSpend - a.totalSpend);
    const customers = Math.min(availableRows.length, remaining);
    remaining -= customers;
    return {
      from: bucket,
      to: index === 3 ? "5+ Orders" : `${index + 2} Orders`,
      customers,
      available: availableRows.length,
      orders: customers,
      rows: availableRows.slice(0, customers),
    };
  });
  return { moves, remainingOrders: remaining, newCustomersNeeded: Math.ceil(remaining / 2) };
}

function getTrendCategory(previousOrders: number | null, currentOrders: number): TrendCategory {
  if (previousOrders === 0 && currentOrders > 0) return "Reactivated";
  if (previousOrders !== null && previousOrders > 0 && currentOrders === 0) return "Newly Inactive";
  if (currentOrders === 1) return "One-Time Customer";
  if (previousOrders === null || currentOrders === previousOrders) return "Stable";
  return currentOrders > previousOrders ? "Growing" : "Declining";
}

function getRecommendedAction(row: Pick<TrendRow, "trendCategory" | "currentBucket" | "ordersThisMonth">) {
  if (row.trendCategory === "Declining") return "Win back lost frequency with a targeted reorder offer.";
  if (row.trendCategory === "Newly Inactive") return "Send urgent reactivation campaign.";
  if (row.trendCategory === "Reactivated") return "Push second purchase before month end.";
  if (row.currentBucket === "1 Order") return "Convert to 2 orders this month.";
  if (row.currentBucket === "2 Orders") return "Challenge customer to complete 3 orders.";
  if (row.currentBucket === "3 Orders") return "Send frequency booster toward 4 orders.";
  if (row.currentBucket === "4 Orders") return "Push to 5+ power user status.";
  if (row.currentBucket === "5+ Orders") return "Protect loyalty and offer referral or subscription.";
  return "Acquire first order this month.";
}

function targetForOrders(orders: number) {
  if (orders <= 0) return { targetOrders: 1, targetAction: "Activate customer", targetBucket: "1 Order" };
  if (orders === 1) return { targetOrders: 2, targetAction: "Move to 2 orders", targetBucket: "2 Orders" };
  if (orders === 2) return { targetOrders: 3, targetAction: "Move to 3 orders", targetBucket: "3 Orders" };
  if (orders === 3) return { targetOrders: 4, targetAction: "Move to 4 orders", targetBucket: "4 Orders" };
  if (orders === 4) return { targetOrders: 5, targetAction: "Move to 5+ orders", targetBucket: "5+ Orders" };
  return { targetOrders: orders, targetAction: "Retain / upsell / refer", targetBucket: "5+ Orders" };
}

function classifyJourney(previousOrders: number, targetOrders: number, currentOrders: number, existedBefore: boolean): JourneyResult {
  if (!existedBefore && currentOrders > 0) return "New Customer";
  if (previousOrders <= 0 && currentOrders > 0) return "Newly Activated";
  if (currentOrders < previousOrders) return "Data Issue";
  if (currentOrders >= targetOrders) return "Converted";
  if (currentOrders > previousOrders) return "Partially Progressed";
  return "No Movement";
}

function campaignSourceOrders(goal: string) {
  const moveMatch = goal.match(/Move\s+(\d+)\s+Orders?\s*→/i);
  if (moveMatch) return Number(moveMatch[1]);
  const textMoveMatch = goal.match(/(\d+)\s+Orders?\s+(?:to|→)\s+\d+\s+Orders?/i);
  if (textMoveMatch) return Number(textMoveMatch[1]);
  if (/First Order Conversion/i.test(goal)) return 0;
  return null;
}

function exactCampaignRows(rows: TrendRow[], goal: string) {
  const sourceOrders = campaignSourceOrders(goal);
  if (sourceOrders === null) return rows;
  const sourceBucket = getBucket(sourceOrders);
  return rows.filter((row) => row.ordersThisMonth === sourceOrders && row.currentBucket === sourceBucket);
}

function exactCampaignTargets(campaign: Campaign) {
  const sourceOrders = campaignSourceOrders(`${campaign.campaignGoal} ${campaign.campaignName} ${campaign.targetSegment}`);
  if (sourceOrders === null) return campaign.targetCustomers;
  const sourceBucket = getBucket(sourceOrders);
  return campaign.targetCustomers.filter(
    (target) => target.ordersAtCampaign === sourceOrders && target.bucketAtCampaign === sourceBucket,
  );
}

function newerSnapshotForCampaign(source: MonthlyDataset | undefined, datasets: MonthlyDataset[]) {
  if (!source) return null;
  return datasets
    .filter((dataset) => dataset.year === source.year && dataset.month === source.month && dataset.id !== source.id)
    .filter(
      (dataset) =>
        new Date(dataset.endDate).getTime() > new Date(source.endDate).getTime() ||
        dataset.dataThroughDay > source.dataThroughDay,
    )
    .sort(
      (a, b) =>
        new Date(a.endDate).getTime() - new Date(b.endDate).getTime() ||
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
    )
    .at(-1) ?? null;
}

function campaignSegmentLabel(result: Pick<CampaignResult, "campaign" | "targeted">) {
  return result.campaign.targetSegment.replace(/\(\s*[\d,]+\s+Customers?\s*\)/i, `(${formatNumber(result.targeted)} Customers)`);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function MiniMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-50">{value}</p>
      {helper ? <p className="mt-1 text-sm text-zinc-300">{helper}</p> : null}
    </div>
  );
}

function ProgressBar({ value, color = "bg-yellow-300" }: { value: number; color?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function CustomerIntelligencePlatform() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const now = new Date();
  const [datasets, setDatasets] = useState<MonthlyDataset[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [actionTargets, setActionTargets] = useState<ActionTarget[]>([]);
  const [campaignTargetLists, setCampaignTargetLists] = useState<CampaignTargetList[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [exportHistory, setExportHistory] = useState<Array<Record<string, unknown>>>([]);
  const [view, setView] = useState<"import" | "overview" | "trends" | "journeys" | "campaigns" | "exports">("overview");
  const [selectedId, setSelectedId] = useState<string>("");
  const [journeyFromId, setJourneyFromId] = useState("");
  const [journeyToId, setJourneyToId] = useState("");
  const [uploadMonth, setUploadMonth] = useState(now.getMonth() + 1);
  const [uploadYear, setUploadYear] = useState(now.getFullYear());
  const [dataThroughDay, setDataThroughDay] = useState(now.getDate());
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<CustomerRecord[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [saveConfirmation, setSaveConfirmation] = useState("");
  const [replaceDataset, setReplaceDataset] = useState<MonthlyDataset | null>(null);
  const [deleteDatasetTarget, setDeleteDatasetTarget] = useState<MonthlyDataset | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [targetOrders, setTargetOrders] = useState<number | null>(null);
  const [targetFrequency, setTargetFrequency] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [savingData, setSavingData] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [trendFilter, setTrendFilter] = useState<TrendCategory | "All">("All");
  const [bucketFilter, setBucketFilter] = useState<string>("All");
  const [ordersFilter, setOrdersFilter] = useState<string>("All");
  const [phoneFilter, setPhoneFilter] = useState(false);
  const [emailFilter, setEmailFilter] = useState(false);
  const [minSpend, setMinSpend] = useState("");
  const [maxSpend, setMaxSpend] = useState("");
  const [lastOrderAfter, setLastOrderAfter] = useState("");
  const [sortKey, setSortKey] = useState<"ordersThisMonth" | "ordersPreviousMonth" | "lifetimeOrders" | "totalSpend" | "lastOrderDate">("ordersThisMonth");
  const [searchTerm, setSearchTerm] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRows, setExportRows] = useState<TrendRow[]>([]);
  const [exportTitle, setExportTitle] = useState("Campaign List");
  const [selectedFields, setSelectedFields] = useState<ExportFieldKey[]>(EXPORT_FIELDS.map((field) => field.key));
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState("");
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignRows, setCampaignRows] = useState<TrendRow[]>([]);
  const [campaignSegment, setCampaignSegment] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("SMS");
  const [campaignGoal, setCampaignGoal] = useState("Move 1 Order → 2 Orders");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

  useEffect(() => {
    let active = true;
    const loadBackendState = async () => {
      setLoadingData(true);
      setBackendError("");
      try {
        const state = await apiRequest<BackendState>("/state");
        if (!active) return;
        const loadedDatasets = state.datasets.map((dataset) => summarizeDataset(dataset)).sort(
          (a, b) =>
            a.year - b.year ||
            a.month - b.month ||
            new Date(a.endDate).getTime() - new Date(b.endDate).getTime() ||
            new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
        );
        setDatasets(loadedDatasets);
        setGoals(state.goals);
        setActionTargets(state.actionTargets ?? []);
        setCampaignTargetLists(state.campaignTargetLists ?? []);
        setCampaigns(state.campaigns ?? []);
        setExportHistory(state.exportHistory ?? []);
        const latest = loadedDatasets.at(-1);
        if (latest) {
          setSelectedId((current) => current || latest.id);
          setJourneyToId((current) => current || latest.id);
          setJourneyFromId((current) => current || (loadedDatasets.at(-2)?.id ?? ""));
          const goal = state.goals.find((item) => item.id === `${latest.year}-${String(latest.month).padStart(2, "0")}`);
          setTargetOrders(goal?.targetOrders ?? null);
          setTargetFrequency(goal?.targetFrequency ?? null);
        }
      } catch {
        if (active) setBackendError("Cloud storage could not be loaded. Check the Supabase connection and database migration.");
      } finally {
        if (active) setLoadingData(false);
      }
    };
    void loadBackendState();
    return () => {
      active = false;
    };
  }, []);

  const sortedDatasets = useMemo(
    () =>
      [...datasets].sort(
        (a, b) =>
          a.year - b.year ||
          a.month - b.month ||
          new Date(a.endDate).getTime() - new Date(b.endDate).getTime() ||
          new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
      ),
    [datasets],
  );
  const selectedDataset = sortedDatasets.find((dataset) => dataset.id === selectedId) ?? sortedDatasets.at(-1) ?? null;
  const previousDataset = selectedDataset
    ? sortedDatasets.slice(0, sortedDatasets.findIndex((dataset) => dataset.id === selectedDataset.id)).at(-1) ?? null
    : null;
  const stats = useMemo(() => getStats(selectedDataset), [selectedDataset]);
  const checklist = useMemo(() => buildChecklist(headers), [headers]);
  const allColumnsFound = checklist.length > 0 && checklist.every((column) => column.found);
  const monthDays = daysInMonth(uploadYear, uploadMonth);
  const uploadStartDate = dateForDay(uploadYear, uploadMonth, 1);
  const uploadEndDate = dateForDay(uploadYear, uploadMonth, Math.min(dataThroughDay, monthDays));
  const uploadPeriodId = `${uploadYear}-${String(uploadMonth).padStart(2, "0")}-01-${String(Math.min(dataThroughDay, monthDays)).padStart(2, "0")}`;
  const existingUploadMonth = datasets.find((dataset) => dataset.id === uploadPeriodId) ?? null;
  const selectedMonthDays = selectedDataset ? daysInMonth(selectedDataset.year, selectedDataset.month) : null;
  const coveragePercent =
    selectedDataset && selectedMonthDays ? (selectedDataset.dataThroughDay / selectedMonthDays) * 100 : null;
  const projectedOrders =
    selectedDataset && stats.totalOrders !== null && selectedDataset.dataThroughDay
      ? Math.round((stats.totalOrders / selectedDataset.dataThroughDay) * daysInMonth(selectedDataset.year, selectedDataset.month))
      : null;
  const requiredActiveCustomers =
    targetOrders && targetFrequency ? Math.ceil(targetOrders / targetFrequency) : null;
  const ordersNeeded = targetOrders && stats.totalOrders !== null ? Math.max(0, targetOrders - stats.totalOrders) : null;
  const frequencyNeeded =
    targetFrequency && stats.frequency !== null ? Math.max(0, targetFrequency - stats.frequency) : null;

  useEffect(() => {
    if (!selectedDataset || loadingData) return;
    const goal = goals.find((item) => item.id === `${selectedDataset.year}-${String(selectedDataset.month).padStart(2, "0")}`);
    setTargetOrders(goal?.targetOrders ?? null);
    setTargetFrequency(goal?.targetFrequency ?? null);
  }, [goals, loadingData, selectedDataset?.id]);

  useEffect(() => {
    if (!selectedDataset || loadingData) return;
    if (targetOrders === null && targetFrequency === null) return;
    const goalId = `${selectedDataset.year}-${String(selectedDataset.month).padStart(2, "0")}`;
    const timeout = window.setTimeout(() => {
      void apiRequest<BackendState>(`/goals/${goalId}`, {
        method: "PUT",
        body: JSON.stringify({
          targetMonth: selectedDataset.month,
          targetYear: selectedDataset.year,
          targetOrders,
          targetFrequency,
          requiredActiveCustomers,
        }),
      })
        .then((state) => setGoals(state.goals))
        .catch(() => setBackendError("Goal settings could not be saved to backend storage."));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [loadingData, requiredActiveCustomers, selectedDataset, targetFrequency, targetOrders]);
  const trendRows = useMemo<TrendRow[]>(() => {
    if (!selectedDataset) return [];
    const baselineMap = new Map<string, CustomerRecord>();
    previousDataset?.customers.forEach((customer) => baselineMap.set(getCustomerId(customer), customer));
    return selectedDataset.customers.map((customer) => {
      const previous = baselineMap.get(getCustomerId(customer));
      const previousOrders = previous ? previous.ordersThisMonth : null;
      const currentOrders = customer.ordersThisMonth;
      const trendCategory = getTrendCategory(previousOrders, currentOrders);
      const currentBucket = getBucket(currentOrders);
      const row = {
        ...customer,
        id: getCustomerId(customer),
        ordersPreviousMonth: previousOrders ?? 0,
        previousOrders,
        currentOrders,
        trendCategory,
        currentBucket,
        change: previousOrders === null ? null : currentOrders - previousOrders,
      };
      return { ...row, recommendedAction: getRecommendedAction(row) };
    });
  }, [previousDataset, selectedDataset]);

  const movePlan = useMemo(
    () => buildMovePlan(ordersNeeded ?? 0, trendRows),
    [ordersNeeded, trendRows],
  );

  const filteredTrendRows = useMemo(() => {
    const search = normalize(searchTerm);
    const filtered = trendRows.filter((row) => {
      const matchesFilter = trendFilter === "All" || row.trendCategory === trendFilter;
      const matchesBucket = bucketFilter === "All" || row.currentBucket === bucketFilter;
      const matchesOrders =
        ordersFilter === "All" ||
        (ordersFilter === "5+" ? row.ordersThisMonth >= 5 : row.ordersThisMonth === Number(ordersFilter));
      const matchesPhone = !phoneFilter || Boolean(row.phoneNumber);
      const matchesEmail = !emailFilter || Boolean(row.email);
      const min = minSpend ? Number(minSpend) : null;
      const max = maxSpend ? Number(maxSpend) : null;
      const matchesSpend = (min === null || row.totalSpend >= min) && (max === null || row.totalSpend <= max);
      const rowDate = row.lastOrderDate ? new Date(row.lastOrderDate).getTime() : 0;
      const minDate = lastOrderAfter ? new Date(lastOrderAfter).getTime() : null;
      const matchesDate = minDate === null || rowDate >= minDate;
      const matchesSearch =
        !search ||
        normalize(`${row.customerName} ${row.phoneNumber} ${row.email}`).includes(search);
      return matchesFilter && matchesBucket && matchesOrders && matchesPhone && matchesEmail && matchesSpend && matchesDate && matchesSearch;
    });
    return filtered.sort((a, b) => {
      if (sortKey === "lastOrderDate") return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
      return Number(b[sortKey]) - Number(a[sortKey]);
    });
  }, [bucketFilter, emailFilter, lastOrderAfter, maxSpend, minSpend, ordersFilter, phoneFilter, searchTerm, sortKey, trendFilter, trendRows]);

  const historicalTargets = useMemo(() => {
    const activeBuckets = ["1 Order", "2 Orders", "3 Orders", "4 Orders", "5+ Orders"];
    const historical = sortedDatasets.filter((dataset) => dataset.id !== selectedDataset?.id);
    const averagePercent = activeBuckets.map((bucket) => {
      if (!historical.length) return { bucket, percent: 0 };
      const totalPercent = historical.reduce((sum, dataset) => {
        const datasetStats = getStats(dataset);
        const active = datasetStats.activeCustomers ?? 0;
        const count = datasetStats.bucketCounts.find((item) => item.bucket === bucket)?.customers ?? 0;
        return sum + (active ? count / active : 0);
      }, 0);
      return { bucket, percent: totalPercent / historical.length };
    });
    const historicalAverageFrequency = historical.length
      ? historical.reduce((sum, dataset) => sum + (getStats(dataset).frequency ?? 0), 0) / historical.length
      : targetFrequency ?? stats.frequency ?? 0;
    const requiredActive = targetOrders && historicalAverageFrequency
      ? Math.ceil(targetOrders / historicalAverageFrequency)
      : requiredActiveCustomers ?? 0;
    return averagePercent.map(({ bucket, percent }) => {
      const requiredCustomers = Math.ceil(requiredActive * percent);
      const currentCustomers = stats.bucketCounts.find((item) => item.bucket === bucket)?.customers ?? 0;
      const multiplier = bucket === "5+ Orders" ? 5 : Number(bucket.slice(0, 1));
      const gap = Math.max(0, requiredCustomers - currentCustomers);
      return {
        bucket,
        percent,
        requiredCustomers,
        currentCustomers,
        gap,
        progress: requiredCustomers ? (currentCustomers / requiredCustomers) * 100 : 0,
        expectedOrders: requiredCustomers * multiplier,
        rows: trendRows.filter((row) => row.currentBucket === bucket),
      };
    });
  }, [requiredActiveCustomers, selectedDataset?.id, sortedDatasets, stats.bucketCounts, stats.frequency, targetFrequency, targetOrders, trendRows]);

  const journeyFromSnapshot = sortedDatasets.find((dataset) => dataset.id === journeyFromId) ?? sortedDatasets.at(-2) ?? null;
  const journeyToSnapshot = sortedDatasets.find((dataset) => dataset.id === journeyToId) ?? sortedDatasets.at(-1) ?? null;

  const journeyRows = useMemo<JourneyRow[]>(() => {
    if (!journeyFromSnapshot || !journeyToSnapshot) return [];
    const previousMap = new Map<string, CustomerRecord>();
    const currentMap = new Map<string, CustomerRecord>();
    journeyFromSnapshot.customers.forEach((customer) => previousMap.set(getCustomerId(customer), customer));
    journeyToSnapshot.customers.forEach((customer) => currentMap.set(getCustomerId(customer), customer));
    const ids = new Set([...previousMap.keys(), ...currentMap.keys()]);
    return [...ids].map((customerId) => {
      const previous = previousMap.get(customerId);
      const current = currentMap.get(customerId);
      const previousOrders = previous?.ordersThisMonth ?? 0;
      const currentOrders = current?.ordersThisMonth ?? 0;
      const target = actionTargets.find((item) => item.snapshotId === journeyFromSnapshot.id && item.customerId === customerId) ?? targetForOrders(previousOrders);
      const result = classifyJourney(previousOrders, target.targetOrders, currentOrders, Boolean(previous));
      return {
        customerId,
        customerName: current?.customerName || previous?.customerName || "Unnamed customer",
        phoneNumber: current?.phoneNumber || previous?.phoneNumber || "",
        email: current?.email || previous?.email || "",
        previousOrders,
        targetOrders: target.targetOrders,
        currentOrders,
        movement: currentOrders - previousOrders,
        result,
        recommendedNextAction:
          result === "Converted"
            ? "Move to the next frequency target or retain."
            : result === "Partially Progressed"
              ? "Follow up while momentum is active."
              : result === "Newly Activated" || result === "New Customer"
                ? "Push second order before the month ends."
                : result === "Data Issue"
                  ? "Review upload consistency for this customer."
                  : "Send follow-up campaign from original target list.",
      };
    });
  }, [actionTargets, journeyFromSnapshot, journeyToSnapshot]);

  const journeySummary = useMemo(() => {
    const count = (result: JourneyResult) => journeyRows.filter((row) => row.result === result).length;
    const converted = count("Converted");
    const targeted = journeyRows.filter((row) => row.previousOrders > 0 || row.targetOrders > 1).length;
    const extraOrders = journeyRows.reduce((sum, row) => sum + Math.max(0, row.movement), 0);
    return {
      targeted,
      converted,
      partiallyProgressed: count("Partially Progressed"),
      noMovement: count("No Movement"),
      newlyActivated: count("Newly Activated") + count("New Customer"),
      extraOrders,
      conversionRate: targeted ? (converted / targeted) * 100 : 0,
    };
  }, [journeyRows]);

  const campaignPerformance = useMemo(() => {
    if (!journeyFromSnapshot) return [];
    return campaignTargetLists
      .filter((list) => list.snapshotId === journeyFromSnapshot.id)
      .map((list) => {
        const rows = journeyRows.filter((row) => list.customerIds.includes(row.customerId));
        const converted = rows.filter((row) => row.result === "Converted");
        const notConverted = rows.filter((row) => row.result !== "Converted");
        const extraOrders = rows.reduce((sum, row) => sum + Math.max(0, row.movement), 0);
        return {
          ...list,
          rows,
          converted,
          notConverted,
          conversionRate: rows.length ? (converted.length / rows.length) * 100 : 0,
          extraOrders,
        };
      });
  }, [campaignTargetLists, journeyFromSnapshot, journeyRows]);

  const customerTimelines = useMemo(() => {
    const byCustomer = new Map<string, { customerName: string; points: Array<{ label: string; orders: number }> }>();
    sortedDatasets.forEach((dataset) => {
      dataset.customers.forEach((customer) => {
        const id = getCustomerId(customer);
        const existing = byCustomer.get(id) ?? { customerName: customer.customerName || "Unnamed customer", points: [] };
        existing.points.push({ label: `${MONTHS[dataset.month - 1]} 1-${dataset.dataThroughDay}`, orders: customer.ordersThisMonth });
        byCustomer.set(id, existing);
      });
    });
    return [...byCustomer.entries()].slice(0, 8);
  }, [sortedDatasets]);

  const campaignResults = useMemo<CampaignResult[]>(() => {
    return campaigns.map((campaign) => {
      const source = sortedDatasets.find((dataset) => dataset.id === campaign.snapshotId);
      const latest = newerSnapshotForCampaign(source, sortedDatasets);
      const hasComparisonData = Boolean(source && latest);
      const latestMap = new Map<string, CustomerRecord>();
      latest?.customers.forEach((customer) => latestMap.set(getCustomerId(customer), customer));
      const targetCustomers = exactCampaignTargets(campaign);
      const rows = targetCustomers.map((target) => {
        if (!hasComparisonData) {
          return {
            customerName: target.customerName,
            phoneNumber: target.phoneNumber,
            email: target.email,
            ordersBefore: target.ordersAtCampaign,
            ordersAfter: 0,
            movement: 0,
            result: "Pending Measurement",
            recommendedNextAction: "Upload a newer snapshot for this month to measure campaign performance.",
            revenueMovement: 0,
          };
        }
        const current = latestMap.get(target.customerId);
        const after = current?.ordersThisMonth;
        const movement = after === undefined ? 0 : after - target.ordersAtCampaign;
        const expectedTarget = target.targetOrders ?? targetForOrders(target.ordersAtCampaign).targetOrders;
        const result =
          after === undefined
            ? "Data Mismatch"
            : after === 0 && target.ordersAtCampaign > 0
              ? "Newly Inactive"
              : after > expectedTarget
                ? "Exceeded Target"
                : after >= expectedTarget
                  ? "Converted"
                  : movement > 0
                    ? "Partially Progressed"
                    : "No Movement";
        return {
          customerName: target.customerName,
          phoneNumber: target.phoneNumber,
          email: target.email,
          ordersBefore: target.ordersAtCampaign,
          ordersAfter: after ?? 0,
          movement,
          result,
          recommendedNextAction:
            result === "Converted" || result === "Exceeded Target"
              ? "Move to the next frequency campaign."
              : result === "Partially Progressed"
                ? "Send momentum follow-up."
                : result === "Data Mismatch"
                  ? "Check latest uploaded snapshot."
                  : "Retarget this customer.",
          revenueMovement: current ? Math.max(0, current.totalSpend - target.totalSpendAtCampaign) : 0,
        };
      });
      const converted = hasComparisonData ? rows.filter((row) => row.result === "Converted").length : 0;
      const exceeded = hasComparisonData ? rows.filter((row) => row.result === "Exceeded Target").length : 0;
      const status: CampaignStatus = hasComparisonData ? "Measuring" : "Waiting For New Snapshot";
      return {
        campaign,
        targeted: targetCustomers.length,
        converted,
        exceeded,
        progressing: hasComparisonData ? rows.filter((row) => row.result === "Partially Progressed").length : 0,
        noMovement: hasComparisonData ? rows.filter((row) => row.result === "No Movement").length : 0,
        newlyInactive: hasComparisonData ? rows.filter((row) => row.result === "Newly Inactive").length : 0,
        dataMismatch: hasComparisonData ? rows.filter((row) => row.result === "Data Mismatch").length : 0,
        conversionRate: hasComparisonData && targetCustomers.length ? ((converted + exceeded) / targetCustomers.length) * 100 : null,
        extraOrders: hasComparisonData ? rows.reduce((sum, row) => sum + Math.max(0, row.movement), 0) : 0,
        revenueGenerated: hasComparisonData ? rows.reduce((sum, row) => sum + row.revenueMovement, 0) : 0,
        hasComparisonData,
        comparisonSnapshotLabel: latest ? datasetLabel(latest) : null,
        status,
        measurementMessage: hasComparisonData
          ? `Measured against ${datasetLabel(latest)}.`
          : `This campaign was created from the ${source ? datasetLabel(source) : campaign.snapshotLabel} snapshot. Upload a newer ${source ? MONTHS[source.month - 1] : "monthly"} snapshot to begin measuring performance.`,
        rows,
      };
    });
  }, [campaigns, sortedDatasets]);

  const campaignKpis = useMemo(() => {
    const thisMonth = selectedDataset ? `${selectedDataset.year}-${selectedDataset.month}` : "";
    const monthCampaigns = campaignResults.filter((result) => {
      const source = sortedDatasets.find((dataset) => dataset.id === result.campaign.snapshotId);
      return source ? `${source.year}-${source.month}` === thisMonth : true;
    });
    const targeted = monthCampaigns.reduce((sum, result) => sum + result.targeted, 0);
    const converted = monthCampaigns.reduce((sum, result) => sum + result.converted + result.exceeded, 0);
    const measuredCampaigns = monthCampaigns.filter((result) => result.hasComparisonData && result.conversionRate !== null);
    const measuredTargeted = measuredCampaigns.reduce((sum, result) => sum + result.targeted, 0);
    const best = [...measuredCampaigns].sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0))[0];
    const worst = [...measuredCampaigns].sort((a, b) => (a.conversionRate ?? 0) - (b.conversionRate ?? 0))[0];
    return {
      campaignsRun: monthCampaigns.length,
      targeted,
      converted,
      conversionRate: measuredTargeted ? (converted / measuredTargeted) * 100 : null,
      ordersGenerated: monthCampaigns.reduce((sum, result) => sum + result.extraOrders, 0),
      revenueGenerated: monthCampaigns.reduce((sum, result) => sum + result.revenueGenerated, 0),
      best: best?.campaign.campaignName ?? "No campaigns",
      worst: worst?.campaign.campaignName ?? "No campaigns",
    };
  }, [campaignResults, selectedDataset, sortedDatasets]);

  const selectedCampaignResult =
    campaignResults.find((result) => result.campaign.id === selectedCampaignId) ?? campaignResults[0] ?? null;
  const campaignEligibleRows = useMemo(
    () => exactCampaignRows(campaignRows, campaignGoal),
    [campaignGoal, campaignRows],
  );

  const monthlyTrendData = useMemo(
    () =>
      sortedDatasets.map((dataset) => {
        const datasetStats = getStats(dataset);
        return {
          month: `${MONTHS[dataset.month - 1].slice(0, 3)} ${dataset.year}`,
          orders: datasetStats.totalOrders ?? 0,
          frequency: Number((datasetStats.frequency ?? 0).toFixed(2)),
          active: datasetStats.activeCustomers ?? 0,
        };
      }),
    [sortedDatasets],
  );

  const validationWarnings = useMemo(() => {
    const seen = new Set<string>();
    let duplicateRows = 0;
    previewRows.forEach((row) => {
      const id = getCustomerId(row);
      if (seen.has(id)) duplicateRows += 1;
      seen.add(id);
    });
    return [
      { label: "Missing phone numbers", count: previewRows.filter((row) => !row.phoneNumber).length },
      { label: "Duplicate rows to merge", count: duplicateRows },
      { label: "Invalid dates", count: previewRows.filter((row) => row.lastOrderDate && Number.isNaN(new Date(row.lastOrderDate).getTime())).length },
      { label: "Empty order counts", count: previewRows.filter((row) => row.ordersThisMonth === null || Number.isNaN(row.ordersThisMonth)).length },
      { label: "Invalid numeric values", count: previewRows.filter((row) => row.ordersThisMonth < 0 || row.lifetimeOrders < 0 || row.totalSpend < 0).length },
    ];
  }, [previewRows]);

  const applyBackendState = (state: BackendState) => {
    const nextDatasets = state.datasets.map((dataset) => summarizeDataset(dataset)).sort(
      (a, b) =>
        a.year - b.year ||
        a.month - b.month ||
        new Date(a.endDate).getTime() - new Date(b.endDate).getTime() ||
        new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
    );
    setDatasets(nextDatasets);
    setGoals(state.goals);
    setActionTargets(state.actionTargets ?? []);
    setCampaignTargetLists(state.campaignTargetLists ?? []);
    setCampaigns(state.campaigns ?? []);
    setExportHistory(state.exportHistory ?? []);
    return nextDatasets;
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setUploadMessage("");
    setSaveConfirmation("");
    try {
      if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error("Unsupported file type");
      if (file.size > 25 * 1024 * 1024) throw new Error("File exceeds 25 MB");
      let rows: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        rows = parseCsv(text);
      } else {
        rows = await readSheet(file);
      }
      const [headerRow = [], ...bodyRows] = rows;
      const nextHeaders = headerRow.map((cell) => String(cell ?? "").trim());
      setHeaders(nextHeaders);
      setPreviewRows(mapRecords(nextHeaders, bodyRows));
      setUploadMessage(`${file.name} loaded. Review the checklist before importing.`);
    } catch {
      setHeaders([]);
      setPreviewRows([]);
      setUploadMessage("The file could not be read. Please upload a CSV or XLSX file.");
    }
  };

  const commitImport = async (mode: "prompt" | "snapshot" | "replace" = "prompt") => {
    if (!allColumnsFound) {
      setUploadMessage("Add all required columns before importing this file.");
      return;
    }
    if (previewRows.length === 0) {
      setUploadMessage("This file does not contain any customer rows to import.");
      return;
    }
    const blockingWarnings = validationWarnings.filter(
      (warning) => !["Missing phone numbers", "Duplicate rows to merge"].includes(warning.label) && warning.count > 0,
    );
    if (blockingWarnings.length) {
      setUploadMessage(`Fix validation issues before importing: ${blockingWarnings.map((warning) => warning.label).join(", ")}.`);
      return;
    }
    const nowIso = new Date().toISOString();
    const snapshotId =
      existingUploadMonth && mode === "snapshot"
        ? `${uploadPeriodId}-snapshot-${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}`
        : uploadPeriodId;
    const dataset = summarizeDataset({
      id: snapshotId,
      month: uploadMonth,
      year: uploadYear,
      startDate: uploadStartDate,
      endDate: uploadEndDate,
      dataThroughDay: Math.min(dataThroughDay, monthDays),
      fileName: fileName || "Uploaded customer file",
      uploadedAt: nowIso,
      customers: mergeCustomerRecords(previewRows),
    });
    if (existingUploadMonth && mode === "prompt") {
      setReplaceDataset(existingUploadMonth);
      return;
    }
    setSavingData(true);
    setBackendError("");
    setSaveConfirmation("");
    setUploadMessage("Saving customer records to Supabase...");
    try {
      const result = await apiRequest<DatasetSaveResult>(`/datasets/${encodeURIComponent(dataset.id)}`, {
        method: "PUT",
        body: JSON.stringify(dataset),
      });
      const savedDataset = { ...dataset, id: result.datasetId };
      const nextTargets = buildTargetsForDataset(savedDataset);
      setDatasets((current) =>
        [...current.filter((item) => item.id !== savedDataset.id), savedDataset].sort(
          (a, b) =>
            a.year - b.year ||
            a.month - b.month ||
            new Date(a.endDate).getTime() - new Date(b.endDate).getTime() ||
            new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
        ),
      );
      setActionTargets((current) => [
        ...current.filter((item) => item.snapshotId !== savedDataset.id),
        ...nextTargets.actionTargets,
      ]);
      setCampaignTargetLists((current) => [
        ...current.filter((item) => item.snapshotId !== savedDataset.id),
        ...nextTargets.campaignTargetLists,
      ]);
      setSelectedId(savedDataset.id);
      setView("overview");
      const duplicateCount = previewRows.length - savedDataset.customers.length;
      const confirmation = `${datasetLabel(savedDataset)} saved permanently with ${formatNumber(savedDataset.totalRecords)} customer records${duplicateCount ? `; ${formatNumber(duplicateCount)} duplicate rows were merged` : ""}.`;
      setUploadMessage(confirmation);
      setSaveConfirmation(confirmation);
      setReplaceDataset(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The dataset could not be saved to Supabase.";
      setBackendError(message);
      setUploadMessage(`Import failed: ${message}`);
    } finally {
      setSavingData(false);
    }
  };

  const deleteDataset = async (id: string) => {
    const target = datasets.find((dataset) => dataset.id === id);
    if (!target || deleteConfirmText !== "DELETE") return;
    setSavingData(true);
    setBackendError("");
    try {
      const state = await apiRequest<BackendState>(`/datasets/${encodeURIComponent(id)}?confirm=DELETE`, { method: "DELETE" });
      const next = applyBackendState(state);
      if (selectedId === id) setSelectedId(next.at(-1)?.id ?? "");
      setDeleteDatasetTarget(null);
      setDeleteConfirmText("");
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "The dataset could not be deleted from Supabase.");
    } finally {
      setSavingData(false);
    }
  };

  const openExport = (rows: TrendRow[], title: string) => {
    setExportRows(rows);
    setExportTitle(title);
    setExportSuccess("");
    setExportOpen(true);
  };

  const downloadFullBackup = async () => {
    setExporting(true);
    setBackendError("");
    try {
      const backup = await apiRequest<Record<string, unknown>>("/backup");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `customer-intelligence-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setExportSuccess("Complete Supabase backup downloaded.");
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "The cloud backup could not be created.");
    } finally {
      setExporting(false);
    }
  };

  const openCampaignModal = (rows: TrendRow[], segment: string, goal = "Move 1 Order → 2 Orders") => {
    setCampaignRows(rows);
    setCampaignSegment(segment);
    setCampaignGoal(goal);
    setCampaignName(`${segment} Campaign`);
    setCampaignModalOpen(true);
  };

  const saveCampaign = async () => {
    const frozenRows = exactCampaignRows(campaignRows, campaignGoal);
    if (!selectedDataset || !frozenRows.length || !campaignName.trim()) return;
    setSavingData(true);
    setBackendError("");
    const campaign: Omit<Campaign, "updatedAt"> = {
      id: crypto.randomUUID(),
      campaignName: campaignName.trim(),
      campaignType,
      campaignGoal,
      targetSegment: `${campaignSegment} (${formatNumber(campaignRows.length)} Customers)`,
      snapshotId: selectedDataset.id,
      snapshotLabel: datasetLabel(selectedDataset),
      campaignDate: new Date().toISOString(),
      status: "Waiting For New Snapshot",
      createdAt: new Date().toISOString(),
      targetCustomers: frozenRows.map((row) => {
        const target = targetForOrders(row.ordersThisMonth);
        return {
          customerId: row.id,
          customerName: row.customerName,
          phoneNumber: row.phoneNumber,
          email: row.email,
          ordersAtCampaign: row.ordersThisMonth,
          bucketAtCampaign: row.currentBucket,
          targetOrders: target.targetOrders,
          targetBucket: target.targetBucket,
          totalSpendAtCampaign: row.totalSpend,
        };
      }),
    };
    try {
      const state = await apiRequest<BackendState>("/campaigns", {
        method: "POST",
        body: JSON.stringify(campaign),
      });
      applyBackendState(state);
      setCampaigns(state.campaigns ?? []);
      setSelectedCampaignId(campaign.id);
      setCampaignModalOpen(false);
      setView("campaigns");
    } catch {
      setBackendError("Campaign could not be saved to backend storage.");
    } finally {
      setSavingData(false);
    }
  };

  const exportCampaignRows = (rows: CampaignResult["rows"], title: string) => {
    if (!rows.length) return;
    const header = ["Customer Name", "Phone", "Email", "Orders Before", "Orders After", "Movement", "Result", "Recommended Next Action"];
    const body = rows.map((row) =>
      [row.customerName, row.phoneNumber, row.email, row.ordersBefore, row.ordersAfter, row.movement, row.result, row.recommendedNextAction]
        .map(csvEscape)
        .join(","),
    );
    const csv = [header.map(csvEscape).join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportCampaignReport = (result: CampaignResult | null) => {
    if (!result) return;
    const rows = result.rows.map((row) => ({
      ...row,
      campaignName: result.campaign.campaignName,
      targetSegment: result.campaign.targetSegment,
      campaignType: result.campaign.campaignType,
      campaignGoal: result.campaign.campaignGoal,
      snapshotSource: result.campaign.snapshotLabel,
    }));
    const header = ["Campaign Name", "Target Segment", "Type", "Goal", "Snapshot Source", "Customer Name", "Phone", "Email", "Orders Before", "Orders After", "Movement", "Result", "Recommended Next Action"];
    const body = rows.map((row) =>
      [row.campaignName, row.targetSegment, row.campaignType, row.campaignGoal, row.snapshotSource, row.customerName, row.phoneNumber, row.email, row.ordersBefore, row.ordersAfter, row.movement, row.result, row.recommendedNextAction]
        .map(csvEscape)
        .join(","),
    );
    const csv = [header.map(csvEscape).join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${result.campaign.campaignName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const viewCustomers = (bucket: string, rows: TrendRow[]) => {
    setBucketFilter(bucket);
    setTrendFilter("All");
    setOrdersFilter("All");
    setSearchTerm("");
    setView("trends");
    setExportRows(rows);
    setExportTitle(`${bucket} Customers`);
  };

  const applyQuickFilter = (filter: TrendCategory | string) => {
    if (BUCKETS.includes(filter)) {
      setBucketFilter(filter);
      setTrendFilter("All");
      setOrdersFilter("All");
    } else {
      setTrendFilter(filter as TrendCategory);
      setBucketFilter("All");
      setOrdersFilter("All");
    }
  };

  const runExport = () => {
    const rowsToExport = exportRows.length ? exportRows : filteredTrendRows;
    if (!selectedDataset || selectedFields.length === 0 || rowsToExport.length === 0) return;
    setExporting(true);
    setExportSuccess("");
    window.setTimeout(() => {
      const fieldMap = new Map(EXPORT_FIELDS.map((field) => [field.key, field.label]));
      const header = selectedFields.map((field) => fieldMap.get(field) ?? field);
      const body = rowsToExport.map((row) =>
        selectedFields.map((field) => csvEscape(row[field])).join(","),
      );
      const csv = [header.map(csvEscape).join(","), ...body].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${monthLabel(selectedDataset).replace(/\s+/g, "-").toLowerCase()}-${exportTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      void apiRequest<BackendState>("/export-history", {
        method: "POST",
        body: JSON.stringify({
          datasetId: selectedDataset.id,
          title: exportTitle,
          rowCount: rowsToExport.length,
          fields: selectedFields,
        }),
      }).catch(() => undefined);
      setExporting(false);
      setExportSuccess(`${rowsToExport.length} customers exported.`);
    }, 550);
  };

  const exportJourneyRows = (rows: JourneyRow[], title: string) => {
    if (!journeyToSnapshot || !rows.length) return;
    const header = [
      "Customer Name",
      "Phone Number",
      "Email",
      "Previous Orders",
      "Target Orders",
      "Current Orders",
      "Movement",
      "Result",
      "Recommended Next Action",
    ];
    const body = rows.map((row) =>
      [
        row.customerName,
        row.phoneNumber,
        row.email,
        row.previousOrders,
        row.targetOrders,
        row.currentOrders,
        row.movement,
        row.result,
        row.recommendedNextAction,
      ].map(csvEscape).join(","),
    );
    const csv = [header.map(csvEscape).join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${datasetLabel(journeyToSnapshot).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    void apiRequest<BackendState>("/export-history", {
      method: "POST",
      body: JSON.stringify({
        datasetId: journeyToSnapshot.id,
        title,
        rowCount: rows.length,
        fields: header,
      }),
    }).catch(() => undefined);
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-zinc-800 p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <Badge status={loadingData ? "neutral" : selectedDataset ? "good" : "warning"}>{loadingData ? "Loading saved data" : selectedDataset ? "Backend data loaded" : "Waiting for data"}</Badge>
                <h2 className="mt-4 text-3xl font-semibold text-zinc-50">Customer Intelligence Platform</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
                  Plan month-to-date frequency growth, see which customers need to move deeper in the funnel, and export targeted campaign lists.
                </p>
              </div>
              <Button
                className="h-12 shrink-0 border-yellow-300 bg-yellow-300 px-5 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950"
                onClick={() => setView("import")}
              >
                <Upload className="h-4 w-4" /> Import CSV/XLSX
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                ["overview", "Dashboard"],
                ["trends", "Customer Profiles"],
                ["campaigns", "Campaign Intelligence"],
                ["exports", "Exports"],
                ["import", "Data Library"],
                ["journeys", "Customer Journey Tracker"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    view === key
                      ? "border-yellow-300 bg-yellow-300 text-zinc-950"
                      : "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-yellow-300/50"
                  }`}
                  onClick={() => setView(key as typeof view)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6 lg:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="MTD Orders" value={formatNumber(stats.totalOrders)} />
            <MiniMetric label="Active Customers" value={formatNumber(stats.activeCustomers)} />
            <MiniMetric label="Frequency" value={stats.frequency === null ? "No data" : stats.frequency.toFixed(2)} />
            <MiniMetric label="Coverage" value={coveragePercent === null ? "No data" : `${Math.round(coveragePercent)}%`} helper={selectedDataset ? `Through day ${selectedDataset.dataThroughDay}` : undefined} />
          </div>
        </div>
      </Card>

      {loadingData ? (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-50">Loading saved customer data</h3>
              <p className="mt-1 text-sm text-zinc-300">Fetching uploaded months, goals, customer records, and dashboard summaries from backend storage.</p>
            </div>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent" />
          </div>
        </Card>
      ) : null}

      {backendError ? (
        <Card className="border-red-400/30 bg-red-950/30 p-5">
          <div className="flex items-start gap-3 text-red-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Backend storage issue</p>
              <p className="mt-1 text-sm text-red-100/80">{backendError}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {saveConfirmation ? (
        <Card className="border-emerald-400/30 bg-emerald-950/30 p-5">
          <div className="flex items-start gap-3 text-emerald-100">
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Import saved</p>
              <p className="mt-1 text-sm text-emerald-100/80">{saveConfirmation}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {view === "import" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Import Center</h3>
                <p className="mt-1 text-sm text-zinc-300">Upload a calendar month, even when the month is still in progress.</p>
              </div>
              <Button className="border-yellow-300 bg-yellow-300 text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet className="h-4 w-4" /> Choose File
              </Button>
            </div>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Month</span>
                <select className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={uploadMonth} onChange={(event) => setUploadMonth(Number(event.target.value))}>
                  {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Year</span>
                <input className="h-12 w-full rounded-xl border border-yellow-300/40 bg-zinc-900 px-3 text-zinc-50 outline-none focus:border-yellow-300" type="number" value={uploadYear} onChange={(event) => setUploadYear(Number(event.target.value))} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Data Through Day</span>
                <input className="h-12 w-full rounded-xl border border-yellow-300/40 bg-zinc-900 px-3 text-zinc-50 outline-none focus:border-yellow-300" min={1} max={monthDays} type="number" value={dataThroughDay} onChange={(event) => setDataThroughDay(Number(event.target.value))} />
              </label>
            </div>
            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-50">{fileName || "No file selected"}</p>
                  <p className="text-sm text-zinc-300">{uploadMessage || "CSV and XLSX imports are supported."}</p>
                </div>
                <Badge status={allColumnsFound ? "good" : "warning"}>{allColumnsFound ? "Ready to import" : "Columns required"}</Badge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {checklist.length ? checklist.map((column) => (
                  <div key={column.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${column.found ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-red-400/30 bg-red-400/10 text-red-100"}`}>
                    {column.found ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    {column.label}
                  </div>
                )) : REQUIRED_COLUMNS.map((column) => (
                  <div key={column.label} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-300">
                    <X className="h-4 w-4" /> {column.label}
                  </div>
                ))}
              </div>
              {!allColumnsFound && checklist.length ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm text-yellow-100">
                  <AlertTriangle className="h-4 w-4" /> Some required columns are missing. Please update your file before importing.
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  className="border-yellow-300 bg-yellow-300 px-5 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!allColumnsFound || previewRows.length === 0 || savingData}
                  onClick={() => void commitImport()}
                >
                  {savingData ? "Saving to Backend..." : "Import and Save Permanently"}
                </Button>
                {existingUploadMonth ? <Badge status="warning">Data already exists for this month and date range</Badge> : null}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-5">
              {validationWarnings.map((warning) => (
                <MiniMetric key={warning.label} label={warning.label} value={formatNumber(warning.count)} />
              ))}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Monthly Data Library</h3>
            <p className="mt-1 text-sm text-zinc-300">Calendar months are stored separately so trends can be compared over time.</p>
            <div className="mt-5 space-y-3">
              {sortedDatasets.length ? sortedDatasets.map((dataset) => {
                const datasetStats = getStats(dataset);
                const complete = dataset.dataThroughDay >= daysInMonth(dataset.year, dataset.month);
                return (
                  <div key={dataset.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-50">{datasetLabel(dataset)}</p>
                        <p className="text-sm text-zinc-300">{dataset.fileName} • Uploaded {new Date(dataset.uploadedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge status={complete ? "good" : "warning"}>{dataset.status === "complete" ? "Complete" : "Month-to-date"}</Badge>
                        <button className="rounded-lg border border-zinc-800 p-2 text-zinc-300 hover:border-red-300/50 hover:text-red-200" onClick={() => setDeleteDatasetTarget(dataset)} aria-label={`Delete ${datasetLabel(dataset)}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-sm text-zinc-300">
                      <span>{formatNumber(dataset.totalRecords)} records</span>
                      <span>{formatNumber(datasetStats.totalOrders)} orders</span>
                      <span>{formatNumber(datasetStats.activeCustomers)} active</span>
                      <span>{datasetStats.frequency?.toFixed(2) ?? "0.00"} freq</span>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-300">No monthly uploads yet.</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {view === "overview" && !loadingData && !datasets.length ? (
        <Card className="p-8 text-center">
          <h3 className="text-2xl font-semibold text-zinc-50">No customer data has been uploaded yet.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-300">Import your first dataset to begin. Once uploaded, it will be saved in backend storage and will reload automatically after refreshes or app updates.</p>
          <Button className="mt-5 border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => setView("import")}>
            <Upload className="h-4 w-4" /> Import First Dataset
          </Button>
        </Card>
      ) : null}

      {view === "overview" && !loadingData && Boolean(datasets.length) ? (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr]">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Dashboard Month</span>
                <select className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={selectedDataset?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
                  <option value="">No imported month</option>
                  {sortedDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{monthLabel(dataset)}</option>)}
                </select>
              </label>
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Previous Month</span>
                <div className="flex h-12 items-center rounded-xl border border-yellow-300/40 bg-zinc-900 px-3 text-zinc-50">
                  {monthLabel(previousDataset)}
                </div>
              </div>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Target Orders</span>
                <input className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-zinc-50 outline-none focus:border-yellow-300" placeholder="Enter target" type="number" value={targetOrders ?? ""} onChange={(event) => setTargetOrders(event.target.value ? Number(event.target.value) : null)} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Target Frequency</span>
                <input className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-zinc-50 outline-none focus:border-yellow-300" placeholder="Enter target" type="number" step="0.1" value={targetFrequency ?? ""} onChange={(event) => setTargetFrequency(event.target.value ? Number(event.target.value) : null)} />
              </label>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-zinc-50">Frequency Funnel</h3>
                  <p className="mt-1 text-sm text-zinc-300">Core growth model: move customers from one order bucket to the next.</p>
                </div>
                <Badge status={ordersNeeded ? "warning" : "good"}>{ordersNeeded === null ? "Set targets" : `${formatNumber(ordersNeeded)} orders needed`}</Badge>
              </div>
              <div className="mt-5 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.bucketCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} />
                    <Bar dataKey="customers" radius={[8, 8, 0, 0]}>
                      {stats.bucketCounts.map((_, index) => <Cell key={BUCKET_COLORS[index]} fill={BUCKET_COLORS[index]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {stats.bucketCounts.map((bucket, index) => {
                  const percent = stats.totalCustomers ? (bucket.customers / stats.totalCustomers) * 100 : 0;
                  const plan = movePlan.moves.find((move) => move.from === bucket.bucket);
                  return (
                    <div key={bucket.bucket} className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-zinc-50">{bucket.bucket}</p>
                        <span className="h-3 w-3 rounded-full" style={{ background: BUCKET_COLORS[index] }} />
                      </div>
                      <p className="mt-3 text-2xl font-semibold text-zinc-50">{formatNumber(bucket.customers)}</p>
                      <p className="text-sm text-zinc-300">{formatNumber(bucket.orders)} orders • {Math.round(percent)}% of base</p>
                      <div className="mt-3"><ProgressBar value={percent} color="bg-yellow-300" /></div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button className="h-8 px-2 text-xs" disabled={!bucket.customers} onClick={() => viewCustomers(bucket.bucket, trendRows.filter((row) => row.currentBucket === bucket.bucket))}>View</Button>
                        <Button className="h-8 px-2 text-xs" disabled={!bucket.customers} onClick={() => openExport(trendRows.filter((row) => row.currentBucket === bucket.bucket), `${bucket.bucket} Bucket`)}>Export</Button>
                        <Button className="h-8 px-2 text-xs" disabled={!bucket.customers} onClick={() => openCampaignModal(trendRows.filter((row) => row.currentBucket === bucket.bucket), `${bucket.bucket} Bucket`, bucket.bucket === "0 Orders" ? "First Order Conversion" : `Move ${bucket.bucket} → ${getBucket(bucket.bucket === "5+ Orders" ? 5 : Number(bucket.bucket.slice(0, 1)) + 1)}`)}>Create Campaign</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h3 className="text-xl font-semibold text-zinc-50">Actionable Insights</h3>
              <div className="mt-5 space-y-4">
                <MiniMetric label="Projected Orders" value={formatNumber(projectedOrders)} helper={selectedDataset ? "Based on uploaded days so far" : undefined} />
                <MiniMetric label="Required Active Customers" value={formatNumber(requiredActiveCustomers)} helper={targetFrequency ? `At ${targetFrequency.toFixed(1)} frequency` : "Set target frequency"} />
                <MiniMetric label="Frequency Gap" value={frequencyNeeded === null ? "No data" : frequencyNeeded.toFixed(2)} />
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Close the order gap</p>
                  <div className="mt-4 space-y-3">
                    {movePlan.moves.filter((move) => move.customers > 0).map((move) => (
                      <div key={move.from} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                        <p className="text-sm text-zinc-300">
                          <span className="font-semibold text-zinc-50">{formatNumber(move.customers)} customers</span> currently have {move.from.toLowerCase()} this month. To stay on track, convert them to {move.to.toLowerCase()} before month end.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button className="h-8 px-2 text-xs" onClick={() => viewCustomers(move.from, move.rows)}>View Customers</Button>
                          <Button className="h-8 px-2 text-xs" onClick={() => openExport(move.rows, `${move.from} to ${move.to}`)}>Export Customers</Button>
                          <Button className="h-8 px-2 text-xs" onClick={() => openCampaignModal(move.rows, `${move.from} to ${move.to}`, `Move ${move.from} → ${move.to}`)}>Create Campaign</Button>
                        </div>
                      </div>
                    ))}
                    {movePlan.newCustomersNeeded > 0 ? (
                      <div className="rounded-lg border border-yellow-300/30 bg-yellow-300/10 p-3 text-sm text-yellow-100">
                        Existing base cannot close the full gap with one-step moves. Recommend acquiring {formatNumber(movePlan.newCustomersNeeded)} new customers at average frequency 2.0.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h3 className="text-xl font-semibold text-zinc-50">Month-to-Date Progress</h3>
              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-2 flex justify-between text-sm"><span className="text-zinc-300">Order target progress</span><span className="text-zinc-50">{targetOrders ? `${Math.round(((stats.totalOrders ?? 0) / targetOrders) * 100)}%` : "Set target"}</span></div>
                  <ProgressBar value={targetOrders ? ((stats.totalOrders ?? 0) / targetOrders) * 100 : 0} />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm"><span className="text-zinc-300">Frequency target progress</span><span className="text-zinc-50">{targetFrequency && stats.frequency !== null ? `${Math.round((stats.frequency / targetFrequency) * 100)}%` : "Set target"}</span></div>
                  <ProgressBar value={targetFrequency && stats.frequency !== null ? (stats.frequency / targetFrequency) * 100 : 0} color="bg-sky-300" />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm"><span className="text-zinc-300">Uploaded days</span><span className="text-zinc-50">{coveragePercent === null ? "No data" : `${Math.round(coveragePercent)}%`}</span></div>
                  <ProgressBar value={coveragePercent ?? 0} color="bg-emerald-300" />
                </div>
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <h3 className="text-xl font-semibold text-zinc-50">Monthly Trends</h3>
              <div className="mt-5 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} />
                    <Line type="monotone" dataKey="orders" stroke="#facc15" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="active" stroke="#38bdf8" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Historical Bucket Target Model</h3>
                <p className="mt-1 text-sm text-zinc-300">Uses uploaded historical months to estimate the customer distribution needed for the monthly order goal.</p>
              </div>
              <Badge status={targetOrders ? "good" : "warning"}>{targetOrders ? `${formatNumber(targetOrders)} order goal` : "Set target orders"}</Badge>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead className="bg-zinc-900 text-xs uppercase tracking-[0.12em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Bucket</th>
                    <th className="px-4 py-3">Historical %</th>
                    <th className="px-4 py-3">Required Customers</th>
                    <th className="px-4 py-3">Current Customers</th>
                    <th className="px-4 py-3">Gap</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Expected Orders</th>
                    <th className="px-4 py-3">Export Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalTargets.map((row) => (
                    <tr key={row.bucket} className="border-t border-zinc-800">
                      <td className="px-4 py-3 font-semibold text-zinc-50">{row.bucket}</td>
                      <td className="px-4 py-3 text-zinc-300">{Math.round(row.percent * 100)}%</td>
                      <td className="px-4 py-3 text-zinc-300">{formatNumber(row.requiredCustomers)}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatNumber(row.currentCustomers)}</td>
                      <td className="px-4 py-3 text-yellow-100">{formatNumber(row.gap)}</td>
                      <td className="px-4 py-3">
                        <div className="w-32"><ProgressBar value={row.progress} /></div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{formatNumber(row.expectedOrders)}</td>
                      <td className="px-4 py-3">
                        <Button className="h-8 px-2 text-xs" disabled={!row.rows.length} onClick={() => openExport(row.rows, `${row.bucket} Target Model`)}>Export Bucket</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {view === "trends" && !loadingData && !datasets.length ? (
        <Card className="p-8 text-center">
          <h3 className="text-2xl font-semibold text-zinc-50">No customer profiles yet.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-300">Upload a dataset first. Trend profiles will reload from backend storage every time the dashboard opens.</p>
        </Card>
      ) : null}

      {view === "trends" && !loadingData && Boolean(datasets.length) ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-zinc-50">Customer Trend Profiles</h3>
              <p className="mt-1 text-sm text-zinc-300">Current = {monthLabel(selectedDataset)}. Previous = the immediately previous uploaded month, {monthLabel(previousDataset)}.</p>
            </div>
            <Button className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => openExport(filteredTrendRows, "Filtered Customer List")}>
              <Download className="h-4 w-4" /> Export Campaign List
            </Button>
            <Button className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => openCampaignModal(filteredTrendRows, trendFilter === "All" ? "Filtered Customers" : `${trendFilter} Customers`, trendFilter === "Newly Inactive" ? "Reactivate Dormant Customers" : "Frequency Growth Campaign")}>
              Create Campaign
            </Button>
          </div>
          <div className="mt-5 rounded-xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm leading-6 text-sky-50">
            <strong>Trend definitions:</strong> Growing means current orders are higher than the previous uploaded month. Declining means previous orders were higher than current orders. Stable means orders are equal. Newly Inactive means previous was above 0 and current is 0. Reactivated means previous was 0 and current is above 0.
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {["Declining", "Growing", "Stable", "Newly Inactive", "Reactivated"].map((chip) => (
              <button key={chip} className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 hover:border-yellow-300/50" onClick={() => applyQuickFilter(chip)}>{chip}</button>
            ))}
            {["1 Order", "2 Orders", "3 Orders", "4 Orders", "5+ Orders"].map((chip) => (
              <button key={chip} className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 hover:border-yellow-300/50" onClick={() => applyQuickFilter(chip)}>{chip} This Month</button>
            ))}
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_180px_180px_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
              <input className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-10 text-zinc-50 outline-none focus:border-yellow-300" placeholder="Search customers, phone, or email" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <label className="relative">
              <Filter className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
              <select className="h-12 w-full rounded-xl border border-yellow-300/35 bg-zinc-950 px-10 text-zinc-50 outline-none focus:border-yellow-300" value={trendFilter} onChange={(event) => setTrendFilter(event.target.value as typeof trendFilter)}>
                {["All", "Growing", "Declining", "Stable", "Reactivated", "Newly Inactive", "One-Time Customer"].map((filter) => <option key={filter}>{filter}</option>)}
              </select>
            </label>
            <label>
              <select className="h-12 w-full rounded-xl border border-yellow-300/35 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={bucketFilter} onChange={(event) => setBucketFilter(event.target.value)}>
                {["All", ...BUCKETS].map((filter) => <option key={filter}>{filter === "All" ? "All Buckets" : filter}</option>)}
              </select>
            </label>
            <label>
              <select className="h-12 w-full rounded-xl border border-yellow-300/35 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={ordersFilter} onChange={(event) => setOrdersFilter(event.target.value)}>
                {["All", "0", "1", "2", "3", "4", "5+"].map((filter) => <option key={filter} value={filter}>{filter === "All" ? "Any Orders" : `${filter} Orders This Month`}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-6">
            <input className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" placeholder="Min spend" type="number" value={minSpend} onChange={(event) => setMinSpend(event.target.value)} />
            <input className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" placeholder="Max spend" type="number" value={maxSpend} onChange={(event) => setMaxSpend(event.target.value)} />
            <input className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" type="date" value={lastOrderAfter} onChange={(event) => setLastOrderAfter(event.target.value)} />
            <select className="h-11 rounded-xl border border-yellow-300/35 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}>
              <option value="ordersThisMonth">Sort: Orders This Month</option>
              <option value="ordersPreviousMonth">Sort: Previous Orders</option>
              <option value="lifetimeOrders">Sort: Lifetime Orders</option>
              <option value="totalSpend">Sort: Total Spend</option>
              <option value="lastOrderDate">Sort: Last Order Date</option>
            </select>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-200"><input type="checkbox" checked={phoneFilter} onChange={(event) => setPhoneFilter(event.target.checked)} /> Has phone</label>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-200"><input type="checkbox" checked={emailFilter} onChange={(event) => setEmailFilter(event.target.checked)} /> Has email</label>
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-[0.12em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Current Orders</th>
                    <th className="px-4 py-3">Previous Orders</th>
                    <th className="px-4 py-3">Lifetime</th>
                    <th className="px-4 py-3">Spend</th>
                    <th className="px-4 py-3">Last Order</th>
                    <th className="px-4 py-3">Bucket</th>
                    <th className="px-4 py-3">Trend</th>
                    <th className="px-4 py-3">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrendRows.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-800">
                      <td className="px-4 py-3 font-semibold text-zinc-50">{row.customerName || "Unnamed customer"}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.phoneNumber || "Missing"}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.email || "Missing"}</td>
                      <td className="px-4 py-3 text-zinc-50">{formatNumber(row.currentOrders)}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.previousOrders === null ? "Not in previous" : formatNumber(row.previousOrders)}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatNumber(row.lifetimeOrders)}</td>
                      <td className="px-4 py-3 text-zinc-300">{formatCurrency(row.totalSpend)}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.lastOrderDate || "Missing"}</td>
                      <td className="px-4 py-3 text-yellow-100">{row.currentBucket}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-200">
                          {row.change !== null && row.change > 0 ? <ArrowUp className="h-3 w-3 text-emerald-300" /> : null}
                          {row.change !== null && row.change < 0 ? <ArrowDown className="h-3 w-3 text-red-300" /> : null}
                          {row.trendCategory}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{row.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredTrendRows.length ? <div className="p-8 text-center text-sm text-zinc-300">No customers match this view.</div> : null}
            </div>
          </div>
        </Card>
      ) : null}

      {view === "campaigns" && !loadingData && !datasets.length ? (
        <Card className="p-8 text-center">
          <h3 className="text-2xl font-semibold text-zinc-50">No customer data has been uploaded yet.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-300">Campaign Intelligence needs a saved dataset first. Import a snapshot, then create campaigns from frequency buckets or customer profile filters.</p>
          <Button className="mt-5 border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => setView("import")}>
            <Upload className="h-4 w-4" /> Import Dataset
          </Button>
        </Card>
      ) : null}

      {view === "campaigns" && !loadingData && Boolean(datasets.length) ? (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Campaign Intelligence</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-300">Measure every frequency campaign against newer snapshots without overwriting the original target list.</p>
              </div>
              <Button className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:opacity-40" disabled={!filteredTrendRows.length} onClick={() => openCampaignModal(filteredTrendRows, "Current Filtered Customers", "Frequency Growth Campaign")}>
                Create Campaign
              </Button>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <MiniMetric label="Campaigns Run" value={formatNumber(campaignKpis.campaignsRun)} helper={monthLabel(selectedDataset)} />
            <MiniMetric label="Customers Targeted" value={formatNumber(campaignKpis.targeted)} />
            <MiniMetric label="Converted" value={formatNumber(campaignKpis.converted)} />
            <MiniMetric label="Conversion Rate" value={campaignKpis.conversionRate === null ? "-" : `${Math.round(campaignKpis.conversionRate)}%`} />
            <MiniMetric label="Orders Generated" value={formatNumber(campaignKpis.ordersGenerated)} />
            <MiniMetric label="Revenue Generated" value={formatCurrency(campaignKpis.revenueGenerated)} />
            <MiniMetric label="Best Campaign" value={campaignKpis.best} helper={campaignKpis.worst === "No campaigns" ? undefined : `Watch: ${campaignKpis.worst}`} />
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Campaign Dashboard</h3>
                <p className="mt-1 text-sm text-zinc-300">Saved campaigns keep the exact customers, orders, buckets, and source snapshot from the moment the campaign was created.</p>
              </div>
              <Badge status={campaignResults.length ? "good" : "neutral"}>{formatNumber(campaignResults.length)} saved campaigns</Badge>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-[0.12em] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Campaign Name</th>
                      <th className="px-4 py-3">Target Segment</th>
                      <th className="px-4 py-3">Customers</th>
                      <th className="px-4 py-3">Converted</th>
                      <th className="px-4 py-3">Exceeded</th>
                      <th className="px-4 py-3">No Movement</th>
                      <th className="px-4 py-3">Conversion Rate</th>
                      <th className="px-4 py-3">Extra Orders</th>
                      <th className="px-4 py-3">Revenue</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignResults.map((result) => (
                      <tr key={result.campaign.id} className={`cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/70 ${selectedCampaignResult?.campaign.id === result.campaign.id ? "bg-yellow-300/10" : ""}`} onClick={() => setSelectedCampaignId(result.campaign.id)}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-zinc-50">{result.campaign.campaignName}</p>
                          <p className="mt-1 text-xs text-zinc-400">{new Date(result.campaign.campaignDate).toLocaleDateString()} • {result.campaign.campaignType}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{campaignSegmentLabel(result)}</td>
                        <td className="px-4 py-3 text-zinc-50">{formatNumber(result.targeted)}</td>
                        <td className="px-4 py-3 text-emerald-200">{result.hasComparisonData ? formatNumber(result.converted) : "-"}</td>
                        <td className="px-4 py-3 text-sky-200">{result.hasComparisonData ? formatNumber(result.exceeded) : "-"}</td>
                        <td className="px-4 py-3 text-zinc-300">{result.hasComparisonData ? formatNumber(result.noMovement) : "-"}</td>
                        <td className="px-4 py-3 text-yellow-100">{result.conversionRate === null ? "-" : `${Math.round(result.conversionRate)}%`}</td>
                        <td className="px-4 py-3 text-zinc-50">{formatNumber(result.extraOrders)}</td>
                        <td className="px-4 py-3 text-zinc-300">{formatCurrency(result.revenueGenerated)}</td>
                        <td className="px-4 py-3"><Badge status={result.hasComparisonData ? "good" : "warning"}>{result.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!campaignResults.length ? <div className="p-8 text-center text-sm text-zinc-300">No campaigns have been created yet. Use a frequency bucket, growth gap, or profile filter to create the first campaign.</div> : null}
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-zinc-50">Campaign Detail</h3>
                  <p className="mt-1 text-sm text-zinc-300">{selectedCampaignResult ? selectedCampaignResult.campaign.snapshotLabel : "Select a campaign to inspect customer-level movement."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-9 px-3 text-xs" disabled={!selectedCampaignResult} onClick={() => exportCampaignRows(selectedCampaignResult?.rows.filter((row) => row.result === "Converted") ?? [], "Converted Campaign Customers")}>Export Converted</Button>
                  <Button className="h-9 px-3 text-xs" disabled={!selectedCampaignResult} onClick={() => exportCampaignRows(selectedCampaignResult?.rows.filter((row) => row.result === "Exceeded Target") ?? [], "Exceeded Campaign Customers")}>Export Exceeded</Button>
                  <Button className="h-9 px-3 text-xs" disabled={!selectedCampaignResult} onClick={() => exportCampaignRows(selectedCampaignResult?.rows.filter((row) => row.result === "No Movement") ?? [], "No Movement Campaign Customers")}>Export No Movement</Button>
                  <Button className="h-9 px-3 text-xs border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:opacity-40" disabled={!selectedCampaignResult} onClick={() => exportCampaignReport(selectedCampaignResult)}>Export Report</Button>
                </div>
              </div>
              {selectedCampaignResult && !selectedCampaignResult.hasComparisonData ? (
                <div className="mt-5 rounded-xl border border-yellow-300/35 bg-yellow-300/10 p-4 text-sm leading-6 text-yellow-50">
                  <p className="font-semibold">Campaign measurement unavailable until a newer snapshot is uploaded.</p>
                  <p className="mt-1">{selectedCampaignResult.measurementMessage}</p>
                </div>
              ) : null}
              <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-[0.12em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Customer Name</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Orders Before</th>
                        <th className="px-4 py-3">Orders After</th>
                        <th className="px-4 py-3">Movement</th>
                        <th className="px-4 py-3">Result</th>
                        <th className="px-4 py-3">Recommended Next Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCampaignResult?.rows.map((row) => (
                        <tr key={`${row.email}-${row.phoneNumber}-${row.ordersBefore}`} className="border-t border-zinc-800">
                          <td className="px-4 py-3 font-semibold text-zinc-50">{row.customerName || "Unnamed customer"}</td>
                          <td className="px-4 py-3 text-zinc-300">{row.phoneNumber || "Missing"}</td>
                          <td className="px-4 py-3 text-zinc-300">{row.email || "Missing"}</td>
                          <td className="px-4 py-3 text-zinc-300">{formatNumber(row.ordersBefore)}</td>
                          <td className="px-4 py-3 text-zinc-50">{formatNumber(row.ordersAfter)}</td>
                          <td className={`px-4 py-3 font-semibold ${row.movement > 0 ? "text-emerald-200" : row.movement < 0 ? "text-red-200" : "text-zinc-300"}`}>{row.movement > 0 ? "+" : ""}{formatNumber(row.movement)}</td>
                          <td className="px-4 py-3"><Badge status={row.result === "Converted" || row.result === "Exceeded Target" ? "good" : row.result === "Data Mismatch" || row.result === "Newly Inactive" ? "danger" : row.result === "Partially Progressed" ? "warning" : "neutral"}>{row.result}</Badge></td>
                          <td className="px-4 py-3 text-zinc-300">{row.recommendedNextAction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!selectedCampaignResult ? <div className="p-8 text-center text-sm text-zinc-300">Create or select a campaign to see customer-level outcomes.</div> : null}
                </div>
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h3 className="text-xl font-semibold text-zinc-50">Campaign Leaderboard</h3>
              <div className="mt-5 space-y-3">
                {[...campaignResults].sort((a, b) => (b.conversionRate ?? -1) - (a.conversionRate ?? -1)).slice(0, 6).map((result, index) => (
                  <button key={result.campaign.id} className="w-full rounded-xl border border-zinc-800 bg-zinc-950/75 p-4 text-left hover:border-yellow-300/50" onClick={() => setSelectedCampaignId(result.campaign.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Rank {index + 1}</p>
                        <p className="mt-1 font-semibold text-zinc-50">{result.campaign.campaignName}</p>
                        <p className="mt-1 text-sm text-zinc-300">{formatNumber(result.extraOrders)} extra orders • {formatCurrency(result.revenueGenerated)}</p>
                      </div>
                      <Badge status={result.hasComparisonData && (result.conversionRate ?? 0) >= 30 ? "good" : result.hasComparisonData ? "warning" : "neutral"}>{result.conversionRate === null ? "Pending" : `${Math.round(result.conversionRate)}%`}</Badge>
                    </div>
                  </button>
                ))}
                {!campaignResults.length ? <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-300">The leaderboard appears after campaigns are saved.</div> : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {view === "exports" && !loadingData ? (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Exports</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-300">Export customer profiles, campaign result groups, or full campaign reports from saved backend snapshots.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button disabled={!filteredTrendRows.length} onClick={() => openExport(filteredTrendRows, "Current Customer Profile View")}>Export Current Customer View</Button>
              <Button disabled={!selectedCampaignResult} onClick={() => exportCampaignReport(selectedCampaignResult)}>Export Selected Campaign Report</Button>
              <Button className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:opacity-40" disabled={!filteredTrendRows.length} onClick={() => openCampaignModal(filteredTrendRows, "Current Export Filter", "Frequency Growth Campaign")}>Create Campaign From Current View</Button>
              <Button disabled={exporting} onClick={() => void downloadFullBackup()}><Download className="h-4 w-4" /> {exporting ? "Preparing Backup..." : "Download Full Backup"}</Button>
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Export History</h3>
            <div className="mt-5 space-y-3">
              {exportHistory.length ? exportHistory.slice().reverse().map((item, index) => (
                <div key={`${String(item.id ?? index)}`} className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
                  <p className="font-semibold text-zinc-50">{String(item.title ?? item.exportTitle ?? "Customer export")}</p>
                  <p className="mt-1 text-sm text-zinc-300">{String(item.exportedAt ?? "Saved export")} • {String(item.rowCount ?? item.records ?? "No")} records</p>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-300">No export history has been saved yet.</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {view === "journeys" && !loadingData && !datasets.length ? (
        <Card className="p-8 text-center">
          <h3 className="text-2xl font-semibold text-zinc-50">No snapshots available yet.</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-300">Upload cumulative date ranges such as June 1-2 and June 1-4. The platform will compare them and track who converted.</p>
          <Button className="mt-5 border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => setView("import")}>
            <Upload className="h-4 w-4" /> Import Snapshot
          </Button>
        </Card>
      ) : null}

      {view === "journeys" && !loadingData && Boolean(datasets.length) ? (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Customer Journey Tracker</h3>
                <p className="mt-1 text-sm text-zinc-300">Compare cumulative snapshots to see who added orders after being targeted.</p>
              </div>
              <Badge status={journeyFromSnapshot && journeyToSnapshot ? "good" : "warning"}>
                {journeyFromSnapshot && journeyToSnapshot ? "Snapshot comparison ready" : "Select two snapshots"}
              </Badge>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Compare Snapshot A</span>
                <select className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={journeyFromSnapshot?.id ?? ""} onChange={(event) => setJourneyFromId(event.target.value)}>
                  <option value="">Select starting snapshot</option>
                  {sortedDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{datasetLabel(dataset)}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Compare Snapshot B</span>
                <select className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={journeyToSnapshot?.id ?? ""} onChange={(event) => setJourneyToId(event.target.value)}>
                  <option value="">Select latest snapshot</option>
                  {sortedDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{datasetLabel(dataset)}</option>)}
                </select>
              </label>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <MiniMetric label="Targeted Customers" value={formatNumber(journeySummary.targeted)} />
            <MiniMetric label="Converted" value={formatNumber(journeySummary.converted)} />
            <MiniMetric label="Partially Progressed" value={formatNumber(journeySummary.partiallyProgressed)} />
            <MiniMetric label="No Movement" value={formatNumber(journeySummary.noMovement)} />
            <MiniMetric label="Newly Activated" value={formatNumber(journeySummary.newlyActivated)} />
            <MiniMetric label="Extra Orders" value={formatNumber(journeySummary.extraOrders)} />
            <MiniMetric label="Conversion Rate" value={`${Math.round(journeySummary.conversionRate)}%`} />
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Journey Breakdown</h3>
                <p className="mt-1 text-sm text-zinc-300">Shows previous orders, target orders, current orders, movement, result, and next action.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="h-9 px-3 text-xs" onClick={() => exportJourneyRows(journeyRows.filter((row) => row.result === "Converted"), "Converted Customers")}>Export Converted</Button>
                <Button className="h-9 px-3 text-xs" onClick={() => exportJourneyRows(journeyRows.filter((row) => row.result === "No Movement"), "No Movement Customers")}>Export No Movement</Button>
                <Button className="h-9 px-3 text-xs" onClick={() => exportJourneyRows(journeyRows.filter((row) => row.result === "Partially Progressed"), "Partially Progressed Customers")}>Export Partial</Button>
                <Button className="h-9 px-3 text-xs" onClick={() => exportJourneyRows(journeyRows.filter((row) => row.result === "Newly Activated" || row.result === "New Customer"), "Newly Activated Customers")}>Export Newly Activated</Button>
                <Button className="h-9 px-3 text-xs border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950" onClick={() => exportJourneyRows(journeyRows, "Full Journey Report")}>Export Full Report</Button>
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-[0.12em] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Customer Name</th>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Previous Orders</th>
                      <th className="px-4 py-3">Target Orders</th>
                      <th className="px-4 py-3">Current Orders</th>
                      <th className="px-4 py-3">Movement</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3">Recommended Next Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journeyRows.map((row) => (
                      <tr key={row.customerId} className="border-t border-zinc-800">
                        <td className="px-4 py-3 font-semibold text-zinc-50">{row.customerName}</td>
                        <td className="px-4 py-3 text-zinc-300">{row.phoneNumber || "Missing"}</td>
                        <td className="px-4 py-3 text-zinc-300">{row.email || "Missing"}</td>
                        <td className="px-4 py-3 text-zinc-300">{formatNumber(row.previousOrders)}</td>
                        <td className="px-4 py-3 text-yellow-100">{formatNumber(row.targetOrders)}</td>
                        <td className="px-4 py-3 text-zinc-50">{formatNumber(row.currentOrders)}</td>
                        <td className={`px-4 py-3 font-semibold ${row.movement > 0 ? "text-emerald-200" : row.movement < 0 ? "text-red-200" : "text-zinc-300"}`}>{row.movement > 0 ? "+" : ""}{formatNumber(row.movement)}</td>
                        <td className="px-4 py-3"><Badge status={row.result === "Converted" ? "good" : row.result === "Data Issue" ? "danger" : row.result === "No Movement" ? "warning" : "neutral"}>{row.result}</Badge></td>
                        <td className="px-4 py-3 text-zinc-300">{row.recommendedNextAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!journeyRows.length ? <div className="p-8 text-center text-sm text-zinc-300">Select two snapshots from the same month to compare customer movement.</div> : null}
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Campaign Accountability</h3>
            <p className="mt-1 text-sm text-zinc-300">Every generated target list from Snapshot A is measured against Snapshot B.</p>
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {campaignPerformance.length ? campaignPerformance.map((list) => (
                <div key={list.id} className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-50">{list.targetAction}</p>
                      <p className="mt-1 text-sm text-zinc-300">{formatNumber(list.rows.length)} targeted • {formatNumber(list.extraOrders)} extra orders generated</p>
                    </div>
                    <Badge status={list.conversionRate >= 30 ? "good" : list.conversionRate > 0 ? "warning" : "neutral"}>{Math.round(list.conversionRate)}% converted</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-zinc-300">
                    <span>{formatNumber(list.converted.length)} converted</span>
                    <span>{formatNumber(list.notConverted.length)} not converted</span>
                    <span>{formatNumber(list.extraOrders)} extra orders</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="h-8 px-2 text-xs" onClick={() => exportJourneyRows(list.converted, `${list.targetAction} Converted`)}>Export Converted List</Button>
                    <Button className="h-8 px-2 text-xs" onClick={() => exportJourneyRows(list.notConverted, `${list.targetAction} Not Converted`)}>Export Not Converted List</Button>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-300">No saved campaign target lists exist for the selected starting snapshot yet.</div>
              )}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Customer-Level Timeline</h3>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {customerTimelines.length ? customerTimelines.map(([customerId, timeline]) => (
                <div key={customerId} className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
                  <p className="font-semibold text-zinc-50">{timeline.customerName}</p>
                  <div className="mt-3 space-y-2">
                    {timeline.points.map((point) => (
                      <div key={`${customerId}-${point.label}`} className="flex justify-between gap-3 text-sm">
                        <span className="text-zinc-300">{point.label}</span>
                        <span className="font-semibold text-zinc-50">{formatNumber(point.orders)} orders</span>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-300">Customer timelines appear after snapshots are uploaded.</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {replaceDataset ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <Card className="w-full max-w-lg p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Data already exists for this period.</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Do you want to create a new snapshot or replace the existing one? Creating a new snapshot is safer and keeps history for {datasetLabel(replaceDataset)}.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button disabled={savingData} onClick={() => setReplaceDataset(null)}>Cancel</Button>
              <Button disabled={savingData} className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:opacity-40" onClick={() => void commitImport("snapshot")}>
                {savingData ? "Saving..." : "Create New Snapshot"}
              </Button>
              <Button disabled={savingData} className="border-red-300/60 text-red-100 hover:border-red-300 hover:text-red-50 disabled:opacity-40" onClick={() => void commitImport("replace")}>
                {savingData ? "Replacing..." : "Replace Existing Data"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {deleteDatasetTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <Card className="w-full max-w-lg p-6">
            <h3 className="text-xl font-semibold text-zinc-50">Permanently delete this data?</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Are you sure you want to permanently delete this data? This action cannot be undone. A database backup is created first, but this dataset will be removed from the active library.
            </p>
            <label className="mt-5 block text-sm font-semibold text-zinc-200" htmlFor="delete-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              className="mt-2 h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-50 outline-none focus:border-red-300"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder="DELETE"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={savingData} onClick={() => { setDeleteDatasetTarget(null); setDeleteConfirmText(""); }}>Cancel</Button>
              <Button disabled={savingData || deleteConfirmText !== "DELETE"} className="border-red-300 bg-red-400 font-semibold text-zinc-950 hover:bg-red-300 hover:text-zinc-950 disabled:opacity-40" onClick={() => void deleteDataset(deleteDatasetTarget.id)}>
                {savingData ? "Deleting..." : "Delete Permanently"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {campaignModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <Card className="w-full max-w-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Create Campaign</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-300">This preserves the exact target customers from the selected snapshot for future conversion tracking.</p>
              </div>
              <button className="rounded-lg border border-zinc-800 p-2 text-zinc-300 hover:text-zinc-50" onClick={() => setCampaignModalOpen(false)} aria-label="Close campaign modal"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Campaign Name</span>
                <input className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Second Order Push" />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Campaign Type</span>
                <select className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={campaignType} onChange={(event) => setCampaignType(event.target.value as CampaignType)}>
                  {["SMS", "Push Notification", "WhatsApp", "Email", "Manual Outreach"].map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-yellow-200">Campaign Goal</span>
                <select className="h-12 w-full rounded-xl border border-yellow-300/45 bg-zinc-950 px-3 text-zinc-50 outline-none focus:border-yellow-300" value={campaignGoal} onChange={(event) => setCampaignGoal(event.target.value)}>
                  {[campaignGoal, "Move 1 Order → 2 Orders", "Move 2 Orders → 3 Orders", "Move 3 Orders → 4 Orders", "Move 4 Orders → 5+ Orders", "Reactivate Dormant Customers", "First Order Conversion", "Plus Subscription Conversion", "Referral"].filter((value, index, values) => values.indexOf(value) === index).map((goal) => <option key={goal}>{goal}</option>)}
                </select>
              </label>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Target Segment</p>
                <p className="mt-2 font-semibold text-zinc-50">{campaignSegment || "No segment selected"}</p>
                <p className="mt-1 text-sm text-zinc-300">{formatNumber(campaignEligibleRows.length)} eligible customers will be saved in this frozen target list.</p>
                {campaignRows.length !== campaignEligibleRows.length ? (
                  <p className="mt-2 text-xs leading-5 text-yellow-100">{formatNumber(campaignRows.length - campaignEligibleRows.length)} customers were excluded because they do not match the selected campaign goal.</p>
                ) : null}
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Snapshot Source</p>
                <p className="mt-2 font-semibold text-zinc-50">{datasetLabel(selectedDataset)}</p>
                <p className="mt-1 text-sm text-zinc-300">Future uploads for this month will be compared against this saved baseline.</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm leading-6 text-sky-50">
              The saved campaign will include customer ids, phone, email, orders at campaign time, bucket at campaign time, target orders, target bucket, total spend, campaign date, and source snapshot.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={savingData} onClick={() => setCampaignModalOpen(false)}>Cancel</Button>
              <Button disabled={savingData || !campaignName.trim() || !campaignEligibleRows.length || !selectedDataset} className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:opacity-40" onClick={() => void saveCampaign()}>
                {savingData ? "Saving..." : "Save Campaign"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {exportOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <Card className="w-full max-w-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-zinc-50">Export Campaign List</h3>
                <p className="mt-1 text-sm text-zinc-300">Export {exportRows.length || filteredTrendRows.length} customers from: {exportTitle}.</p>
              </div>
              <button className="rounded-lg border border-zinc-800 p-2 text-zinc-300 hover:text-zinc-50" onClick={() => setExportOpen(false)} aria-label="Close export modal"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {EXPORT_FIELDS.map((field) => {
                const checked = selectedFields.includes(field.key);
                return (
                  <label key={field.key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-zinc-800 bg-zinc-900/80 text-zinc-300"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelectedFields((current) => checked ? current.filter((item) => item !== field.key) : [...current, field.key])}
                    />
                    {field.label}
                  </label>
                );
              })}
            </div>
            {exportSuccess ? <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{exportSuccess}</div> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setExportOpen(false)}>Close</Button>
              <Button className="border-yellow-300 bg-yellow-300 font-semibold text-zinc-950 hover:bg-yellow-200 hover:text-zinc-950 disabled:opacity-40" disabled={!selectedFields.length || exporting || !selectedDataset || !(exportRows.length || filteredTrendRows.length)} onClick={runExport}>
                {exporting ? "Preparing export..." : "Download CSV"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
