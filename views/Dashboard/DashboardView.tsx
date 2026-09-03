
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home, BookOpen, BarChart3, Settings, LogOut,
  ChevronRight, Play, Info, CheckCircle, Circle,
  Target, TrendingUp, Clock, Plus, ExternalLink,
  ShieldCheck, AlertCircle, Trash2, Loader2, AlertTriangle,
  Download, X,
} from 'lucide-react';

// Tutorial video. Set to a YouTube/Vimeo embed URL
// (e.g. 'https://www.youtube-nocookie.com/embed/VIDEO_ID') or a local file
// placed at defensa-new/public/ (e.g. '/tutorial.mp4'). Leave '' to hide.
const TUTORIAL_VIDEO_URL = '/tutorial.mp4';
import { ProjectProfile, SessionResult } from '../../types';
import DefenseGuideModal from '../components/DefenseGuideModal';
import ReadinessDashboardView from './ReadinessDashboardView';

interface Props {
  user: any;
  token: string | null;
  project: ProjectProfile | null;
  sessionHistory: SessionResult[];
  onEditProject: () => void;
  onDeleteProject: () => Promise<void>;
  onStartPractice: () => void;
  onUploadAbstract: () => void;
  onUserUpdate?: (user: any) => void;
  onLogout: () => void;
  initialTab?: 'home' | 'projects' | 'analytics' | 'settings';
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

const YEAR_LEVELS = ['3rd Year', '4th Year'];

const DashboardView: React.FC<Props> = ({
  user, token, project, sessionHistory,
  onEditProject, onDeleteProject, onStartPractice,
  onUploadAbstract, onUserUpdate, onLogout, initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'projects' | 'analytics' | 'settings'>(initialTab ?? 'home');
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialError, setTutorialError] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleExportData = () => {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      'Session Date', 'Project', 'Session Overall Score', 'Question No',
      'Turn', 'Panelist', 'Category', 'Question', 'Answer',
      'Turn Satisfaction %', 'Final Question Score',
      'Accuracy', 'Completeness', 'Clarity', 'Confidence',
      'Strengths', 'Improvements',
    ];
    const rows: (string | number)[][] = [];
    (sessionHistory ?? []).forEach((s) => {
      const date = s.date ? new Date(s.date).toLocaleString() : '';
      (s.history ?? []).forEach((qa, i) => {
        const f = (qa.feedback ?? {}) as any;
        const thread = (qa as any).threadExchanges as any[] | undefined;
        const base = [date, s.projectTitle ?? project?.title ?? '', s.overallScore ?? '', i + 1];
        const tail = [
          f.score ?? '', f.semanticRelevance ?? '', f.keywordAccuracy ?? '',
          f.clarity ?? '', f.confidenceLevel ?? '',
          (f.strengths ?? []).join('; '), (f.improvements ?? []).join('; '),
        ];
        if (Array.isArray(thread) && thread.length > 1) {
          thread.forEach((ex, exi) => {
            rows.push([
              ...base,
              ex.isFollowUp ? `Follow-up ${exi}` : 'Root',
              qa.panelistName ?? '',
              qa.category ?? '',
              ex.question ?? '',
              ex.answer ?? '',
              typeof ex.satisfactionScore === 'number' ? Math.round(ex.satisfactionScore) : '',
              ...(exi === thread.length - 1 ? tail : ['', '', '', '', '', '', '']),
            ]);
          });
        } else {
          rows.push([
            ...base, 'Answer', qa.panelistName ?? '', qa.category ?? '',
            qa.question ?? '', qa.answer ?? '', '', ...tail,
          ]);
        }
      });
    });
    const csv =
      '﻿' +
      [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defensa-data-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const M = 50;                                   // page margin
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const CW = pageW - M * 2;                        // content width
    const INK = [30, 41, 59] as const;              // slate-800
    const MUTE = [100, 116, 139] as const;          // slate-500
    const LINE = [203, 213, 225] as const;          // slate-300
    const ACCENT = [37, 99, 235] as const;          // blue-600
    let y = M;

    const room = (h: number) => { if (y + h > pageH - M) { doc.addPage(); y = M; } };
    const gap = (h: number) => { y += h; };

    const para = (
      text: string,
      opts: { size?: number; bold?: boolean; color?: readonly number[]; indent?: number; lh?: number } = {},
    ) => {
      const { size = 10, bold = false, color = INK, indent = 0, lh = 1.5 } = opts;
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      for (const part of doc.splitTextToSize(text, CW - indent)) {
        room(size * lh);
        doc.text(part, M + indent, y);
        y += size * lh;
      }
    };

    const rule = (color: readonly number[] = LINE, w = 0.75) => {
      room(8);
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(w);
      doc.line(M, y, M + CW, y);
      gap(8);
    };

    const sectionTitle = (label: string) => {
      gap(14);
      room(30);
      para(label.toUpperCase(), { size: 12, bold: true, color: ACCENT });
      gap(2);
      rule(ACCENT, 1);
      gap(4);
    };

    const kv = (label: string, value: string) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(MUTE[0], MUTE[1], MUTE[2]);
      room(15);
      doc.text(label, M, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(INK[0], INK[1], INK[2]);
      const lines = doc.splitTextToSize(value || '-', CW - 120);
      doc.text(lines[0], M + 120, y);
      y += 15;
      for (const extra of lines.slice(1)) { room(13); doc.text(extra, M + 120, y); y += 13; }
    };

    // Simple fixed-column table with header band, zebra rows and wrapping cells.
    const table = (headers: string[], rows: string[][], widths: number[]) => {
      const scale = CW / widths.reduce((a, b) => a + b, 0);
      const col = widths.map((w) => w * scale);
      const x0 = M;
      const pad = 5;
      const drawRow = (cells: string[], bold: boolean, fill?: readonly number[]) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(8.5);
        const wrapped = cells.map((c, i) => doc.splitTextToSize(String(c ?? ''), col[i] - pad * 2));
        const rowH = Math.max(...wrapped.map((w) => w.length)) * 11 + 8;
        room(rowH);
        if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(x0, y - 9, CW, rowH, 'F'); }
        doc.setTextColor(bold ? 255 : INK[0], bold ? 255 : INK[1], bold ? 255 : INK[2]);
        let cx = x0;
        wrapped.forEach((w, i) => {
          w.forEach((ln: string, li: number) => doc.text(ln, cx + pad, y + li * 11));
          cx += col[i];
        });
        y += rowH;
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.setLineWidth(0.5);
        doc.line(x0, y - 4, x0 + CW, y - 4);
      };
      drawRow(headers, true, ACCENT);
      rows.forEach((r, i) => drawRow(r, false, i % 2 ? [241, 245, 249] : undefined));
      gap(6);
    };

    const sessions = sessionHistory ?? [];
    const scored = sessions.filter((s) => (s.history?.length ?? 0) > 0);
    const avg = (nums: number[]) =>
      nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;

    // ── Header ──────────────────────────────────────────────────────
    para('DEFENSA', { size: 20, bold: true, color: ACCENT });
    para('Defense Readiness Report', { size: 13, bold: true });
    para(`Generated ${new Date().toLocaleString()}`, { size: 9, color: MUTE });

    // ── Student profile ─────────────────────────────────────────────
    sectionTitle('Student Profile');
    kv('Name', user?.fullName ?? '-');
    kv('Email', user?.email ?? '-');
    kv('Program', `${user?.program ?? '-'}${user?.yearLevel ? `  (${user.yearLevel})` : ''}`);
    if (project) {
      kv('Project Title', project.title);
      kv('Methodology', project.methodology ?? '-');
    }

    // ── Summary ─────────────────────────────────────────────────────
    sectionTitle('Performance Summary');
    kv('Sessions completed', String(sessions.length));
    kv('Answered sessions', String(scored.length));
    kv('Average overall score', `${avg(scored.map((s) => s.overallScore ?? 0))} / 100`);
    const catAgg: Record<string, number[]> = {};
    scored.forEach((s) =>
      Object.entries(s.categoryScores ?? {}).forEach(([k, v]) => {
        (catAgg[k] ??= []).push(Number(v) || 0);
      }),
    );
    const catMeans = Object.entries(catAgg).map(([k, v]) => [k, avg(v)] as const).sort((a, b) => b[1] - a[1]);
    if (catMeans.length) {
      kv('Strongest area', `${catMeans[0][0]} (${catMeans[0][1]}%)`);
      kv('Focus area', `${catMeans[catMeans.length - 1][0]} (${catMeans[catMeans.length - 1][1]}%)`);
    }

    // ── Sessions overview table ─────────────────────────────────────
    sectionTitle('Practice Sessions Overview');
    table(
      ['#', 'Date & Time', 'Score', 'Q&A', 'Weakest Area'],
      sessions.map((s, i) => [
        String(i + 1),
        s.date ? new Date(s.date).toLocaleString() : '-',
        `${s.overallScore ?? 0} / 100`,
        `${s.questionsAnswered ?? s.history?.length ?? 0} / ${s.history?.length ?? 0}`,
        s.weakestCategory ?? '-',
      ]),
      [22, 150, 55, 45, 90],
    );

    // ── Detailed analysis ──────────────────────────────────────────
    sectionTitle('Detailed Question Analysis');
    sessions.forEach((s, si) => {
      gap(10);
      room(24);
      para(
        `Session ${si + 1}  ·  ${s.date ? new Date(s.date).toLocaleString() : '-'}  ·  Overall ${s.overallScore ?? 0}/100`,
        { size: 10.5, bold: true },
      );
      gap(2);
      rule();
      if (!s.history?.length) { para('No questions were answered in this session.', { size: 9, color: MUTE }); return; }

      s.history.forEach((qa, qi) => {
        const f = (qa.feedback ?? {}) as any;
        const thread = (qa as any).threadExchanges as any[] | undefined;
        gap(6);
        para(`Q${qi + 1}  ·  ${qa.category ?? 'General'}${qa.panelistName ? `  ·  asked by ${qa.panelistName}` : ''}`,
          { size: 9, bold: true, color: MUTE });
        para(qa.question ?? '-', { size: 10 });
        gap(2);

        if (Array.isArray(thread) && thread.length > 1) {
          thread.forEach((ex, exi) => {
            para(
              `${ex.isFollowUp ? `Follow-up ${exi}` : 'Root question'}${typeof ex.satisfactionScore === 'number' ? `  —  ${Math.round(ex.satisfactionScore)}% satisfied` : ''}`,
              { size: 8.5, bold: true, color: MUTE, indent: 12 },
            );
            para(ex.question ?? '', { size: 9, indent: 12, color: MUTE });
            para(`Answer: ${ex.answer || '(no answer)'}`, { size: 9, indent: 12 });
            if (ex.panelistRemark) para(`Panel: ${ex.panelistRemark}`, { size: 8.5, indent: 12, color: MUTE });
            gap(3);
          });
        } else {
          para(`Answer: ${qa.answer || '(no answer)'}`, { size: 9.5, indent: 12 });
        }

        para(
          `Final ${f.score ?? '-'}/100    Accuracy ${f.semanticRelevance ?? '-'}    Completeness ${f.keywordAccuracy ?? '-'}    Clarity ${f.clarity ?? '-'}    Confidence ${f.confidenceLevel ?? '-'}`,
          { size: 8.5, bold: true, indent: 12 },
        );
        if ((f.strengths ?? []).length) para(`Strengths: ${f.strengths.join('; ')}`, { size: 8.5, indent: 12, color: MUTE });
        if ((f.improvements ?? []).length) para(`Improvements: ${f.improvements.join('; ')}`, { size: 8.5, indent: 12, color: MUTE });
        gap(4);
        rule([226, 232, 240], 0.4);
      });
    });

    // ── Footer page numbers ────────────────────────────────────────
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(MUTE[0], MUTE[1], MUTE[2]);
      doc.text('Defensa — Defense Readiness Report', M, pageH - 24);
      doc.text(`Page ${p} of ${total}`, pageW - M, pageH - 24, { align: 'right' });
    }

    doc.save(`defensa-readiness-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleConfirmRemove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      await onDeleteProject();
      setShowRemoveConfirm(false);
    } catch (err: any) {
      setRemoveError(err?.message || 'Could not remove the project. Please try again.');
    } finally {
      setRemoving(false);
    }
  };
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.avatar ?? null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [nameDraft, setNameDraft] = useState<string>(user?.fullName ?? '');
  const [programDraft, setProgramDraft] = useState<string>(user?.program ?? '');
  const [yearDraft, setYearDraft] = useState<string>(user?.yearLevel ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Re-sync drafts / photo whenever the authoritative user object changes
  useEffect(() => {
    setPhotoPreview(user?.avatar ?? null);
    setNameDraft(user?.fullName ?? '');
    setProgramDraft(user?.program ?? '');
    setYearDraft(user?.yearLevel ?? '');
  }, [user?.avatar, user?.fullName, user?.program, user?.yearLevel]);

  const profileDirty =
    nameDraft.trim() !== (user?.fullName ?? '') ||
    (programDraft.trim() || '') !== (user?.program ?? '') ||
    (yearDraft.trim() || '') !== (user?.yearLevel ?? '');

  const patchProfile = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not save your changes.');
    onUserUpdate?.(data.user);
    return data.user;
  };

  // Resize the chosen image to a small square and store it as a data URI so it
  // persists in the database and shows on every device until changed again.
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setProfileMsg(null);
    setPhotoBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas not supported.'));
          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('That file is not a valid image.'));
        img.src = URL.createObjectURL(file);
      });
      await patchProfile({ avatar: dataUrl });
      setPhotoPreview(dataUrl);
      setProfileMsg({ ok: true, text: 'Photo updated.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message || 'Could not update your photo.' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!nameDraft.trim()) {
      setProfileMsg({ ok: false, text: 'Your name cannot be empty.' });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await patchProfile({
        fullName: nameDraft.trim(),
        program: programDraft.trim(),
        yearLevel: yearDraft.trim(),
      });
      setProfileMsg({ ok: true, text: 'Profile saved.' });
    } catch (err: any) {
      setProfileMsg({ ok: false, text: err.message || 'Could not save your profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const userInitials = useMemo(() => {
    if (!user?.fullName) return '??';
    return user.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }, [user?.fullName]);

  const sessionAvgScore = useMemo(() => {
    if (!sessionHistory?.length) return 0;
    return Math.round(sessionHistory.reduce((acc, s) => acc + s.overallScore, 0) / sessionHistory.length);
  }, [sessionHistory]);

  const sessionCount = sessionHistory?.length ?? 0;
  const readinessPct = sessionAvgScore;
  const readinessLabel = readinessPct >= 80 ? 'Optimal' : readinessPct >= 60 ? 'On Track' : sessionCount === 0 ? 'No Data' : 'Needs Work';
  const hasAbstract = !!project?.abstractText;

  const animatedSessionCount = useAnimatedCounter(sessionCount);
  const animatedAvgScore = useAnimatedCounter(sessionAvgScore);
  const animatedReadiness = useAnimatedCounter(readinessPct);

  const navItems = [
    { id: 'home' as const, icon: Home, label: 'Dashboard' },
    { id: 'projects' as const, icon: BookOpen, label: 'Projects' },
    { id: 'analytics' as const, icon: BarChart3, label: 'Analytics' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="mx-4 md:mx-6 mt-4 md:mt-6 bg-slate-950 text-white px-4 md:px-6 py-4 rounded-2xl border border-white/10 shadow-lg shadow-black/20 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 shrink-0"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight uppercase block leading-none">Defensa</span>
            <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Student Hub</span>
          </div>
        </motion.div>

        <nav className="flex items-center justify-center gap-2 flex-wrap flex-grow">
          {navItems.map((item, i) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.35 }}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-colors relative ${activeTab === item.id ? 'text-white' : 'text-slate-400 dark:text-slate-500 hover:text-white'}`}
              whileHover={{ y: -2 }}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="student-nav-bg"
                  className="absolute inset-0 bg-blue-600 rounded-xl shadow-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <item.icon className="w-5 h-5" /> {item.label}
              </span>
            </motion.button>
          ))}
        </nav>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2.5 text-slate-400 dark:text-slate-500 hover:text-white transition-colors font-bold text-sm shrink-0"
          whileHover={{ y: -2 }}
        >
          <LogOut className="w-5 h-5" /> Logout
        </motion.button>
      </header>

      <main className="flex-grow p-4 md:p-10 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">

          {activeTab === 'home' && (
            <motion.div key="home" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Hello, {user?.fullName?.split(' ')[0]}! 👋</h1>
                  <p className="text-slate-500 dark:text-slate-400">Ready to sharpen your defense skills today?</p>
                </div>
                <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 font-bold shrink-0">
                    {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover" /> : userInitials}
                  </div>
                  <div className="hidden sm:block pr-4">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-none mb-1">{user?.fullName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-none">{user?.program} - {user?.yearLevel}</p>
                  </div>
                </div>
              </motion.header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <motion.section variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-500/10 rounded-full -mr-16 -mt-16" />
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-8 flex items-center gap-2 tracking-tight">
                      <Target className="w-6 h-6 text-blue-600" /> GET STARTED CHECKLIST
                    </h2>

                    <div className="space-y-4">
                      {[
                        { done: true, label: 'Account created & verified', icon: <CheckCircle className="w-6 h-6 text-green-500" />, classes: 'bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800' },
                        { done: !!(project?.abstractText), label: 'Upload your research manuscript', icon: project?.abstractText ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600" />, classes: `border-2 border-dashed ${project?.abstractText ? 'bg-green-50 dark:bg-green-500/10/50 border-green-200' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}` },
                        { done: false, label: 'Start your first practice session', icon: <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600" />, classes: 'border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900' },
                      ].map((step, i) => (
                        <motion.div
                          key={step.label}
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + i * 0.07, duration: 0.35 }}
                          className={`flex items-center gap-4 p-5 rounded-3xl ${step.classes}`}
                        >
                          {step.icon}
                          <span className={`font-bold ${step.done ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>{step.label}</span>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-10">
                      {!hasAbstract ? (
                        <div className="space-y-4">
                          <div className="flex items-start gap-3 p-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 rounded-3xl">
                            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-black text-amber-800 dark:text-amber-300 text-sm">Manuscript required before practice</p>
                              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">Upload your research manuscript first so the AI can generate relevant questions.</p>
                            </div>
                          </div>
                          <motion.button
                            type="button"
                            onClick={onUploadAbstract}
                            className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white font-black rounded-3xl shadow-xl flex items-center justify-center gap-2 uppercase tracking-tighter"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            Upload Manuscript <ChevronRight className="w-5 h-5" />
                          </motion.button>
                        </div>
                      ) : (
                        <motion.button
                          type="button"
                          onClick={onStartPractice}
                          className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white font-black rounded-3xl shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 uppercase tracking-tighter"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          Start Practice <ChevronRight className="w-5 h-5" />
                        </motion.button>
                      )}
                    </div>
                  </motion.section>

                  {project && (
                    <motion.section variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex items-center justify-between mb-8 gap-3">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tighter">Active Project</h2>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={onEditProject}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRemoveError(null); setShowRemoveConfirm(true); }}
                            title="Remove project"
                            aria-label="Remove project"
                            className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="p-8 bg-slate-50 dark:bg-slate-950 rounded-[32px] border border-slate-100 dark:border-slate-800">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-4 leading-tight break-words [overflow-wrap:anywhere]">{project.title}</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <TrendingUp className="w-5 h-5 text-blue-500" />
                            <div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">Methodology</p>
                              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{project.methodology}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <Clock className="w-5 h-5 text-blue-500" />
                            <div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">Defense Date</p>
                              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{project.defenseDate}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.section>
                  )}
                </div>

                <div className="space-y-8">
                  <motion.div
                    variants={itemVariants}
                    className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group"
                    whileHover={{ y: -4, boxShadow: '0 32px 64px rgba(0,0,0,0.3)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all" />
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">Defense Readiness</h3>
                    <div className="space-y-8">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl font-black">{sessionCount > 0 ? `${animatedReadiness}%` : '—'}</span>
                          <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest">{readinessLabel}</span>
                        </div>
                        <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div
                            className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${readinessPct}%` }}
                            transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.5 }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-white/5 rounded-2xl">
                          <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Sessions</p>
                          <p className="text-xl font-black">{animatedSessionCount}</p>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-2xl">
                          <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Avg Score</p>
                          <p className="text-xl font-black">{sessionCount > 0 ? animatedAvgScore : '—'}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm"
                    whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2 uppercase tracking-tighter">
                      <Info className="w-5 h-5 text-blue-500" /> Resources
                    </h3>
                    <div className="space-y-4">
                      <motion.button
                        type="button"
                        onClick={() => { setTutorialError(false); setShowTutorial(true); }}
                        className="w-full p-6 flex items-center justify-between bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-3xl group cursor-pointer transition-colors"
                        whileTap={{ scale: 0.99 }}
                      >
                        <div>
                          <p className="font-black text-blue-900 dark:text-blue-200 leading-none mb-1">Tutorial Video</p>
                          <p className="text-xs text-blue-600 font-bold uppercase tracking-widest">Master simulation</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play className="w-4 h-4 fill-current ml-1" />
                        </div>
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setShowGuide(true)}
                        className="w-full p-6 flex items-center justify-between bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-3xl group cursor-pointer transition-colors"
                        whileTap={{ scale: 0.99 }}
                      >
                        <div>
                          <p className="font-black text-slate-800 dark:text-slate-100 leading-none mb-1">Defense Guide</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Top prep tips</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500 group-hover:translate-x-1 transition-transform" />
                      </motion.button>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'projects' && (
            <motion.div key="projects" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div>
                  <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Project</h1>
                  <p className="text-slate-500 dark:text-slate-400">Your capstone research project.</p>
                </div>
                {!project && (
                  <motion.button onClick={onUploadAbstract} className="px-8 py-4 bg-blue-600 text-white font-black rounded-3xl shadow-xl shadow-blue-500/20 flex items-center gap-2 uppercase tracking-tighter" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Plus className="w-5 h-5" /> Upload File
                  </motion.button>
                )}
              </motion.header>

              {!project ? (
                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-800 p-20 text-center">
                  <div className="w-20 h-20 bg-slate-50 dark:bg-slate-950 text-slate-300 dark:text-slate-600 rounded-full flex items-center justify-center mx-auto mb-6"><BookOpen className="w-10 h-10" /></div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">No project yet</h3>
                  <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8 font-medium leading-relaxed">Upload your manuscript or thesis to set up your project profile automatically.</p>
                  <motion.button onClick={onUploadAbstract} className="px-10 py-5 bg-slate-900 text-white font-black rounded-3xl uppercase tracking-tighter shadow-xl" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>Upload File</motion.button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <motion.div
                    variants={itemVariants}
                    className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm relative group cursor-pointer"
                    whileHover={{ y: -4, borderColor: '#3b82f6', boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-black uppercase tracking-widest">Active</span>
                      <button type="button" title="View project details" aria-label="View project details" className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"><ExternalLink className="w-5 h-5" /></button>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-8 leading-tight break-words [overflow-wrap:anywhere]">{project.title}</h3>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-4">
                        <motion.button onClick={onStartPractice} className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl uppercase tracking-tighter text-sm shadow-lg shadow-blue-100" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>Practice</motion.button>
                        <motion.button onClick={onEditProject} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-black rounded-2xl uppercase tracking-tighter text-sm transition-colors" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>Edit Info</motion.button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setRemoveError(null); setShowRemoveConfirm(true); }}
                        className="flex items-center justify-center gap-2 py-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 font-black rounded-2xl uppercase tracking-tighter text-xs transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Remove Project
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <motion.header variants={itemVariants} className="mb-10">
                <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">Account Settings</h1>
                <p className="text-slate-500 dark:text-slate-400">Manage your profile and platform preferences.</p>
              </motion.header>

              <div className="max-w-3xl space-y-8">
                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm" whileHover={{ y: -2, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                  <div className="flex items-center gap-6 mb-10">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-4xl font-black text-blue-600 shadow-inner shrink-0">
                      {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover" /> : userInitials}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none mb-2">{user?.fullName}</h3>
                      <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">{user?.email}</p>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoBusy}
                        className="mt-4 text-xs font-black text-blue-600 uppercase tracking-widest hover:underline disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {photoBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {photoBusy ? 'Saving…' : photoPreview ? 'Change Photo' : 'Add Photo'}
                      </button>
                    </div>
                  </div>
                  <div className="mb-6">
                    <label htmlFor="settings-name" className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Full Name</label>
                    <input
                      id="settings-name"
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Your full name"
                      maxLength={120}
                      className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="settings-program" className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Program</label>
                      <input
                        id="settings-program"
                        type="text"
                        value={programDraft}
                        onChange={(e) => setProgramDraft(e.target.value)}
                        placeholder="e.g. BSIT"
                        maxLength={120}
                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                      />
                    </div>
                    <div>
                      <label htmlFor="settings-year" className="block text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Year Level</label>
                      <select
                        id="settings-year"
                        value={yearDraft}
                        onChange={(e) => setYearDraft(e.target.value)}
                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                      >
                        <option value="">Not set</option>
                        {YEAR_LEVELS.map((y) => <option key={y} value={y}>{y}</option>)}
                        {yearDraft && !YEAR_LEVELS.includes(yearDraft) && (
                          <option value={yearDraft}>{yearDraft}</option>
                        )}
                      </select>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-4">
                    <motion.button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={!profileDirty || savingProfile}
                      className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-tighter text-sm rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      whileTap={{ scale: 0.98 }}
                    >
                      {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Changes
                    </motion.button>
                    {profileMsg && (
                      <span className={`text-sm font-bold ${profileMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                        {profileMsg.text}
                      </span>
                    )}
                  </div>
                </motion.div>

                <motion.div variants={itemVariants} className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-lg font-black mb-6">Security &amp; Session</h3>
                  <div className="space-y-6">
                    <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Account Security</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Your session is secured by Firebase Authentication with industry-standard encryption.</p>
                    </div>
                    <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Session JWT Token</p>
                        <button type="button" onClick={() => setShowToken(!showToken)} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">{showToken ? 'Hide' : 'Show'}</button>
                      </div>
                      <div className="relative">
                        <div className={`text-[10px] font-mono p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl break-all overflow-hidden transition-all ${showToken ? 'max-h-40 overflow-y-auto' : 'max-h-10 blur-[2px] select-none'}`}>{token || 'No token available'}</div>
                        {!showToken && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <button type="button" onClick={() => setShowToken(true)} className="px-3 py-1 bg-white/80 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">Click to reveal</button>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">This token identifies your session. Do not share it with anyone.</p>
                    </div>
                    <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Export My Data</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mb-4">Download your profile and every practice session, question, answer, and score. Choose CSV for a spreadsheet or PDF for a printable report.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <motion.button
                          type="button"
                          onClick={handleExportData}
                          className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white font-black uppercase tracking-tighter text-sm flex justify-between items-center transition-colors"
                          whileHover={{ x: 4 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          Download CSV <Download className="w-5 h-5" />
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={handleExportPDF}
                          className="w-full px-6 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl text-slate-700 dark:text-slate-200 font-black uppercase tracking-tighter text-sm flex justify-between items-center transition-colors"
                          whileHover={{ x: 4 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          Download PDF <Download className="w-5 h-5" />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div key="analytics" variants={pageVariants} initial="hidden" animate="visible" exit="exit">
              <ReadinessDashboardView
                history={sessionHistory}
                embedded
                onBack={() => setActiveTab('home')}
                onNewSession={onStartPractice}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <DefenseGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />

      <AnimatePresence>
        {showTutorial && (
          <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowTutorial(false)}
          >
            <motion.div
              className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl"
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter leading-none">Tutorial Video</p>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">How to use Defensa</p>
                </div>
                <button type="button" onClick={() => setShowTutorial(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-black aspect-video">
                {!TUTORIAL_VIDEO_URL || tutorialError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 p-8 bg-slate-50 dark:bg-slate-950">
                    <Play className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">The tutorial video is not available yet.</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
                      In the meantime, open the Defense Guide for step by step preparation tips.
                    </p>
                    <button type="button" onClick={() => { setShowTutorial(false); setShowGuide(true); }}
                      className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-colors">
                      Open Defense Guide
                    </button>
                  </div>
                ) : /youtube|vimeo/.test(TUTORIAL_VIDEO_URL) ? (
                  <iframe
                    src={TUTORIAL_VIDEO_URL}
                    title="Defensa tutorial"
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={TUTORIAL_VIDEO_URL}
                    controls
                    autoPlay
                    className="w-full h-full"
                    onError={() => setTutorialError(true)}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRemoveConfirm && (
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
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl p-8 relative"
            >
              <div className="w-14 h-14 bg-red-100 dark:bg-red-500/15 rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter">
                Remove This Project?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 leading-relaxed">
                This permanently deletes the project and its uploaded manuscript for your whole group.
                Your past practice sessions and scores are kept. You can set up a new project right after.
              </p>
              {project && (
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-6">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Project</span>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">{project.title}</p>
                </div>
              )}
              {removeError && (
                <p className="text-xs text-red-500 font-semibold mb-4 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {removeError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRemoveConfirm(false)}
                  disabled={removing}
                  className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-2xl transition-all uppercase tracking-tight text-xs disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemove}
                  disabled={removing}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl transition-all uppercase tracking-tight text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-200 dark:shadow-red-900/30 disabled:opacity-50"
                >
                  {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {removing ? 'Removing…' : 'Remove Project'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DashboardView;
