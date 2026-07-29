import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, BarChart3, TrendingUp, Search,
  ArrowUpRight, LogOut, GraduationCap, BookOpen, AlertCircle,
  Plus, Edit, Trash2, Play, X, UserCheck, Settings,
  Eye, EyeOff, Copy, Check, Loader2, UserPlus, Key, Mail,
  ShieldCheck,
} from 'lucide-react';
import { User, UserRole, USER_ROLE_LABELS, Group, Department } from '../../types';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { ToastContainer, useToast } from '../components/Toast';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

interface Props {
  user: User;
  token: string | null;
  mode: 'coordinator' | 'adviser';
  onLogout: () => void;
}

const CAT_KEYS = ['Accuracy', 'Completeness', 'Clarity', 'Confidence'] as const;

interface GroupAnalytics {
  summary: {
    totalStudents: number;
    totalSessions: number;
    overallAvg: number;
    atRiskCount: number;
    categoryAverages: Record<string, number>;
  };
  students: {
    userId: string;
    fullName: string;
    groupId: string;
    groupName: string;
    sessionCount: number;
    avgScore: number;
    lastScore: number;
    lastDate: string;
    atRisk: boolean;
    categoryAvgs: Record<string, number>;
  }[];
}

const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' },
  }),
};

function useAnimatedCounter(target: number, duration = 1000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const startTime = performance.now();
    let rafId: number;
    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) { rafId = requestAnimationFrame(animate); }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return count;
}

const FacultyDashboardView: React.FC<Props> = ({ user, token, mode, onLogout }) => {
  const { toasts, dismissToast, toast } = useToast();
  const isCoordinator = mode === 'coordinator';

  type Tab = 'students' | 'groups' | 'project' | 'reports' | 'settings';
  const [activeTab, setActiveTab] = useState<Tab>('students');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingStudent, setViewingStudent] = useState<any>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const [students, setStudents] = useState<any[]>([]);
  const [advisers, setAdvisers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupProjects, setGroupProjects] = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteType, setDeleteType] = useState<'user' | 'group'>('user');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [groupAnalytics, setGroupAnalytics] = useState<GroupAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', adviserId: '', studentIds: [] as string[] });

  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '', email: '', password: '',
    role: UserRole.STUDENT as UserRole,
    program: '' as Department | '',
    yearLevel: '',
  });

  // DATA FETCHING
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const users: any[] = await res.json();
      setStudents(users.filter(u => u.role === UserRole.STUDENT).map(u => ({
        ...u,
        readiness: u.readiness ?? Math.floor(Math.random() * 40) + 60,
        sessions: u.sessions ?? Math.floor(Math.random() * 15),
        lastActive: '—',
        status: 'In Progress',
        performance: [85, 78, 72, 68, 75, 70],
      })));
    } catch { toast.error('Failed to load students.'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchAdvisers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const users: any[] = await res.json();
      setAdvisers(users.filter(u => u.role === UserRole.CAPSTONE_ADVISER));
    } catch { toast.error('Failed to load advisers.'); }
  }, [token]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      setGroups(await res.json());
    } catch { toast.error('Failed to load groups.'); }
  }, [token]);

  const fetchGroupProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects/my', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404) { setGroupProjects([]); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroupProjects(Array.isArray(data) ? data : [data]);
    } catch { setGroupProjects([]); }
  }, [token]);

  const fetchGroupAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch('/api/sessions/group', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      setGroupAnalytics(await res.json());
    } catch { toast.error('Failed to load class analytics.'); }
    finally { setAnalyticsLoading(false); }
  }, [token]);

  useEffect(() => {
    fetchStudents();
    fetchGroups();
    fetchGroupAnalytics();
    fetchGroupProjects();
    if (isCoordinator) fetchAdvisers();
  }, [fetchStudents, fetchAdvisers, fetchGroups, fetchGroupProjects, fetchGroupAnalytics, isCoordinator]);

  // PROVISION USER
  const handleProvision = async () => {
    if (!newUser.fullName || !newUser.email || !newUser.password || !newUser.role) { toast.error('Please fill in all required fields.'); return; }
    if (newUser.role === UserRole.STUDENT && !newUser.program) { toast.error('Department is required for Student accounts.'); return; }
    setActionLoading('provision');
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create user');
      toast.success(`Account provisioned for ${newUser.email}`);
      setIsProvisionOpen(false);
      setNewUser({ fullName: '', email: '', password: '', role: UserRole.STUDENT, program: '', yearLevel: '' });
      fetchStudents();
      if (newUser.role === UserRole.CAPSTONE_ADVISER) fetchAdvisers();
    } catch (error: any) { toast.error(error.message || 'Network error during account creation.'); }
    finally { setActionLoading(null); }
  };

  // GROUP ACTIONS
  const openCreateGroup = () => { setEditingGroup(null); setGroupForm({ name: '', adviserId: '', studentIds: [] }); setIsGroupModalOpen(true); };
  const openEditGroup = (g: Group) => { setEditingGroup(g); setGroupForm({ name: g.name, adviserId: g.adviserId, studentIds: [...g.studentIds] }); setIsGroupModalOpen(true); };
  const toggleStudentInGroup = (id: string) => setGroupForm(prev => ({ ...prev, studentIds: prev.studentIds.includes(id) ? prev.studentIds.filter(s => s !== id) : [...prev.studentIds, id] }));

  const saveGroup = async () => {
    if (!groupForm.name || !groupForm.adviserId) { toast.error('Group name and adviser are required.'); return; }
    if (groupForm.studentIds.length === 0) { toast.error('At least one student must be assigned to the group.'); return; }
    setActionLoading('group-save');
    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups';
      const res = await fetch(url, {
        method: editingGroup ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(groupForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save group');
      toast.success(editingGroup ? 'Group updated.' : 'Group created.');
      setIsGroupModalOpen(false);
      fetchGroups(); fetchStudents();
    } catch (error: any) { toast.error(error.message || 'Failed to save group.'); }
    finally { setActionLoading(null); }
  };

  const confirmDeleteGroup = async () => {
    if (!deleteTarget) return;
    setActionLoading('delete');
    try {
      const res = await fetch(`/api/groups/${deleteTarget.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success('Group deleted.');
      setDeleteTarget(null);
      fetchGroups(); fetchStudents();
    } catch (error: any) { toast.error(error.message || 'Failed to delete group.'); }
    finally { setActionLoading(null); }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setActionLoading('delete');
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}/delete`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success(`${deleteTarget.fullName} deactivated.`);
      setDeleteTarget(null);
      fetchStudents();
    } catch (error: any) { toast.error(error.message || 'Failed to deactivate user.'); }
    finally { setActionLoading(null); }
  };

  const filteredStudents = students.filter(s => (s.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const analyticsRadarData = CAT_KEYS.map(cat => ({
    subject: cat,
    A: Math.round(groupAnalytics?.summary.categoryAverages[cat] ?? 0),
    fullMark: 100,
  }));

  const weakestCat = useMemo(() => {
    if (!groupAnalytics) return null;
    return CAT_KEYS.reduce((a, b) => (groupAnalytics.summary.categoryAverages[a] ?? 0) < (groupAnalytics.summary.categoryAverages[b] ?? 0) ? a : b);
  }, [groupAnalytics]);

  const studentAnalyticsMap = useMemo(() => {
    const map: Record<string, GroupAnalytics['students'][0]> = {};
    groupAnalytics?.students.forEach(s => { map[s.userId] = s; });
    return map;
  }, [groupAnalytics]);

  const availableStudents = editingGroup
    ? students.filter(s => !s.groupId || s.groupId === editingGroup.id)
    : students.filter(s => !s.groupId);

  const renderRadarChart = (data: any[], color: string) => (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
          <Radar name="Score" dataKey="A" stroke={color} fill={color} fillOpacity={0.6} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );

  const animatedStudentCount = useAnimatedCounter(groupAnalytics?.summary.totalStudents ?? 0);
  const animatedSessionCount = useAnimatedCounter(groupAnalytics?.summary.totalSessions ?? 0);
  const animatedAvg = useAnimatedCounter(Math.round(groupAnalytics?.summary.overallAvg ?? 0));
  const animatedAtRisk = useAnimatedCounter(groupAnalytics?.summary.atRiskCount ?? 0);

  type NavItem = { id: Tab; icon: React.ReactNode; label: string };
  const navItems: NavItem[] = [
    { id: 'students', icon: <Users className="w-5 h-5" />, label: 'Student Roster' },
    ...(isCoordinator ? [{ id: 'groups' as Tab, icon: <UserCheck className="w-5 h-5" />, label: 'Group Management' }] : []),
    { id: 'project', icon: <BookOpen className="w-5 h-5" />, label: isCoordinator ? 'Group Projects' : 'Group Project' },
    { id: 'reports', icon: <BarChart3 className="w-5 h-5" />, label: 'Class Analytics' },
    { id: 'settings', icon: <Settings className="w-5 h-5" />, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {deleteTarget && deleteType === 'user' && (
        <ConfirmDeleteModal
          isOpen={!!deleteTarget}
          userName={deleteTarget.fullName}
          userRole={deleteTarget.role}
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeleteTarget(null)}
          loading={actionLoading === 'delete'}
        />
      )}

      <AnimatePresence>
        {deleteTarget && deleteType === 'group' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl p-8"
            >
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter">Delete Group</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Delete <strong>{deleteTarget.name}</strong>? Students will be unassigned.</p>
              <div className="flex gap-3">
                <motion.button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black rounded-2xl uppercase text-xs" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>Cancel</motion.button>
                <motion.button
                  type="button"
                  onClick={confirmDeleteGroup}
                  disabled={actionLoading === 'delete'}
                  className="flex-1 py-3 bg-red-600 text-white font-black rounded-2xl uppercase text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {actionLoading === 'delete' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Group
                </motion.button>
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
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight uppercase block leading-none">Defensa</span>
            <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">
              {isCoordinator ? 'Coordinator Portal' : 'Adviser Portal'}
            </span>
          </div>
        </motion.div>

        <nav className="space-y-2 flex-grow">
          {navItems.map((item, i) => (
            <motion.button
              key={item.id}
              type="button"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.35 }}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors relative ${activeTab === item.id ? 'text-white' : 'text-slate-400 dark:text-slate-500 hover:text-white'}`}
              whileHover={{ x: 4 }}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="faculty-nav-bg"
                  className="absolute inset-0 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/40"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">{item.icon} {item.label}</span>
            </motion.button>
          ))}
        </nav>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 p-4 bg-white/5 rounded-2xl border border-white/5"
        >
          <p className="text-xs font-bold truncate mb-1">{user.fullName}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-4">{USER_ROLE_LABELS[user.role]}</p>
          <motion.button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl text-xs font-bold transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <LogOut className="w-4 h-4" /> Logout
          </motion.button>
        </motion.div>
      </aside>

      <main className="flex-grow p-6 md:p-10 max-w-7xl mx-auto w-full relative">
        <AnimatePresence mode="wait">

          {/* STUDENT ROSTER */}
          {activeTab === 'students' && (
            <motion.div key="students" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Student Roster</h1>
                  <p className="text-slate-500 dark:text-slate-400">Overview of student viva voce preparation.</p>
                </div>
                {isCoordinator && (
                  <motion.button
                    type="button"
                    onClick={() => { setNewUser({ fullName: '', email: '', password: '', role: UserRole.STUDENT, program: '', yearLevel: '' }); setIsProvisionOpen(true); }}
                    className="px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl shadow-sm flex items-center gap-2"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <UserPlus className="w-4 h-4" /> Provision Account
                  </motion.button>
                )}
              </motion.header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {[
                  { label: 'Total Students', value: animatedStudentCount, icon: <Users className="w-6 h-6" />, bg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600', bigIcon: <Users className="w-16 h-16" /> },
                  { label: 'Simulations Run', value: animatedSessionCount, icon: <Play className="w-6 h-6" />, bg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600', bigIcon: <Play className="w-16 h-16" /> },
                  { label: 'Class Avg', value: groupAnalytics ? `${animatedAvg}%` : '—', icon: <TrendingUp className="w-6 h-6" />, bg: 'bg-green-50 dark:bg-green-500/10 text-green-600', bigIcon: <TrendingUp className="w-16 h-16" /> },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    variants={itemVariants}
                    className="p-8 bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between relative overflow-hidden group cursor-default"
                    whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">{card.bigIcon}</div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{card.label}</p>
                      <p className="text-4xl font-black text-slate-800 dark:text-slate-100">{card.value}</p>
                    </div>
                    <div className={`w-12 h-12 ${card.bg} rounded-2xl flex items-center justify-center`}>{card.icon}</div>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Class Directory</h2>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      aria-label="Search students"
                      className="pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full sm:w-64 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                      placeholder="Search student..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-8 py-5">Full Name</th>
                          <th className="px-8 py-5">Readiness</th>
                          <th className="px-8 py-5">Sessions</th>
                          <th className="px-8 py-5">Status</th>
                          <th className="px-8 py-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.map((s, i) => (
                          <motion.tr key={s.id} custom={i} variants={rowVariants} initial="hidden" animate="visible" className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all group">
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center font-black text-blue-600 shadow-sm">{(s.fullName || '?')[0]}</div>
                                <div>
                                  <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1 group-hover:text-blue-600 transition-colors">{s.fullName}</p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">{s.program || '—'} &bull; {s.lastActive}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 font-black text-slate-800 dark:text-slate-100">{studentAnalyticsMap[s.id] ? `${Math.round(studentAnalyticsMap[s.id].avgScore)}%` : '—'}</td>
                            <td className="px-8 py-6 text-sm font-bold text-slate-500 dark:text-slate-400">{studentAnalyticsMap[s.id]?.sessionCount ?? 0}</td>
                            <td className="px-8 py-6">
                              {studentAnalyticsMap[s.id] ? (
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${studentAnalyticsMap[s.id].atRisk ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' : studentAnalyticsMap[s.id].avgScore >= 80 ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'}`}>
                                  {studentAnalyticsMap[s.id].atRisk ? 'At Risk' : studentAnalyticsMap[s.id].avgScore >= 80 ? 'Ready' : 'In Progress'}
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">No Sessions</span>
                              )}
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <motion.button type="button" onClick={() => setViewingStudent(s)} title="View student detail" className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-sm" whileHover={{ backgroundColor: '#4f46e5', color: '#fff', scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                  <ArrowUpRight className="w-5 h-5" />
                                </motion.button>
                                {isCoordinator && (
                                  <motion.button type="button" onClick={() => { setDeleteType('user'); setDeleteTarget(s); }} title="Deactivate student" className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-sm" whileHover={{ backgroundColor: '#dc2626', color: '#fff', scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                    <X className="w-5 h-5" />
                                  </motion.button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                        {filteredStudents.length === 0 && (
                          <tr><td colSpan={5} className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold">No students found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* GROUP MANAGEMENT */}
          {activeTab === 'groups' && isCoordinator && (
            <motion.div key="groups" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Group Management</h1>
                  <p className="text-slate-500 dark:text-slate-400">Create and manage capstone groups with assigned advisers and students.</p>
                </div>
                <motion.button type="button" onClick={openCreateGroup} className="px-8 py-4 bg-blue-600 text-white font-black rounded-3xl shadow-xl shadow-blue-500/20 flex items-center gap-2 uppercase tracking-tighter" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Plus className="w-5 h-5" /> Create Group
                </motion.button>
              </motion.header>

              {groups.length === 0 ? (
                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 p-20 text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-[20px] flex items-center justify-center mx-auto mb-6"><Users className="w-8 h-8 text-slate-400 dark:text-slate-500" /></div>
                  <p className="text-slate-400 dark:text-slate-500 font-bold">No groups yet. Create one to assign advisers and students.</p>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groups.map((g, i) => (
                    <motion.div
                      key={g.id}
                      variants={itemVariants}
                      className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm"
                      whileHover={{ y: -4, borderColor: '#2563eb', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    >
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none mb-2 uppercase tracking-tighter">{g.name}</h3>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Adviser: {g.adviserName || g.adviserId}</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-2xl flex items-center justify-center font-black text-lg">{g.studentIds.length}</div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-6">{g.studentIds.length} student{g.studentIds.length !== 1 ? 's' : ''}</p>
                      <div className="flex gap-3 border-t border-slate-50 pt-6">
                        <motion.button type="button" onClick={() => openEditGroup(g)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                          <Edit className="w-3 h-3" /> Edit
                        </motion.button>
                        <motion.button type="button" onClick={() => { setDeleteType('group'); setDeleteTarget(g); }} className="p-3 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-400 rounded-2xl transition-colors" title="Delete group" aria-label="Delete group" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* GROUP PROJECT(S) */}
          {activeTab === 'project' && (
            <motion.div key="project" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">{isCoordinator ? 'Group Projects' : 'Group Project'}</h1>
                <p className="text-slate-500 dark:text-slate-400">{isCoordinator ? 'Projects submitted by each capstone group.' : 'The research project assigned to your group.'}</p>
              </motion.header>

              {groupProjects.length === 0 ? (
                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 p-20 text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-[20px] flex items-center justify-center mx-auto mb-6"><BookOpen className="w-8 h-8 text-slate-400 dark:text-slate-500" /></div>
                  <p className="text-slate-400 dark:text-slate-500 font-bold">{isCoordinator ? 'No groups have submitted a project yet.' : 'Your group has not created a project yet.'}</p>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {groupProjects.map((p: any, i) => (
                    <motion.div
                      key={p.id}
                      variants={itemVariants}
                      className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm"
                      whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    >
                      {isCoordinator && p.groupName && <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3">{p.groupName}</p>}
                      <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none mb-2 uppercase tracking-tighter">{p.title}</h3>
                      <div className="flex flex-wrap gap-2 my-4">
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest">{p.department}</span>
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest">{p.methodology}</span>
                        {p.defenseDate && <span className="px-3 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">Defense: {p.defenseDate}</span>}
                      </div>
                      {p.techStack?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {p.techStack.slice(0, 6).map((t: string) => <span key={t} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-bold">{t}</span>)}
                          {p.techStack.length > 6 && <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[10px] font-bold">+{p.techStack.length - 6} more</span>}
                        </div>
                      )}
                      {p.description && <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-3">{p.description}</p>}
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${p.abstractText ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                          {p.abstractText ? 'Abstract uploaded' : 'Awaiting abstract'}
                        </span>
                        {p.adviserName && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Adviser: {p.adviserName}</span>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* CLASS ANALYTICS */}
          {activeTab === 'reports' && (
            <motion.div key="reports" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="flex items-center justify-between mb-10">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Class Analytics</h1>
                  <p className="text-slate-500 dark:text-slate-400">Real session data across all students in your scope.</p>
                </div>
                <motion.button type="button" onClick={fetchGroupAnalytics} disabled={analyticsLoading} title="Refresh analytics" aria-label="Refresh analytics" className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 dark:text-slate-400 shadow-sm disabled:opacity-50" whileHover={{ scale: 1.05, borderColor: '#2563eb', color: '#2563eb' }} whileTap={{ scale: 0.95 }}>
                  <Loader2 className={`w-5 h-5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                </motion.button>
              </motion.header>

              {analyticsLoading && !groupAnalytics ? (
                <div className="flex items-center justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-blue-400" /></div>
              ) : !groupAnalytics ? (
                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 p-20 text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-[20px] flex items-center justify-center mx-auto mb-6"><BarChart3 className="w-8 h-8 text-slate-400 dark:text-slate-500" /></div>
                  <p className="text-slate-400 dark:text-slate-500 font-bold">No session data available yet.</p>
                </motion.div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    {[
                      { label: 'Students', value: animatedStudentCount, icon: <Users className="w-5 h-5" />, color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' },
                      { label: 'Total Sessions', value: animatedSessionCount, icon: <Play className="w-5 h-5" />, color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' },
                      { label: 'Class Average', value: `${animatedAvg}%`, icon: <TrendingUp className="w-5 h-5" />, color: 'bg-green-50 dark:bg-green-500/10 text-green-600' },
                      { label: 'At Risk', value: animatedAtRisk, icon: <AlertCircle className="w-5 h-5" />, color: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' },
                    ].map((card, i) => (
                      <motion.div
                        key={card.label}
                        variants={itemVariants}
                        className="p-8 bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between"
                        whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      >
                        <div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{card.label}</p>
                          <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{card.value}</p>
                        </div>
                        <div className={`w-12 h-12 ${card.color} rounded-2xl flex items-center justify-center`}>{card.icon}</div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
                    <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                      <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6 w-full">Category Averages</h3>
                      {renderRadarChart(analyticsRadarData, '#4f46e5')}
                    </motion.div>
                    <div className="space-y-6">
                      <motion.div variants={itemVariants} className="bg-slate-900 text-white rounded-[40px] p-10 shadow-2xl">
                        <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Critical Insight</h3>
                        {weakestCat ? (
                          <p className="text-xl font-bold leading-relaxed">
                            "The class scores lowest in <span className="text-blue-400">{weakestCat}</span> ({Math.round(groupAnalytics.summary.categoryAverages[weakestCat])}%). Recommend focused practice on this area."
                          </p>
                        ) : (
                          <p className="text-xl font-bold leading-relaxed text-slate-400 dark:text-slate-500">Insufficient data to generate insight.</p>
                        )}
                      </motion.div>
                      <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">Category Rankings</h3>
                        <div className="space-y-5">
                          {[...analyticsRadarData].sort((a, b) => b.A - a.A).map((cat, i) => (
                            <div key={cat.subject}>
                              <div className="flex justify-between text-xs font-black uppercase mb-1.5">
                                <span>{cat.subject}</span>
                                <span className={cat.A >= 80 ? 'text-green-500' : cat.A >= 60 ? 'text-amber-500' : 'text-red-500'}>{cat.A}%</span>
                              </div>
                              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${cat.A >= 80 ? 'bg-green-500' : cat.A >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${cat.A}%` }}
                                  transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 + i * 0.1 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-100 dark:border-slate-800">
                      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Student Performance</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                            <th className="px-8 py-5">Student</th>
                            {isCoordinator && <th className="px-8 py-5">Group</th>}
                            <th className="px-8 py-5">Sessions</th>
                            <th className="px-8 py-5">Avg Score</th>
                            <th className="px-8 py-5">Last Score</th>
                            <th className="px-8 py-5">Weakest Area</th>
                            <th className="px-8 py-5">Last Session</th>
                            <th className="px-8 py-5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groupAnalytics.students.length === 0 ? (
                            <tr><td colSpan={isCoordinator ? 8 : 7} className="px-8 py-20 text-center text-slate-400 dark:text-slate-500 font-bold">No session data yet.</td></tr>
                          ) : (
                            [...groupAnalytics.students]
                              .sort((a, b) => a.atRisk === b.atRisk ? b.avgScore - a.avgScore : a.atRisk ? -1 : 1)
                              .map((s, i) => {
                                const weakest = s.categoryAvgs ? Object.entries(s.categoryAvgs).sort((a, b) => a[1] - b[1])[0]?.[0] : null;
                                const lastDate = s.lastDate ? new Date(s.lastDate).toLocaleDateString() : '—';
                                return (
                                  <motion.tr key={s.userId} custom={i} variants={rowVariants} initial="hidden" animate="visible" className={`hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all ${s.atRisk ? 'bg-red-50 dark:bg-red-500/10/40' : ''}`}>
                                    <td className="px-8 py-5">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center font-black text-blue-600 text-sm shadow-sm">{(s.fullName || '?')[0]}</div>
                                        <p className="font-black text-slate-800 dark:text-slate-100 text-sm">{s.fullName}</p>
                                      </div>
                                    </td>
                                    {isCoordinator && <td className="px-8 py-5 text-sm font-bold text-slate-500 dark:text-slate-400">{s.groupName || '—'}</td>}
                                    <td className="px-8 py-5 text-sm font-bold text-slate-500 dark:text-slate-400">{s.sessionCount}</td>
                                    <td className="px-8 py-5 font-black text-slate-800 dark:text-slate-100">{Math.round(s.avgScore)}%</td>
                                    <td className="px-8 py-5 font-bold text-slate-600 dark:text-slate-400">{Math.round(s.lastScore)}%</td>
                                    <td className="px-8 py-5">
                                      {weakest ? <span className="px-2 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 rounded-lg text-[10px] font-black uppercase tracking-widest">{weakest}</span> : <span className="text-slate-400 dark:text-slate-500 text-[10px] font-bold">—</span>}
                                    </td>
                                    <td className="px-8 py-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">{lastDate}</td>
                                    <td className="px-8 py-5">
                                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${s.atRisk ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300' : s.avgScore >= 80 ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'}`}>
                                        {s.atRisk ? 'At Risk' : s.avgScore >= 80 ? 'Ready' : 'In Progress'}
                                      </span>
                                    </td>
                                  </motion.tr>
                                );
                              })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                </>
              )}
            </motion.div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <motion.div key="settings" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Account Settings</h1>
                <p className="text-slate-500 dark:text-slate-400">Your institutional profile and security.</p>
              </motion.header>
              <div className="max-w-lg">
                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm" whileHover={{ y: -2, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                  <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-600" /> JWT Session Token
                  </h3>
                  <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Session Token</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Hide token' : 'Show token'} title={showToken ? 'Hide token' : 'Show token'} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={() => { if (token) { navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 2000); } }} aria-label="Copy token" title="Copy token" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className={`p-4 bg-slate-900 rounded-2xl font-mono text-[10px] break-all transition-all duration-300 ${showToken ? 'text-blue-400' : 'text-slate-700 dark:text-slate-300 select-none blur-[2px]'}`}>
                      {token || 'No active session token.'}
                    </div>
                    <p className="mt-4 text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed">
                      <AlertCircle className="w-3 h-3 inline mr-1 text-amber-500" />
                      Never share this token.
                    </p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* STUDENT DETAIL MODAL */}
      <AnimatePresence>
        {viewingStudent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-10 flex flex-col md:flex-row gap-10">
                <div className="md:w-1/3 flex flex-col items-center text-center">
                  <div className="w-32 h-32 bg-blue-100 dark:bg-blue-500/20 rounded-[40px] flex items-center justify-center text-4xl font-black text-blue-600 mb-6 shadow-inner">
                    {(viewingStudent.fullName || '?')[0]}
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none mb-2 uppercase tracking-tighter">{viewingStudent.fullName}</h3>
                  <p className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-[0.2em] mb-8">{viewingStudent.program || '—'} &bull; {viewingStudent.email}</p>
                  <div className="w-full space-y-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Avg Score</span>
                      <span className="text-xl font-black text-slate-800 dark:text-slate-100">{studentAnalyticsMap[viewingStudent.id] ? `${Math.round(studentAnalyticsMap[viewingStudent.id].avgScore)}%` : '—'}</span>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Sessions Run</span>
                      <span className="text-xl font-black text-slate-800 dark:text-slate-100">{studentAnalyticsMap[viewingStudent.id]?.sessionCount ?? 0}</span>
                    </div>
                    {studentAnalyticsMap[viewingStudent.id]?.atRisk && (
                      <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase">At Risk — avg below 70%</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-grow">
                  <div className="flex items-center justify-between mb-8">
                    <h4 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-600" /> Performance Profile</h4>
                    <motion.button type="button" onClick={() => setViewingStudent(null)} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <X className="w-6 h-6" />
                    </motion.button>
                  </div>
                  {studentAnalyticsMap[viewingStudent.id] ? (
                    renderRadarChart(CAT_KEYS.map(cat => ({
                      subject: cat,
                      A: Math.round(studentAnalyticsMap[viewingStudent.id].categoryAvgs[cat] ?? 0),
                      fullMark: 100,
                    })), '#4f46e5')
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 font-bold">No session data yet.</div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CREATE / EDIT GROUP MODAL */}
      <AnimatePresence>
        {isGroupModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[40px] shadow-2xl p-10 relative max-h-[90vh] overflow-y-auto"
            >
              <button type="button" onClick={() => setIsGroupModalOpen(false)} aria-label="Close modal" className="absolute top-8 right-8 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"><X className="w-6 h-6" /></button>
              <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter">{editingGroup ? 'Edit Group' : 'Create Group'}</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm">Assign an adviser and select students.</p>
              <div className="space-y-6">
                <div>
                  <label htmlFor="group-name" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Group Name *</label>
                  <input id="group-name" type="text" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Group Alpha" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="group-adviser" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Assign Adviser *</label>
                  <select id="group-adviser" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-blue-500 outline-none" value={groupForm.adviserId} onChange={(e) => setGroupForm({ ...groupForm, adviserId: e.target.value })}>
                    <option value="">Select adviser...</option>
                    {advisers.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
                  </select>
                  {advisers.length === 0 && <p className="text-xs text-amber-600 mt-2 font-semibold">No advisers found. Create adviser accounts first.</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Select Students <span className="text-slate-300 dark:text-slate-600">({groupForm.studentIds.length} selected)</span></label>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950 divide-y divide-slate-100">
                    {availableStudents.length === 0 ? (
                      <p className="p-4 text-sm text-slate-400 dark:text-slate-500">All students are already assigned to groups.</p>
                    ) : (
                      availableStudents.map((s) => (
                        <label key={s.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                          <input type="checkbox" className="rounded accent-blue-600" checked={groupForm.studentIds.includes(s.id)} onChange={() => toggleStudentInGroup(s.id)} />
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.fullName}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">{s.program || '—'}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <motion.button
                  type="button"
                  disabled={actionLoading === 'group-save'}
                  onClick={saveGroup}
                  className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl uppercase tracking-tighter shadow-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {actionLoading === 'group-save' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  {editingGroup ? 'Save Changes' : 'Create Group'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROVISION USER MODAL */}
      <AnimatePresence>
        {isProvisionOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[40px] shadow-2xl p-10 relative max-h-[90vh] overflow-y-auto"
            >
              <button type="button" onClick={() => setIsProvisionOpen(false)} aria-label="Close modal" title="Close modal" className="absolute top-8 right-8 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"><X className="w-6 h-6" /></button>
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-500/20 rounded-3xl flex items-center justify-center text-blue-600 mb-6"><ShieldCheck className="w-8 h-8" /></div>
              <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter leading-none">Provision Account</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm">Create a new Student or Adviser account.</p>
              <div className="space-y-5">
                <div>
                  <label htmlFor="prov-fullname" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Legal Full Name *</label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input id="prov-fullname" type="text" className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Juan dela Cruz" value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="prov-email" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Institutional Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input id="prov-email" type="email" className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="username@institution.edu.ph" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="prov-password" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Password *</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input id="prov-password" type="password" className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="prov-role" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Role *</label>
                  <select id="prov-role" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-blue-500 outline-none" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}>
                    <option value={UserRole.STUDENT}>Student</option>
                    <option value={UserRole.CAPSTONE_ADVISER}>Capstone Adviser</option>
                  </select>
                </div>
                {newUser.role === UserRole.STUDENT && (
                  <div>
                    <label htmlFor="prov-dept" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Department *</label>
                    <select id="prov-dept" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-blue-500 outline-none" value={newUser.program} onChange={(e) => setNewUser({ ...newUser, program: e.target.value as Department })}>
                      <option value="">Select department...</option>
                      <option value={Department.BSIT}>BSIT</option>
                      <option value={Department.BSCpE}>BSCpE</option>
                    </select>
                  </div>
                )}
                {newUser.role === UserRole.STUDENT && (
                  <div>
                    <label htmlFor="prov-year" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Year Level</label>
                    <select id="prov-year" className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold appearance-none focus:ring-2 focus:ring-blue-500 outline-none" value={newUser.yearLevel} onChange={(e) => setNewUser({ ...newUser, yearLevel: e.target.value })}>
                      <option value="">Select year level...</option>
                      {['3rd Year', '4th Year'].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}
                <motion.button
                  type="button"
                  disabled={actionLoading === 'provision'}
                  onClick={handleProvision}
                  className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl uppercase tracking-tighter shadow-2xl flex items-center justify-center gap-2 disabled:opacity-60"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {actionLoading === 'provision' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
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

export default FacultyDashboardView;
