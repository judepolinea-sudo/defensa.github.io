import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock, BarChart, MessageSquare,
  ChevronLeft, ChevronRight, CheckCircle2, Loader2,
  FileText, BookOpen, Layers, Sparkles, Cpu, Wifi, WifiOff,
} from 'lucide-react';
import { DifficultyLevel, ProjectProfile } from '../../types';
import {
  analyzeDocumentOutline, DocumentOutline, OutlineChapter,
  detectResearchDomain, ResearchDomain,
} from '../../services/geminiService';

interface Props {
  project?: ProjectProfile | null;
  onStart: (config: any) => void;
  onBack: () => void;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const SessionConfigView: React.FC<Props> = ({ project, onStart, onBack }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [duration, setDuration] = useState(30);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(DifficultyLevel.INTERMEDIATE);
  const [mode, setMode] = useState('text');

  // Domain is still detected here (drives question generation later), but
  // panelists themselves are no longer picked in setup — they're generated
  // server-side, with fresh random names, once the practice session starts.
  const [detectedDomain, setDetectedDomain] = useState<ResearchDomain>('default');

  const [outline, setOutline] = useState<DocumentOutline | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());
  const [ownAiStatus, setOwnAiStatus] = useState<{ online: boolean; indexedChunks: number; engine?: string } | null>(null);

  useEffect(() => {
    if (!project?.abstractText) return;
    setDetectedDomain(detectResearchDomain(project.abstractText));
  }, [project?.abstractText]);

  useEffect(() => {
    fetch('/api/ai/status')
      .then(r => r.json())
      .then(d => setOwnAiStatus({ online: d.online, indexedChunks: d.indexedChunks ?? 0, engine: d.engine }))
      .catch(() => setOwnAiStatus({ online: false, indexedChunks: 0, engine: 'none' }));
  }, []);

  const handleProceedToOutline = useCallback(async () => {
    setStep(2);
    setIsAnalyzing(true);
    try {
      const result = await analyzeDocumentOutline(project?.abstractText || '');
      setOutline(result);
      const allIds = new Set(result.chapters.flatMap(c => c.sections.map(s => s.id)));
      setSelectedSectionIds(allIds);
    } catch (err) {
      console.error('Outline analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [project?.abstractText]);

  const toggleSection = (id: string) =>
    setSelectedSectionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  const toggleChapter = (chapter: OutlineChapter) => {
    const allSelected = chapter.sections.every(s => selectedSectionIds.has(s.id));
    setSelectedSectionIds(prev => {
      const next = new Set(prev);
      chapter.sections.forEach(s => allSelected ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  };

  const handleStart = () => {
    const selectedLabels = outline
      ? outline.chapters.flatMap(c =>
          c.sections.filter(s => selectedSectionIds.has(s.id)).map(s => s.label)
        )
      : [];
    onStart({ duration, difficulty, detectedDomain, mode, selectedSections: selectedLabels.length > 0 ? selectedLabels : undefined });
  };

  const totalSections = outline?.chapters.flatMap(c => c.sections).length ?? 0;
  const selectedPct = totalSections > 0 ? (selectedSectionIds.size / totalSections) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-10 flex flex-col items-center">
      <div className="max-w-4xl w-full">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <button
            type="button"
            onClick={step === 2 ? () => setStep(1) : onBack}
            className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors mb-4 group font-bold"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            {step === 2 ? 'Back to Configuration' : 'Back to Dashboard'}
          </button>

          <div className="flex items-center justify-between mb-3">
            <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
              {step === 1 ? 'Configure Practice Session' : 'Select Defense Scope'}
            </h1>
            {ownAiStatus && (() => {
              const engine = ownAiStatus.engine ?? (ownAiStatus.online ? 'trained' : 'none');
              const operational = engine === 'trained' || engine === 'cloud';
              const label =
                engine === 'trained'
                  ? `Defensa AI · trained model · ${ownAiStatus.indexedChunks} chunks`
                  : engine === 'cloud'
                    ? 'Defensa AI · online (cloud engine)'
                    : 'Defensa AI · unavailable';
              return (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                  operational
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200'
                    : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-200'
                }`}>
                  <Cpu className="w-3.5 h-3.5" />
                  {label}
                  {operational ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                </div>
              );
            })()}
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3">
            {([{ n: 1, label: 'Session Setup' }, { n: 2, label: 'Outline Selection' }] as const).map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all duration-300 ${
                  step === n ? 'bg-blue-600 border-blue-600 text-white' :
                  step > n  ? 'bg-emerald-500 border-emerald-500 text-white' :
                  'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                }`}>
                  {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest transition-colors ${step === n ? 'text-blue-600' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
                {n < 2 && <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />}
              </div>
            ))}
          </div>
        </motion.header>

        <AnimatePresence mode="wait">

          {/* ═══ STEP 1 ═══ */}
          {step === 1 && (
            <motion.div key="step1" variants={container} initial="hidden" animate="show" exit="exit">
              <div className="bg-white dark:bg-slate-900 rounded-[40px] p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-12">

                {/* Duration */}
                <motion.section variants={item}>
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" /> Session Duration
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { d: 15, sub: 'Quick Practice' },
                      { d: 30, sub: 'Recommended' },
                      { d: 45, sub: 'Full Simulation' },
                    ].map(({ d, sub }) => (
                      <motion.button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={`p-6 rounded-3xl border-2 text-left relative overflow-hidden ${
                          duration === d ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10/50' : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30'
                        }`}
                        whileHover={{ scale: 1.02, borderColor: duration === d ? '#2563eb' : '#cbd5e1' }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      >
                        <p className={`font-black uppercase tracking-tighter text-lg ${duration === d ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-100'}`}>{d} minutes</p>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{sub}</p>
                        {duration === d && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4">
                            <CheckCircle2 className="w-5 h-5 text-blue-600" />
                          </motion.div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </motion.section>

                {/* Difficulty */}
                <motion.section variants={item}>
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <BarChart className="w-4 h-4 text-blue-500" /> Difficulty Level
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.values(DifficultyLevel).map((lv) => (
                      <motion.button
                        key={lv}
                        type="button"
                        onClick={() => setDifficulty(lv)}
                        className={`p-5 rounded-2xl border-2 font-black uppercase tracking-widest text-xs transition-colors ${
                          difficulty === lv
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 shadow-sm'
                            : 'border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950/30'
                        }`}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      >
                        {lv}
                      </motion.button>
                    ))}
                  </div>
                </motion.section>

                {/* Mode */}
                <motion.section variants={item}>
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" /> Interaction Mode
                  </h3>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-full sm:w-max relative">
                    {['text', 'voice', 'hybrid'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`flex-grow sm:flex-initial px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative z-10 ${
                          mode === m ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
                        }`}
                      >
                        {mode === m && (
                          <motion.div
                            layoutId="mode-pill"
                            className="absolute inset-0 bg-white dark:bg-slate-900 rounded-xl shadow-md"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{m}</span>
                      </button>
                    ))}
                  </div>
                </motion.section>

                <motion.div variants={item} className="pt-4">
                  <motion.button
                    type="button"
                    onClick={handleProceedToOutline}
                    disabled={!project?.abstractText}
                    className="w-full py-5 bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-3xl shadow-2xl shadow-blue-200 uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3"
                    whileHover={project?.abstractText ? { scale: 1.02, backgroundColor: '#2563eb' } : {}}
                    whileTap={project?.abstractText ? { scale: 0.98 } : {}}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Layers className="w-5 h-5" />
                    Continue — Select Defense Scope
                    <ChevronRight className="w-5 h-5" />
                  </motion.button>
                  {!project?.abstractText && (
                    <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-3">Upload your research abstract first to enable scope selection.</p>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ═══ STEP 2 ═══ */}
          {step === 2 && (
            <motion.div key="step2" variants={container} initial="hidden" animate="show" exit="exit">
              <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">

                {/* Analyzing state */}
                <AnimatePresence mode="wait">
                  {isAnalyzing && (
                    <motion.div
                      key="analyzing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-16 text-center"
                    >
                      <div className="relative w-16 h-16 mx-auto mb-6">
                        <motion.div
                          className="absolute inset-0 rounded-2xl border-2 border-blue-200"
                          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 border-2 border-blue-200 rounded-2xl flex items-center justify-center">
                          <Sparkles className="w-7 h-7 text-blue-500" />
                        </div>
                      </div>
                      <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase mb-2">Analyzing Document</h2>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Extracting chapters, sections, and key topics…</p>
                      <div className="space-y-3 max-w-xs mx-auto">
                        {[0.3, 0.15, 0.45].map((delay, i) => (
                          <motion.div
                            key={i}
                            className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: delay }}
                          >
                            <motion.div
                              className="h-full bg-blue-200 rounded-full"
                              animate={{ x: ['-100%', '200%'] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay }}
                            />
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {!isAnalyzing && outline && (
                    <motion.div key="outline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                      {/* Header bar */}
                      <div className="px-10 pt-10 pb-6 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                          <div>
                            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tighter">Document Defense Outline</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Select the sections you want to be examined on.</p>
                          </div>
                          <div className="flex gap-3">
                            <motion.button
                              type="button"
                              onClick={() => setSelectedSectionIds(new Set(outline.chapters.flatMap(c => c.sections.map(s => s.id))))}
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 border border-blue-200"
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                            >
                              Select All
                            </motion.button>
                            <motion.button
                              type="button"
                              onClick={() => setSelectedSectionIds(new Set())}
                              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
                              whileHover={{ scale: 1.04 }}
                              whileTap={{ scale: 0.96 }}
                            >
                              Deselect All
                            </motion.button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-blue-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${selectedPct}%` }}
                              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                            />
                          </div>
                          <span className="text-xs font-black text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {selectedSectionIds.size} / {totalSections} sections
                          </span>
                        </div>
                      </div>

                      {/* Chapter list */}
                      <div className="divide-y divide-slate-100">
                        {outline.chapters.map((chapter, ci) => {
                          const allSelected = chapter.sections.every(s => selectedSectionIds.has(s.id));
                          const someSelected = chapter.sections.some(s => selectedSectionIds.has(s.id));
                          return (
                            <motion.div
                              key={chapter.title}
                              className="px-10 py-6"
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: ci * 0.07, duration: 0.3 }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleChapter(chapter)}
                                className="flex items-center gap-3 w-full text-left mb-4 group"
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  allSelected ? 'bg-blue-600 border-blue-600' :
                                  someSelected ? 'bg-blue-200 border-blue-400' :
                                  'border-slate-300 dark:border-slate-700 group-hover:border-blue-400'
                                }`}>
                                  {allSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                  {someSelected && !allSelected && <div className="w-2 h-2 rounded-sm bg-blue-500" />}
                                </div>
                                <div className="flex items-center gap-2">
                                  <BookOpen className="w-4 h-4 text-blue-500" />
                                  <span className="font-black text-slate-800 dark:text-slate-100 text-sm uppercase tracking-tight">{chapter.title}</span>
                                </div>
                                <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                  {chapter.sections.filter(s => selectedSectionIds.has(s.id)).length}/{chapter.sections.length}
                                </span>
                              </button>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-8">
                                {chapter.sections.map((section, si) => {
                                  const checked = selectedSectionIds.has(section.id);
                                  return (
                                    <motion.button
                                      key={section.id}
                                      type="button"
                                      onClick={() => toggleSection(section.id)}
                                      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left ${
                                        checked
                                          ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 text-blue-800 dark:text-blue-200'
                                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                      }`}
                                      initial={{ opacity: 0, x: -8 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: ci * 0.07 + si * 0.04, duration: 0.25 }}
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                    >
                                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                        checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-700'
                                      }`}>
                                        <AnimatePresence>
                                          {checked && (
                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                              <CheckCircle2 className="w-3 h-3 text-white" />
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                      <span className="text-xs font-bold">{section.label}</span>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>

                      {/* Start button */}
                      <div className="px-10 py-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                        <motion.button
                          type="button"
                          onClick={handleStart}
                          disabled={selectedSectionIds.size === 0}
                          className="w-full py-5 bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-3xl shadow-2xl shadow-blue-200 uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3"
                          whileHover={selectedSectionIds.size > 0 ? { scale: 1.02 } : {}}
                          whileTap={selectedSectionIds.size > 0 ? { scale: 0.98 } : {}}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        >
                          <FileText className="w-5 h-5" />
                          Start Defense — {selectedSectionIds.size} Section{selectedSectionIds.size !== 1 ? 's' : ''} Selected
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};

export default SessionConfigView;
