
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area,
} from 'recharts';
import {
  ChevronLeft, Calendar, BarChart3, TrendingUp, Sparkles,
  AlertTriangle, History, ArrowRight, CheckCircle2,
  X, AlertCircle, Clock, ListChecks,
} from 'lucide-react';
import { SessionResult } from '../../types';

interface Props {
  history: SessionResult[];
  onBack: () => void;
  onNewSession: () => void;
}

const CAT_KEYS = ['Accuracy', 'Completeness', 'Clarity', 'Confidence'] as const;

const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

function useAnimatedCounter(target: number, duration = 1200) {
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

const ReadinessDashboardView: React.FC<Props> = ({ history, onBack, onNewSession }) => {
  const [selectedSession, setSelectedSession] = useState<SessionResult | null>(null);
  const [ringAnimated, setRingAnimated] = useState(false);

  const avgScore = useMemo(
    () => history.length > 0
      ? Math.round(history.reduce((acc, s) => acc + s.overallScore, 0) / history.length)
      : 0,
    [history],
  );

  const categoryAverages = useMemo(() => {
    const result: Record<string, number> = {};
    for (const cat of CAT_KEYS) {
      const vals = history.filter(s => s.categoryScores?.[cat] != null).map(s => s.categoryScores[cat]);
      result[cat] = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    }
    return result;
  }, [history]);

  const radarData = CAT_KEYS.map(cat => ({ subject: cat, A: categoryAverages[cat], fullMark: 100 }));

  const trendData = useMemo(
    () => [...history].reverse().slice(-10).map((s, i) => ({ session: `S${i + 1}`, score: s.overallScore })),
    [history],
  );

  const sortedCats = useMemo(
    () => [...CAT_KEYS].sort((a, b) => (categoryAverages[b] || 0) - (categoryAverages[a] || 0)),
    [categoryAverages],
  );
  const strongest = sortedCats.slice(0, 2);
  const weakest = sortedCats.slice(-2).reverse();

  const circumference = 628;
  const offset = circumference * (1 - avgScore / 100);
  const readinessLabel = avgScore >= 80 ? 'Optimal' : avgScore >= 60 ? 'On Track' : 'Needs Work';
  const readinessColor = avgScore >= 80 ? 'text-green-500' : avgScore >= 60 ? 'text-amber-500' : 'text-red-500';
  const ringColor = avgScore >= 80 ? '#22c55e' : avgScore >= 60 ? '#f59e0b' : '#ef4444';

  const animatedScore = useAnimatedCounter(avgScore);
  const animatedHistory = useAnimatedCounter(history.length);

  // Trigger ring animation after a short delay
  useEffect(() => {
    const timer = setTimeout(() => setRingAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-10">
      <div className="max-w-6xl mx-auto w-full">
        <motion.div
          variants={pageVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.header variants={itemVariants} className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <motion.button
                onClick={onBack}
                className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors mb-4 font-bold"
                whileHover={{ x: -4 }}
              >
                <ChevronLeft className="w-5 h-5" /> Back to Dashboard
              </motion.button>
              <h1 className="text-4xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter leading-none mb-2">Defense Readiness</h1>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Aggregated analysis of your simulation history.</p>
            </div>
            <motion.button
              onClick={onNewSession}
              className="px-10 py-5 bg-blue-600 text-white font-black rounded-3xl shadow-2xl shadow-blue-100 uppercase tracking-widest text-sm"
              whileHover={{ scale: 1.03, boxShadow: '0 20px 40px rgba(59,130,246,0.3)' }}
              whileTap={{ scale: 0.97 }}
            >
              Start New Session
            </motion.button>
          </motion.header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            {/* Readiness ring */}
            <motion.div
              variants={itemVariants}
              className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center text-center"
              whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-10">Institutional Readiness</h3>
              <div className="relative w-56 h-56 mb-10">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="112" cy="112" r="100" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                  <circle
                    cx="112" cy="112" r="100"
                    stroke={ringColor}
                    strokeWidth="16"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={ringAnimated ? offset : circumference}
                    className="ring-animate"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-6xl font-black text-slate-800 dark:text-slate-100">{animatedScore}%</span>
                  <span className={`text-xs font-black tracking-[0.2em] uppercase mt-2 ${readinessColor}`}>{readinessLabel}</span>
                </div>
              </div>
              <div className="space-y-4 w-full text-left bg-slate-50 dark:bg-slate-950 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-3 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    <BarChart3 className="w-4 h-4 text-blue-500" /> Avg Score
                  </span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">{animatedScore}/100</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-3 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    <TrendingUp className="w-4 h-4 text-green-500" /> History
                  </span>
                  <span className="text-sm font-black text-slate-800 dark:text-slate-100">{animatedHistory} Sessions</span>
                </div>
                {history[0]?.weakestCategory && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-3 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Focus Area
                    </span>
                    <span className="text-sm font-black text-amber-600">{history[0].weakestCategory}</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Charts */}
            <div className="lg:col-span-2 space-y-8">
              <motion.div
                variants={itemVariants}
                className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden"
                whileHover={{ y: -2, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="absolute top-0 right-0 p-10 opacity-5"><TrendingUp className="w-20 h-20" /></div>
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-6">Evaluation Category Averages</h3>
                {history.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-slate-300 dark:text-slate-600 font-bold">No session data yet</div>
                ) : (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="var(--chart-grid)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                        <Radar name="Score" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>

              {trendData.length > 1 && (
                <motion.div
                  variants={itemVariants}
                  className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm"
                  whileHover={{ y: -2, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-6">Score Trend</h3>
                  <div className="h-[140px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="session" tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                        <Tooltip formatter={(v: any) => [`${v}%`, 'Score']} />
                        <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} fill="url(#scoreGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                    <History className="w-6 h-6 text-blue-600" /> Practice History
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Click arrow to review</p>
                </div>
                <div className="overflow-x-auto">
                  {history.length > 0 ? (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                          <th className="px-10 py-5">Date</th>
                          <th className="px-10 py-5">Score</th>
                          <th className="px-10 py-5">Q&amp;A</th>
                          <th className="px-10 py-5">Weakest</th>
                          <th className="px-10 py-5 text-right">Review</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history.map((s, i) => (
                          <motion.tr
                            key={i}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05, duration: 0.3 }}
                            className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-all group"
                          >
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                                  <Calendar className="w-5 h-5" />
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{s.date ? new Date(s.date).toLocaleDateString() : '—'}</span>
                              </div>
                            </td>
                            <td className="px-10 py-6">
                              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${s.overallScore >= 80 ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : s.overallScore >= 60 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'}`}>
                                {s.overallScore}%
                              </span>
                            </td>
                            <td className="px-10 py-6 text-sm font-bold text-slate-500 dark:text-slate-400">{s.questionsAnswered} Qs</td>
                            <td className="px-10 py-6 text-sm font-bold text-slate-500 dark:text-slate-400">{s.weakestCategory || '—'}</td>
                            <td className="px-10 py-6 text-right">
                              <motion.button
                                onClick={() => setSelectedSession(s)}
                                aria-label="View session transcript"
                                title="View session transcript"
                                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm"
                                whileHover={{ backgroundColor: '#0f172a', color: '#fff', borderColor: '#0f172a' }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <ArrowRight className="w-5 h-5" />
                              </motion.button>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-20 text-center">
                      <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-sm">No practice sessions recorded yet.</p>
                    </div>
                  )}
                </div>
              </motion.div>

              {history.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-8 flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-blue-500" /> Top Categories
                    </h3>
                    <ul className="space-y-4">
                      {strongest.map((cat, i) => (
                        <li key={cat} className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm">{i + 1}</div>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs font-black text-slate-700 dark:text-slate-300 mb-1 uppercase">
                              <span>{cat}</span>
                              <span className="text-green-600">{categoryAverages[cat]}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-green-400 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${categoryAverages[cat]}%` }}
                                transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 + i * 0.1 }}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </motion.div>

                  <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-8 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500" /> Focus Areas
                    </h3>
                    <ul className="space-y-4">
                      {weakest.map((cat, i) => (
                        <li key={cat} className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm">{i + 1}</div>
                          <div className="flex-1">
                            <div className="flex justify-between text-xs font-black text-slate-700 dark:text-slate-300 mb-1 uppercase">
                              <span>{cat}</span>
                              <span className="text-amber-600">{categoryAverages[cat]}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-amber-400 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${categoryAverages[cat]}%` }}
                                transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.4 + i * 0.1 }}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </div>
              )}
            </div>

            {/* AI Prep Strategy */}
            <motion.div
              variants={itemVariants}
              className="lg:col-span-1"
            >
              <motion.div
                className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden"
                whileHover={{ y: -4, boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="absolute top-0 right-0 p-8 opacity-5"><Sparkles className="w-16 h-16" /></div>
                <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-10">AI Prep Strategy</h3>
                <div className="space-y-8">
                  {weakest[0] && (
                    <div className="relative pl-6 border-l-2 border-amber-500">
                      <p className="text-sm font-black uppercase tracking-widest mb-2">Address {weakest[0]}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
                        Your lowest category is <strong className="text-amber-400">{weakest[0]}</strong> at {categoryAverages[weakest[0]]}%. Focus your next session specifically on this area.
                      </p>
                    </div>
                  )}
                  {strongest[0] && (
                    <div className="relative pl-6 border-l-2 border-green-500">
                      <p className="text-sm font-black uppercase tracking-widest mb-2">Leverage {strongest[0]}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
                        You're strongest in <strong className="text-green-400">{strongest[0]}</strong> at {categoryAverages[strongest[0]]}%. Use this as a confidence anchor during your defense.
                      </p>
                    </div>
                  )}
                  <div className="relative pl-6 border-l-2 border-blue-500">
                    <p className="text-sm font-black uppercase tracking-widest mb-2">Keep Practicing</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
                      {history.length < 3
                        ? 'Complete at least 3 sessions to unlock personalized insights and track your improvement curve.'
                        : `You've completed ${history.length} sessions. Consistency is the #1 predictor of defense success.`}
                    </p>
                  </div>
                </div>
                <motion.button
                  onClick={onNewSession}
                  className="w-full mt-12 py-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black rounded-3xl uppercase tracking-widest text-xs shadow-lg flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02, backgroundColor: '#eff6ff' }}
                  whileTap={{ scale: 0.98 }}
                >
                  Optimize Prep <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Transcript Review Modal */}
      <AnimatePresence>
        {selectedSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden"
            >
              <header className="p-10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <History className="w-5 h-5 text-blue-600" />
                    <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">Session Transcript</h2>
                  </div>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {selectedSession.date ? new Date(selectedSession.date).toLocaleString() : '—'} &bull; Score: {selectedSession.overallScore}%
                  </p>
                </div>
                <motion.button
                  onClick={() => setSelectedSession(null)}
                  aria-label="Close transcript"
                  title="Close transcript"
                  className="p-4 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 rounded-[24px] transition-colors"
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </header>

              <div className="flex-grow overflow-y-auto p-10 space-y-10 bg-slate-50 dark:bg-slate-950/30">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { icon: <Clock className="w-5 h-5 text-blue-500" />, label: 'Duration', value: `${selectedSession.duration}m` },
                    { icon: <ListChecks className="w-5 h-5 text-blue-500" />, label: 'Answered', value: `${selectedSession.questionsAnswered} Qs` },
                    { icon: <TrendingUp className="w-5 h-5 text-green-500" />, label: 'Score', value: `${selectedSession.overallScore}%` },
                    { icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, label: 'Weakest', value: selectedSession.weakestCategory || '—' },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`p-5 rounded-3xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 ${i === 2 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white dark:bg-slate-900'}`}
                    >
                      {stat.icon}
                      <div>
                        <p className={`text-[10px] font-black uppercase ${i === 2 ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>{stat.label}</p>
                        <p className="text-base font-black">{stat.value}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {selectedSession.categoryScores && Object.keys(selectedSession.categoryScores).length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8">
                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">Category Breakdown</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(selectedSession.categoryScores).map(([cat, score]) => (
                        <div key={cat} className="text-center">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{cat}</p>
                          <p className={`text-2xl font-black ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600 dark:text-red-400'}`}>{score}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSession.history?.length > 0 ? (
                  <div className="space-y-8">
                    {selectedSession.history.map((qa, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="bg-white dark:bg-slate-900 p-10 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-8 text-[80px] font-black text-slate-50 opacity-10 leading-none pointer-events-none">{idx + 1}</div>
                        <div className="relative z-10 space-y-6">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                              <span className="px-4 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-black uppercase tracking-widest inline-block">{qa.category}</span>
                              {qa.panelistName && (
                                <span className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest inline-block">
                                  Asked by {qa.panelistName}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-relaxed">"{qa.question}"</h4>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-950 p-8 rounded-3xl border border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-3 tracking-widest">Your Answer</p>
                            <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{qa.answer || '(no response recorded)'}</p>
                          </div>
                          {(qa.feedback.strengths?.length > 0 || qa.feedback.improvements?.length > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {qa.feedback.strengths?.length > 0 && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-[10px] font-black text-green-600 uppercase tracking-widest">
                                    <CheckCircle2 className="w-4 h-4" /> Strengths
                                  </div>
                                  <ul className="text-sm font-medium text-slate-500 dark:text-slate-400 space-y-1">
                                    {qa.feedback.strengths.map((s: string, i: number) => <li key={i} className="flex gap-2">&bull; {s}</li>)}
                                  </ul>
                                </div>
                              )}
                              {qa.feedback.improvements?.length > 0 && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest">
                                    <AlertCircle className="w-4 h-4" /> Improvements
                                  </div>
                                  <ul className="text-sm font-medium text-slate-500 dark:text-slate-400 space-y-1">
                                    {qa.feedback.improvements.map((s: string, i: number) => <li key={i} className="flex gap-2">&bull; {s}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          {qa.feedback.betterExample && (
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                              <p className="text-[10px] font-black text-blue-500 uppercase mb-3 tracking-widest">Panel's Better Response Example</p>
                              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">"{qa.feedback.betterExample}"</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-400 dark:text-slate-500 font-bold py-10">No Q&amp;A detail available for this session.</p>
                )}
              </div>

              <footer className="p-10 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-white dark:bg-slate-900 sticky bottom-0 z-10">
                <motion.button
                  onClick={() => setSelectedSession(null)}
                  className="px-10 py-5 bg-slate-900 text-white font-black rounded-3xl uppercase tracking-widest text-xs shadow-xl"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Close Review
                </motion.button>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReadinessDashboardView;
