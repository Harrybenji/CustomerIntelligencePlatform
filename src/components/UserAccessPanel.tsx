import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card } from "./ui";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "user" | "super_admin";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  is_current_user: boolean;
};

type UserAccessPanelProps = {
  onClose: () => void;
};

export function UserAccessPanel({ onClose }: UserAccessPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    const { data, error: requestError } = await supabase.rpc("admin_list_users");
    if (requestError) setError(requestError.message);
    else setUsers((data ?? []) as AdminUser[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const updateUser = async (userId: string, status: AdminUser["status"], role?: AdminUser["role"]) => {
    setSavingId(userId);
    setError("");
    const { error: requestError } = await supabase.rpc("admin_set_user_access", {
      p_user_id: userId,
      p_status: status,
      p_role: role ?? null,
    });
    if (requestError) setError(requestError.message);
    else await loadUsers();
    setSavingId("");
  };

  const totals = useMemo(() => ({
    pending: users.filter((user) => user.status === "pending").length,
    approved: users.filter((user) => user.status === "approved").length,
    superAdmins: users.filter((user) => user.role === "super_admin" && user.status === "approved").length,
  }), [users]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 sm:p-6">
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <Card className="w-full overflow-hidden">
          <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5 sm:p-6">
            <div>
              <div className="flex items-center gap-2 text-yellow-200"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-semibold">Super Admin</span></div>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-50">User Access</h2>
              <p className="mt-1 text-sm text-zinc-300">Approve account requests and assign platform roles.</p>
            </div>
            <button className="rounded-lg border border-zinc-800 p-2 text-zinc-300 hover:border-zinc-600 hover:text-zinc-50" onClick={onClose} title="Close" type="button"><X className="h-4 w-4" /></button>
          </header>

          <div className="grid grid-cols-3 border-b border-zinc-800 bg-zinc-950/60">
            <div className="p-4"><p className="text-xs font-semibold text-zinc-500">Pending</p><p className="mt-1 text-xl font-semibold text-yellow-100">{totals.pending}</p></div>
            <div className="border-x border-zinc-800 p-4"><p className="text-xs font-semibold text-zinc-500">Approved</p><p className="mt-1 text-xl font-semibold text-emerald-200">{totals.approved}</p></div>
            <div className="p-4"><p className="text-xs font-semibold text-zinc-500">Super Admins</p><p className="mt-1 text-xl font-semibold text-sky-200">{totals.superAdmins}</p></div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-300">{users.length} account{users.length === 1 ? "" : "s"}</p>
              <Button disabled={loading} onClick={() => void loadUsers()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
            </div>
            {error ? <div className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}

            <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
              {users.map((user) => {
                const saving = savingId === user.id;
                return (
                  <div key={user.id} className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-zinc-50">{user.display_name || user.email}</p>
                        <Badge status={user.status === "approved" ? "good" : user.status === "pending" ? "warning" : "danger"}>{user.status}</Badge>
                        {user.role === "super_admin" ? <Badge status="neutral">Super Admin</Badge> : null}
                        {user.is_current_user ? <span className="text-xs text-zinc-500">You</span> : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-zinc-300">{user.email}</p>
                      <p className="mt-1 text-xs text-zinc-500">Requested {new Date(user.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {user.status !== "approved" ? (
                        <Button className="border-emerald-300/50 text-emerald-100 hover:border-emerald-300" disabled={saving} onClick={() => void updateUser(user.id, "approved", "user")}><UserCheck className="h-4 w-4" /> Approve</Button>
                      ) : null}
                      {!user.is_current_user && (user.status !== "approved" || user.role !== "super_admin") ? (
                        <Button disabled={saving} onClick={() => void updateUser(user.id, "approved", "super_admin")}><ShieldCheck className="h-4 w-4" /> Make Super Admin</Button>
                      ) : null}
                      {!user.is_current_user && user.status === "approved" && user.role === "super_admin" ? (
                        <Button disabled={saving} onClick={() => void updateUser(user.id, "approved", "user")}>Make User</Button>
                      ) : null}
                      {!user.is_current_user && user.status !== "rejected" ? (
                        <Button className="border-red-300/40 text-red-100 hover:border-red-300" disabled={saving} onClick={() => void updateUser(user.id, "rejected", user.role)}><UserX className="h-4 w-4" /> Reject</Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!loading && !users.length ? <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-300">No user accounts found.</div> : null}
              {loading && !users.length ? <div className="p-8 text-center text-sm text-zinc-300">Loading user access requests...</div> : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
