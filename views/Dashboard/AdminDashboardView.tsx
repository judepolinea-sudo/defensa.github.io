import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Activity,
  Settings,
  Database,
  LogOut,
  Search,
  CheckCircle,
  RefreshCcw,
  UserPlus,
  ShieldAlert,
  ChevronRight,
  HardDrive,
  Bell,
  X,
  Mail,
  ShieldCheck,
  GraduationCap,
  Loader2,
  FileUp,
  Zap,
  History,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  RotateCcw,
  UserX,
  Cpu,
  Lock,
  BookOpen,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { User, UserRole, USER_ROLE_LABELS, SCHOOLS, DEFAULT_SCHOOL, joinName } from "../../types";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ToastContainer, useToast } from "../components/Toast";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

interface Props {
  user: User;
  token: string | null;
  onLogout: () => void;
}

type Tab =
  | "health"
  | "users"
  | "pending"
  | "resets"
  | "sessions"
  | "projects"
  | "deleted"
  | "config";

const activityData = [
  { name: "Mon", api: 450 },
  { name: "Tue", api: 800 },
  { name: "Wed", api: 650 },
  { name: "Thu", api: 1200 },
  { name: "Fri", api: 1500 },
  { name: "Sat", api: 500 },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN:
    "border-red-200 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
  CAPSTONE_COORDINATOR:
    "border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-500/10",
  CAPSTONE_ADVISER:
    "border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-500/10",
  STUDENT:
    "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950",
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" },
  }),
};

function useAnimatedCounter(target: number, duration = 1000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }
    const startTime = performance.now();
    let rafId: number;
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return count;
}

const AdminDashboardView: React.FC<Props> = ({ user, token, onLogout }) => {
  const { toasts, dismissToast, toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("health");
  const [userSearch, setUserSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [maxUploadSize, setMaxUploadSize] = useState(30);

  const [users, setUsers] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<any | null>(null);

  const [newUser, setNewUser] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    password: "",
    role: UserRole.STUDENT as UserRole,
    program: "",
    yearLevel: "",
    school: DEFAULT_SCHOOL,
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      const data: any[] = await res.json();
      setUsers(data.filter((u) => !u.isDeleted));
    } catch {
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchPendingRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/registration-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setPendingRequests(await res.json());
    } catch {
      toast.error("Failed to load registration requests.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const [resetRequests, setResetRequests] = useState<any[]>([]);

  const fetchResetRequests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/password-reset-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setResetRequests(await res.json());
    } catch {
      /* non-fatal */
    }
  }, [token]);

  const fetchDeletedUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users?includeDeleted=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: any[] = await res.json();
      setDeletedUsers(data.filter((u) => u.isDeleted));
    } catch {
      toast.error("Failed to load deleted users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setSessions(await res.json());
    } catch {
      toast.error("Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setProjects(await res.json());
    } catch {
      toast.error("Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);

  const fetchOnlineUsers = useCallback(async () => {
    if (!token) return;
    setOnlineLoading(true);
    try {
      const res = await fetch("/api/admin/online-users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOnlineUsers(Array.isArray(data.users) ? data.users : []);
    } catch {
      /* non-fatal — presence list just stays as-is */
    } finally {
      setOnlineLoading(false);
    }
  }, [token]);

  // Poll the online-users list while the System Health tab is open.
  useEffect(() => {
    if (activeTab !== "health") return;
    fetchOnlineUsers();
    const id = setInterval(fetchOnlineUsers, 30_000);
    return () => clearInterval(id);
  }, [activeTab, fetchOnlineUsers]);

  useEffect(() => {
    if (activeTab === "users") fetchUsers();
    else if (activeTab === "pending") fetchPendingRequests();
    else if (activeTab === "resets") fetchResetRequests();
    else if (activeTab === "sessions") fetchSessions();
    else if (activeTab === "projects") fetchProjects();
    else if (activeTab === "deleted") fetchDeletedUsers();
  }, [activeTab, fetchUsers, fetchPendingRequests, fetchResetRequests, fetchSessions, fetchProjects, fetchDeletedUsers]);

  // Keep the sidebar badge counts current regardless of the active tab.
  useEffect(() => {
    fetchPendingRequests();
    fetchResetRequests();
  }, [fetchPendingRequests, fetchResetRequests]);

  const handleAddUser = async () => {
    const fullName = joinName(
      newUser.firstName,
      newUser.middleName,
      newUser.lastName,
    );
    if (
      !newUser.firstName.trim() ||
      !newUser.lastName.trim() ||
      !newUser.email ||
      !newUser.password ||
      !newUser.role
    ) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (newUser.role === UserRole.STUDENT && !newUser.program) {
      toast.error("Department is required for Student accounts.");
      return;
    }
    setActionLoading("add");
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          program: newUser.program,
          yearLevel: newUser.yearLevel,
          school: newUser.school,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create user");
      setIsAddUserOpen(false);
      setNewUser({
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        password: "",
        role: UserRole.STUDENT,
        program: "",
        yearLevel: "",
        school: DEFAULT_SCHOOL,
      });
      toast.success(`Account provisioned for ${newUser.email}`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Network error during user creation.");
    } finally {
      setActionLoading(null);
    }
  };

  const requestDelete = (u: any) => setDeleteTarget(u);

  const verifyUserEmail = async (uid: string, email: string) => {
    setActionLoading(uid);
    try {
      const res = await fetch(`/api/users/${uid}/verify-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success(data.message || `${email} verified.`);
    } catch (e: any) {
      toast.error(e.message || "Could not verify that account.");
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectDeleteTarget) return;
    setActionLoading("delete-project");
    try {
      const res = await fetch(`/api/projects/${projectDeleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) {
        throw new Error(data.message || "Failed to delete project");
      }
      toast.success(`"${projectDeleteTarget.title}" deleted.`);
      setProjectDeleteTarget(null);
      fetchProjects();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete project.");
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}/delete`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete user");
      toast.success(`${deleteTarget.fullName} deactivated.`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user.");
    } finally {
      setActionLoading(null);
    }
  };

  const restoreUser = async (uid: string, name: string) => {
    setActionLoading(uid);
    try {
      const res = await fetch(`/api/users/${uid}/restore`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to restore user");
      toast.success(`${name} restored successfully.`);
      fetchDeletedUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to restore user.");
    } finally {
      setActionLoading(null);
    }
  };

  const approveRequest = async (id: string, name: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/registration-requests/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve request");
      toast.success(data.message || `${name} approved.`);
      fetchPendingRequests();
      if (activeTab === "users") fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to approve request.");
    } finally {
      setActionLoading(null);
    }
  };

  const rejectRequest = async (id: string, name: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/registration-requests/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject request");
      toast.success(data.message || `${name}'s request rejected.`);
      fetchPendingRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject request.");
    } finally {
      setActionLoading(null);
    }
  };

  const approveReset = async (id: string, email: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/password-reset-requests/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to approve reset");
      toast.success(data.message || `Password updated for ${email}.`);
      fetchResetRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to approve password reset.");
    } finally {
      setActionLoading(null);
    }
  };

  const rejectReset = async (id: string, email: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/password-reset-requests/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reject reset");
      toast.success(data.message || `Request for ${email} rejected.`);
      fetchResetRequests();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject password reset.");
    } finally {
      setActionLoading(null);
    }
  };

  const triggerAction = (action: string) => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success(`${action} completed.`);
    }, 1200);
  };

  const activeUsers = users.filter((u) => u.status !== "PENDING");
  const visibleUsers = (() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return activeUsers;
    return activeUsers.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.program?.toLowerCase().includes(q),
    );
  })();

  const navItems: { id: Tab; icon: React.ReactNode; label: string }[] = [
    {
      id: "health",
      icon: <Activity className="w-5 h-5" />,
      label: "System Health",
    },
    { id: "users", icon: <Users className="w-5 h-5" />, label: "User Access" },
    {
      id: "resets",
      icon: <Key className="w-5 h-5" />,
      label: "Password Resets",
    },
    {
      id: "sessions",
      icon: <History className="w-5 h-5" />,
      label: "Session History",
    },
    {
      id: "projects",
      icon: <BookOpen className="w-5 h-5" />,
      label: "Projects",
    },
    {
      id: "deleted",
      icon: <UserX className="w-5 h-5" />,
      label: "Deleted Users",
    },
    {
      id: "config",
      icon: <Settings className="w-5 h-5" />,
      label: "Global Config",
    },
  ];

  const serverLoadCounter = useAnimatedCounter(12);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        userName={deleteTarget?.fullName || ""}
        userRole={deleteTarget?.role || UserRole.STUDENT}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={actionLoading === "delete"}
      />

      <AnimatePresence>
        {projectDeleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl p-8"
            >
              <div className="w-14 h-14 bg-red-100 dark:bg-red-500/15 rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter">
                Delete Project
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                This permanently removes the project and its uploaded abstract from Supabase. Past defense
                sessions and scores are kept. This cannot be undone.
              </p>
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-8">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Project
                </span>
                <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">
                  {projectDeleteTarget.title}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setProjectDeleteTarget(null)}
                  disabled={actionLoading === "delete-project"}
                  className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-2xl transition-all uppercase tracking-tight text-xs disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteProject}
                  disabled={actionLoading === "delete-project"}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl transition-all uppercase tracking-tight text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-200 dark:shadow-red-900/30 disabled:opacity-50"
                >
                  {actionLoading === "delete-project" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {actionLoading === "delete-project" ? "Deleting…" : "Delete Project"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white p-6 flex flex-col border-r border-white/5">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 mb-12"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight uppercase block leading-none">
              Defensa
            </span>
            <span className="text-[10px] text-red-400 font-bold tracking-widest uppercase">
              Admin Portal
            </span>
          </div>
        </motion.div>

        <nav className="space-y-2 flex-grow">
          {navItems.map((item, i) => (
            <motion.button
              type="button"
              key={item.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors relative ${activeTab === item.id ? "text-white" : "text-slate-400 dark:text-slate-500 hover:text-white"}`}
              whileHover={{ x: 4 }}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="admin-nav-bg"
                  className="absolute inset-0 bg-red-600 rounded-xl shadow-lg shadow-red-900/40"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                {item.icon} {item.label}
                {item.id === "pending" && pendingRequests.length > 0 && (
                  <span className="ml-auto bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
                {item.id === "resets" && resetRequests.length > 0 && (
                  <span className="ml-auto bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    {resetRequests.length}
                  </span>
                )}
              </span>
            </motion.button>
          ))}
        </nav>

        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          onClick={onLogout}
          className="mt-10 w-full flex items-center gap-3 px-4 py-3 text-slate-400 dark:text-slate-500 hover:text-white transition-colors font-bold text-sm"
          whileHover={{ x: 4 }}
        >
          <LogOut className="w-5 h-5" /> Sign Out
        </motion.button>
      </aside>

      <main className="flex-grow p-6 md:p-10 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {/* SYSTEM HEALTH */}
          {activeTab === "health" && (
            <motion.div
              key="health"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header
                variants={itemVariants}
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10"
              >
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                    System Health
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    Infrastructure and API throughput status.
                  </p>
                </div>
                <div className="flex gap-4">
                  <motion.button
                    type="button"
                    onClick={() => triggerAction("Cache Clear")}
                    title="Refresh system metrics"
                    aria-label="Refresh system metrics"
                    className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-slate-600 dark:text-slate-400"
                    whileHover={{ scale: 1.05, backgroundColor: "#f8fafc" }}
                    whileTap={{ scale: 0.95 }}
                    animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                    transition={
                      isRefreshing
                        ? { repeat: Infinity, duration: 0.8, ease: "linear" }
                        : {}
                    }
                  >
                    <RefreshCcw className="w-5 h-5" />
                  </motion.button>
                  <div className="px-5 py-3 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 rounded-2xl font-black text-[10px] tracking-widest uppercase flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />{" "}
                    PLATFORM: OPTIMAL
                  </div>
                </div>
              </motion.header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                {[
                  {
                    label: "Server Load",
                    value: `${serverLoadCounter}.4%`,
                    icon: <HardDrive className="w-16 h-16" />,
                    bar: true,
                    barWidth: 12.4,
                  },
                  {
                    label: "API Latency",
                    value: "342ms",
                    icon: <Cpu className="w-16 h-16" />,
                    sub: "Normal Range",
                  },
                  {
                    label: "DB Status",
                    value: "Synced",
                    icon: <Database className="w-16 h-16" />,
                    sub: "99.9% Uptime",
                  },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    variants={itemVariants}
                    className="p-8 bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm relative group overflow-hidden cursor-default"
                    whileHover={{
                      y: -4,
                      boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                      {card.icon}
                    </div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                      {card.label}
                    </p>
                    <p className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2 leading-none">
                      {card.value}
                    </p>
                    {card.bar && (
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-blue-500 shadow-lg shadow-blue-500/40"
                          initial={{ width: 0 }}
                          animate={{ width: `${card.barWidth}%` }}
                          transition={{
                            duration: 1,
                            ease: [0.25, 0.46, 0.45, 0.94],
                            delay: 0.3 + i * 0.1,
                          }}
                        />
                      </div>
                    )}
                    {card.sub && (
                      <p className="text-[10px] text-green-600 font-black uppercase tracking-widest">
                        {card.sub}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>

              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-12"
              >
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                    <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Online Now
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 text-[10px] font-black">
                      {onlineUsers.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchOnlineUsers}
                    title="Refresh online users"
                    aria-label="Refresh online users"
                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    <RefreshCcw className={`w-4 h-4 ${onlineLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        <th className="px-8 py-5">User</th>
                        <th className="px-8 py-5">Role</th>
                        <th className="px-8 py-5">Signed In</th>
                        <th className="px-8 py-5">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {onlineUsers.map((u, i) => (
                        <motion.tr
                          key={u.id}
                          custom={i}
                          variants={rowVariants}
                          initial="hidden"
                          animate="visible"
                          className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all"
                        >
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 ${u.role === "ADMIN" ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"} rounded-xl flex items-center justify-center font-black text-sm`}
                              >
                                {u.fullName?.[0] || "?"}
                              </div>
                              <div>
                                <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1 uppercase tracking-tighter text-sm">
                                  {u.fullName}
                                </p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                  {u.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <span
                              className={`px-2 py-1 rounded text-[10px] font-black tracking-widest border uppercase ${ROLE_BADGE[u.role] ?? "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"}`}
                            >
                              {USER_ROLE_LABELS[u.role as UserRole] ?? u.role}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {u.loginAt && !isNaN(new Date(u.loginAt).getTime())
                              ? new Date(u.loginAt).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="px-8 py-5 text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {relativeTime(u.lastSeenAt)}
                          </td>
                        </motion.tr>
                      ))}
                      {onlineUsers.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-8 py-16 text-center text-slate-400 dark:text-slate-500 font-bold"
                          >
                            {onlineLoading ? "Checking…" : "No users online right now."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <motion.div
                  variants={itemVariants}
                  className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm"
                >
                  <h3 className="text-xl font-black mb-10 uppercase tracking-tighter">
                    Global Traffic Distribution
                  </h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activityData}>
                        <defs>
                          <linearGradient
                            id="colorApi"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#ef4444"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor="#ef4444"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--chart-grid)"
                        />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 10,
                            fill: "#94a3b8",
                            fontWeight: "bold",
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "24px",
                            border: "none",
                            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="api"
                          stroke="#ef4444"
                          strokeWidth={4}
                          fillOpacity={1}
                          fill="url(#colorApi)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-8">
                      Admin Operations
                    </h3>
                    <div className="space-y-4">
                      {["Run Snapshot", "Cycle API Keys"].map((action) => (
                        <motion.button
                          type="button"
                          key={action}
                          onClick={() => triggerAction(action)}
                          className="w-full py-4 bg-white/5 border border-white/5 rounded-2xl text-sm font-black uppercase tracking-tighter text-left px-6 flex justify-between items-center"
                          whileHover={{
                            backgroundColor: "rgba(255,255,255,0.1)",
                            x: 4,
                          }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {action} <ChevronRight className="w-4 h-4" />
                        </motion.button>
                      ))}
                      <motion.button
                        type="button"
                        onClick={() => triggerAction("Broadcast Message")}
                        className="w-full py-4 bg-white/5 border border-white/5 rounded-2xl text-sm font-black uppercase tracking-tighter text-left px-6 flex justify-between items-center"
                        whileHover={{
                          backgroundColor: "rgba(255,255,255,0.1)",
                          x: 4,
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Push Notification <Bell className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>
                  <div className="pt-10 flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest border-t border-white/5">
                    <ShieldAlert className="w-4 h-4 text-red-500" /> Authorized
                    System Entry
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* USER ACCESS */}
          {activeTab === "users" && (
            <motion.div
              key="users"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header
                variants={itemVariants}
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10"
              >
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                    User Access Control
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    Registry of active institutional accounts.
                  </p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setIsAddUserOpen(true)}
                  className="px-8 py-4 bg-red-600 text-white font-black rounded-3xl shadow-xl shadow-red-500/20 flex items-center gap-2 uppercase tracking-tighter"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <UserPlus className="w-5 h-5" /> Register Account
                </motion.button>
              </motion.header>

              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Active Members
                  </h3>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      className="pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold w-48 focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="Search..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-8 py-5">Full Name</th>
                          <th className="px-8 py-5">Role</th>
                          <th className="px-8 py-5">Department</th>
                          <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleUsers.map((u, i) => (
                          <motion.tr
                            key={u.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all group"
                          >
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-10 h-10 ${u.role === "ADMIN" ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400" : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100"} rounded-xl flex items-center justify-center font-black shadow-sm`}
                                >
                                  {u.fullName?.[0] || "?"}
                                </div>
                                <div>
                                  <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors uppercase tracking-tighter">
                                    {u.fullName}
                                  </p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">
                                    {u.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span
                                className={`px-2 py-1 rounded text-[10px] font-black tracking-widest border uppercase ${ROLE_BADGE[u.role] ?? "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"}`}
                              >
                                {USER_ROLE_LABELS[u.role as UserRole] ?? u.role}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                                {u.program || "—"}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => verifyUserEmail(u.id, u.email)}
                                  disabled={actionLoading === u.id}
                                  className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                                  title="Mark this user's email as verified"
                                >
                                  {actionLoading === u.id ? "…" : "Verify email"}
                                </button>
                                <motion.button
                                  type="button"
                                  disabled={u.email === user.email}
                                  onClick={() => requestDelete(u)}
                                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 rounded-lg transition-colors disabled:opacity-0"
                                  title="Deactivate user"
                                  whileHover={{
                                    scale: 1.1,
                                    backgroundColor: "rgba(239,68,68,0.1)",
                                  }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <X className="w-5 h-5" />
                                </motion.button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                        {visibleUsers.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold"
                            >
                              {userSearch.trim()
                                ? "No members match your search."
                                : "No active users."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* PENDING APPROVALS */}
          {activeTab === "pending" && (
            <motion.div
              key="pending"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                  Pending Approvals
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  Self-registered accounts awaiting admin review.
                </p>
              </motion.header>
              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-8 py-5">Full Name</th>
                          <th className="px-8 py-5">Email</th>
                          <th className="px-8 py-5">Department</th>
                          <th className="px-8 py-5 text-right">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingRequests.map((u, i) => (
                          <motion.tr
                            key={u.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all"
                          >
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl flex items-center justify-center font-black">
                                  {u.fullName?.[0] || "?"}
                                </div>
                                <p className="font-black text-slate-800 dark:text-slate-100 leading-none uppercase tracking-tighter">
                                  {u.fullName}
                                </p>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                              {u.email}
                            </td>
                            <td className="px-8 py-6">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">
                                {u.program || "—"}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <motion.button
                                  type="button"
                                  onClick={() => rejectRequest(u.id, u.fullName)}
                                  disabled={actionLoading === u.id}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 text-[10px] font-black rounded-xl uppercase tracking-tighter disabled:opacity-50"
                                  whileHover={{
                                    scale: 1.05,
                                    backgroundColor: "#dc2626",
                                    color: "#fff",
                                    borderColor: "#dc2626",
                                  }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  {actionLoading === u.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <X className="w-3.5 h-3.5" />
                                  )}
                                  Reject
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={() => approveRequest(u.id, u.fullName)}
                                  disabled={actionLoading === u.id}
                                  className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30 text-[10px] font-black rounded-xl uppercase tracking-tighter disabled:opacity-50"
                                  whileHover={{
                                    scale: 1.05,
                                    backgroundColor: "#16a34a",
                                    color: "#fff",
                                    borderColor: "#16a34a",
                                  }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  {actionLoading === u.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  )}
                                  Approve
                                </motion.button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                        {pendingRequests.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold"
                            >
                              No pending registrations.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* PASSWORD RESETS */}
          {activeTab === "resets" && (
            <motion.div
              key="resets"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                  Password Resets
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  Users who requested a new password. Approving one applies the
                  new password to their account immediately.
                </p>
              </motion.header>
              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        <th className="px-8 py-5">Account</th>
                        <th className="px-8 py-5">Requested</th>
                        <th className="px-8 py-5 text-right">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {resetRequests.map((r, i) => (
                        <motion.tr
                          key={r.id}
                          custom={i}
                          variants={rowVariants}
                          initial="hidden"
                          animate="visible"
                          className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all"
                        >
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl flex items-center justify-center">
                                <Key className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1 uppercase tracking-tighter">
                                  {r.fullName || r.email}
                                </p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                  {r.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {r.createdAt && !isNaN(new Date(r.createdAt).getTime())
                              ? new Date(r.createdAt).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <motion.button
                                type="button"
                                onClick={() => rejectReset(r.id, r.email)}
                                disabled={actionLoading === r.id}
                                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 text-[10px] font-black rounded-xl uppercase tracking-tighter disabled:opacity-50"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                {actionLoading === r.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <X className="w-3.5 h-3.5" />
                                )}
                                Reject
                              </motion.button>
                              <motion.button
                                type="button"
                                onClick={() => approveReset(r.id, r.email)}
                                disabled={actionLoading === r.id}
                                className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30 text-[10px] font-black rounded-xl uppercase tracking-tighter disabled:opacity-50"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                {actionLoading === r.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                )}
                                Approve
                              </motion.button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                      {resetRequests.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold"
                          >
                            No password reset requests.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* SESSION HISTORY */}
          {activeTab === "sessions" && (
            <motion.div
              key="sessions"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header
                variants={itemVariants}
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10"
              >
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                    Global Session History
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    Comprehensive log of all practice sessions.
                  </p>
                </div>
              </motion.header>
              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-8 py-5">Student</th>
                          <th className="px-8 py-5">Project</th>
                          <th className="px-8 py-5">Score</th>
                          <th className="px-8 py-5">Duration</th>
                          <th className="px-8 py-5">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sessions.map((s, i) => (
                          <motion.tr
                            key={s.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all"
                          >
                            <td className="px-8 py-6">
                              <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1">
                                {s.userName}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">
                                {s.userEmail}
                              </p>
                            </td>
                            <td className="px-8 py-6">
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                {s.projectTitle || "Untitled"}
                              </p>
                            </td>
                            <td className="px-8 py-6">
                              <span
                                className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase ${s.overallScore >= 80 ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300" : s.overallScore >= 60 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300"}`}
                              >
                                {s.overallScore ?? 0}%
                              </span>
                            </td>
                            <td className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">
                              {s.duration ?? 0}m
                            </td>
                            <td className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">
                              {s.date && !isNaN(new Date(s.date).getTime())
                                ? new Date(s.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                                : "—"}
                            </td>
                          </motion.tr>
                        ))}
                        {sessions.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold"
                            >
                              No sessions recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* GROUP PROJECTS */}
          {activeTab === "projects" && (
            <motion.div
              key="projects"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header
                variants={itemVariants}
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10"
              >
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                    Group Projects
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400">
                    All capstone projects submitted by student groups.
                  </p>
                </div>
              </motion.header>
              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="p-20 text-center">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-[20px] flex items-center justify-center mx-auto mb-6">
                      <BookOpen className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="text-slate-400 dark:text-slate-500 font-bold">
                      No projects have been created yet.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-8 py-5">Project Title</th>
                          <th className="px-8 py-5">Department</th>
                          <th className="px-8 py-5">Abstract</th>
                          <th className="px-8 py-5">Uploaded</th>
                          <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {projects.map((p, i) => (
                          <motion.tr
                            key={p.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all"
                          >
                            <td className="px-8 py-6">
                              <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1">
                                {p.title}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {(p.techStack || [])
                                  .slice(0, 3)
                                  .map((t: string) => (
                                    <span
                                      key={t}
                                      className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-bold"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                {(p.techStack || []).length > 3 && (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[10px] font-bold">
                                    +{p.techStack.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-[10px] font-black uppercase">
                                {p.department || "—"}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <span
                                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${p.abstractText ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300" : "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"}`}
                              >
                                {p.abstractText ? "Uploaded" : "Pending"}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {p.abstractText && (p.abstractUploadedAt || p.createdAt)
                                ? new Date(p.abstractUploadedAt || p.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                                : "—"}
                            </td>
                            <td className="px-8 py-6 text-right">
                              <button
                                type="button"
                                onClick={() => setProjectDeleteTarget(p)}
                                disabled={actionLoading === "delete-project"}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* DELETED USERS */}
          {activeTab === "deleted" && (
            <motion.div
              key="deleted"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                  Deleted Accounts
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  Deactivated accounts only Admin can restore them.
                </p>
              </motion.header>
              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-8 py-5">Full Name</th>
                          <th className="px-8 py-5">Role</th>
                          <th className="px-8 py-5">Email</th>
                          <th className="px-8 py-5 text-right">Restore</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deletedUsers.map((u, i) => (
                          <motion.tr
                            key={u.id}
                            custom={i}
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            className="opacity-60 hover:opacity-100 transition-all"
                          >
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl flex items-center justify-center font-black">
                                  {u.fullName?.[0] || "?"}
                                </div>
                                <p className="font-black text-slate-700 dark:text-slate-300 line-through">
                                  {u.fullName}
                                </p>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <span className="px-2 py-1 rounded text-[10px] font-black tracking-widest border uppercase border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500">
                                {USER_ROLE_LABELS[u.role as UserRole] ?? u.role}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                              {u.email}
                            </td>
                            <td className="px-8 py-6 text-right">
                              <motion.button
                                type="button"
                                onClick={() => restoreUser(u.id, u.fullName)}
                                disabled={actionLoading === u.id}
                                className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 text-[10px] font-black rounded-xl uppercase tracking-tighter ml-auto disabled:opacity-50"
                                whileHover={{
                                  scale: 1.05,
                                  backgroundColor: "#16a34a",
                                  color: "#fff",
                                  borderColor: "#16a34a",
                                }}
                                whileTap={{ scale: 0.95 }}
                              >
                                {actionLoading === u.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3.5 h-3.5" />
                                )}
                                Restore
                              </motion.button>
                            </td>
                          </motion.tr>
                        ))}
                        {deletedUsers.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold"
                            >
                              No deleted users.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* GLOBAL CONFIG */}
          {activeTab === "config" && (
            <motion.div
              key="config"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
                  Platform Config
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  Institutional branding and engine parameters.
                </p>
              </motion.header>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <motion.div
                  variants={itemVariants}
                  className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-10"
                  whileHover={{
                    y: -2,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.06)",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <div>
                    <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2">
                      <Zap className="w-5 h-5 text-red-500" /> Campus Identity
                    </h3>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                          Platform Branding
                        </label>
                        <input
                          type="text"
                          className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none shadow-sm"
                          defaultValue="Defensa AI"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                          Campus Email Domain
                        </label>
                        <input
                          type="text"
                          className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none shadow-sm"
                          defaultValue="@nu-clark.edu.ph"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2">
                      <FileUp className="w-5 h-5 text-red-500" /> Storage Limits
                    </h3>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                        Max Upload Size (MB)
                      </label>
                      <input
                        type="number"
                        aria-label="Max upload size in MB"
                        title="Max upload size in MB"
                        placeholder="30"
                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none shadow-sm"
                        value={maxUploadSize}
                        onChange={(e) =>
                          setMaxUploadSize(parseInt(e.target.value))
                        }
                      />
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-8 flex flex-col justify-between"
                  whileHover={{
                    y: -2,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.06)",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-red-500" /> AI Governance
                      </h3>
                      <select
                        aria-label="Default LLM Provider"
                        title="Default LLM Provider"
                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none outline-none focus:ring-2 focus:ring-red-500 shadow-sm"
                      >
                        <option>Gemini 3 Pro (Preview)</option>
                        <option>Gemini 3 Flash</option>
                      </select>
                    </div>
                    <div>
                      <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2">
                        <Lock className="w-5 h-5 text-red-500" /> Admin JWT
                        Token
                      </h3>
                      <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-end gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            aria-label={showToken ? "Hide token" : "Show token"}
                            title={showToken ? "Hide token" : "Show token"}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400"
                          >
                            {showToken ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (token) {
                                navigator.clipboard.writeText(token);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }
                            }}
                            aria-label="Copy token"
                            title="Copy token"
                            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400"
                          >
                            {copied ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <div
                          className={`p-4 bg-slate-900 rounded-2xl font-mono text-[10px] break-all transition-all duration-300 ${showToken ? "text-red-400" : "text-slate-700 dark:text-slate-300 select-none blur-[2px]"}`}
                        >
                          {token || "No active session token."}
                        </div>
                      </div>
                    </div>
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => triggerAction("Apply Config")}
                    className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl flex items-center justify-center gap-3 uppercase tracking-tighter shadow-2xl"
                    whileHover={{ scale: 1.02, backgroundColor: "#1e293b" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RefreshCcw
                      className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
                    />{" "}
                    Commit Changes
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* REGISTER USER MODAL */}
      <AnimatePresence>
        {isAddUserOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[40px] shadow-2xl p-10 relative max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                aria-label="Close modal"
                title="Close modal"
                className="absolute top-8 right-8 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-3xl flex items-center justify-center text-red-600 dark:text-red-400 mb-6">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter leading-none">
                Register User
              </h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm">
                Create a new institutional account.
              </p>
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="Jane"
                      value={newUser.firstName}
                      onChange={(e) =>
                        setNewUser({ ...newUser, firstName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      Middle
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="—"
                      value={newUser.middleName}
                      onChange={(e) =>
                        setNewUser({ ...newUser, middleName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="Smith"
                      value={newUser.lastName}
                      onChange={(e) =>
                        setNewUser({ ...newUser, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Role *
                  </label>
                  <select
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-red-500 outline-none"
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value as UserRole })
                    }
                  >
                    <option value={UserRole.STUDENT}>Student</option>
                    <option value={UserRole.ADMIN}>Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    School *
                  </label>
                  <select
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-red-500 outline-none"
                    value={newUser.school}
                    onChange={(e) =>
                      setNewUser({ ...newUser, school: e.target.value })
                    }
                  >
                    {SCHOOLS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Institutional Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="username@nu-clark.edu.ph"
                      value={newUser.email}
                      onChange={(e) =>
                        setNewUser({ ...newUser, email: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                    Temporary Password *
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="password"
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="••••••••"
                      value={newUser.password}
                      onChange={(e) =>
                        setNewUser({ ...newUser, password: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="new-user-dept"
                    className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2"
                  >
                    Department *
                  </label>
                  <div className="relative">
                    <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      id="new-user-dept"
                      type="text"
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="Ex. BSIT"
                      value={newUser.program}
                      onChange={(e) =>
                        setNewUser({ ...newUser, program: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="new-user-year"
                    className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2"
                  >
                    Year Level
                  </label>
                  <select
                    id="new-user-year"
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-red-500 outline-none"
                    value={newUser.yearLevel}
                    onChange={(e) =>
                      setNewUser({ ...newUser, yearLevel: e.target.value })
                    }
                  >
                    <option value="">Select year level...</option>
                    {["3rd Year", "4th Year"].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <motion.button
                  type="button"
                  disabled={actionLoading === "add"}
                  onClick={handleAddUser}
                  className="w-full py-5 bg-red-600 text-white font-black rounded-3xl uppercase tracking-tighter shadow-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {actionLoading === "add" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                  Activate Account
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboardView;
