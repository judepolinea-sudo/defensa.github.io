import React, { useState, useEffect, useCallback, Component, ErrorInfo, useRef, useLayoutEffect } from 'react';
import {
  X, Mic, MicOff, Send, Loader2, Sparkles,
  Timer, ChevronRight, CheckCircle2, AlertCircle,
  FastForward, Info, RefreshCw, Volume2, VolumeX,
  Square, Play, Edit3, StopCircle, BarChart3,
  Clock, Target, BookOpen, Award, TrendingUp,
  CircleDot, Users, FileText, Zap, WifiOff,
} from 'lucide-react';
import {
  speakText, stopSpeaking, startSTT, primeSpeechSynthesis,
  getPanelistReaction, analyzeSpeechConfidence,
  isTTSSupported, isSTTSupported, checkMicPermission,
  type STTSession,
} from '../../services/voiceService';
import { ProjectProfile, SessionResult, QuestionAnswer, Panelist, RagChunk, SessionPhase, ThreadExchange, SatisfactionResult } from '../../types';
import { PANELISTS } from '../../constants';
import { getSessionToken } from '../../services/authService';
import {
  generateDynamicQuestion, evaluateResponseDetailed, evaluateSatisfaction,
  RubricEvaluation, PanelQuestion, AIUnavailableError,
  SectionCoverage, CoverageMap,
  detectDocumentSections, initCoverageMap, updateCoverage, getNextSection,
  createChunks, getEmbeddings, resetContextualFallback,
} from '../../services/geminiService';
import ShaderBackground from '../../components/ui/shader-background';

// Sets width imperatively to avoid JSX style-prop lint warnings for dynamic values
const ProgressFill = ({ pct, className }: { pct: number; className: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.style.width = `${pct}%`; }, [pct]);
  return <div ref={ref} className={className} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Boundary
// ─────────────────────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; errorMessage: string }

class SessionErrorBoundary extends Component<{ children: React.ReactNode; onReset: () => void }, EBState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, errorMessage: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Session render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-8">
          <div className="text-center max-w-lg">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-200">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3">Session Error</h2>
            <p className="text-slate-400 mb-2 text-sm">{this.state.errorMessage}</p>
            <button type="button" onClick={this.props.onReset}
              className="mt-8 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl uppercase tracking-widest text-xs flex items-center gap-2 mx-auto transition-all">
              <RefreshCw className="w-4 h-4" /> Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Flat 50% mastery bar for every difficulty — a section only closes once the
// panelist is at least half-satisfied with the answers given on it.
const MASTERY_THRESHOLD: Record<string, number> = {
  Beginner: 50, Intermediate: 50, Advanced: 50,
};

const MAX_FOLLOWUPS = 3;
const SATISFACTION_THRESHOLD = 65;

const DIFFICULTY_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  Easy:     { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  Moderate: { color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  Hard:     { color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200',  dot: 'bg-orange-500' },
  Expert:   { color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500' },
};

function scoreColor(val: number) {
  if (val >= 80) return 'text-emerald-600';
  if (val >= 65) return 'text-amber-600';
  return 'text-red-600';
}

function scoreBg(val: number) {
  if (val >= 80) return 'bg-emerald-500';
  if (val >= 65) return 'bg-amber-500';
  return 'bg-red-500';
}

function verdictLabel(val: number) {
  if (val >= 80) return { label: 'Correct',       color: 'text-emerald-600', bg: 'bg-emerald-100 border-emerald-300' };
  if (val >= 60) return { label: 'Partial',        color: 'text-amber-600',   bg: 'bg-amber-100 border-amber-300' };
  return            { label: 'Insufficient',    color: 'text-red-600',     bg: 'bg-red-100 border-red-300' };
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const MicTestButton: React.FC = () => {
  const [state, setState] = React.useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [msg, setMsg] = React.useState('');
  const sttRef = React.useRef<STTSession | null>(null);

  const runTest = () => {
    setState('testing'); setMsg('Speak something now…'); let heard = false;
    sttRef.current = startSTT({
      onInterim: (t) => { if (t && !heard) { heard = true; setState('ok'); setMsg(`Heard: "${t.slice(0, 50)}"`); sttRef.current?.stop(); } },
      onFinal: () => {},
      onEnd: () => { if (!heard) { setState('error'); setMsg('Nothing heard. Check your microphone.'); } },
      onError: (e) => { setState('error'); setMsg(e || 'Microphone error.'); },
      shouldRestart: () => false,
    });
    setTimeout(() => { if (!heard) sttRef.current?.stop(); }, 6000);
  };

  return (
    <div className="flex flex-col items-center gap-2 mb-4">
      {state === 'idle' && (
        <button type="button" onClick={runTest}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all">
          <Mic className="w-4 h-4" /> Test Microphone
        </button>
      )}
      {state === 'testing' && <div className="flex items-center gap-2 text-blue-600 text-xs font-bold"><div className="w-2 h-2 rounded-full bg-red-400 motion-safe:animate-pulse" />{msg}</div>}
      {state === 'ok' && (
        <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4" />{msg}
          <button type="button" onClick={() => { sttRef.current?.stop(); setState('idle'); setMsg(''); }} className="text-slate-500 hover:text-slate-600 underline text-xs">reset</button>
        </div>
      )}
      {state === 'error' && (
        <div className="text-center">
          <div className="flex items-center gap-2 text-red-600 text-xs font-bold justify-center mb-1"><AlertCircle className="w-4 h-4" />{msg}</div>
          <button type="button" onClick={runTest} className="text-blue-600 text-xs font-bold hover:text-blue-600">Try Again</button>
        </div>
      )}
    </div>
  );
};

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
    <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full shadow-xl shadow-slate-300/50 animate-in fade-in zoom-in-95 duration-200">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 ${danger ? 'bg-red-100 border border-red-200' : 'bg-blue-100 border border-blue-200'}`}>
        <StopCircle className={`w-7 h-7 ${danger ? 'text-red-600' : 'text-blue-600'}`} />
      </div>
      <h3 className="text-lg font-black text-slate-800 text-center mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-slate-400 text-sm text-center mb-8 leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-bold rounded-2xl text-sm transition-all uppercase tracking-widest">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm}
          className={`flex-1 py-3.5 font-black rounded-2xl text-sm transition-all uppercase tracking-widest ${danger ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-200'}`}>
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  project: ProjectProfile | null;
  config?: any;
  onComplete: (result: SessionResult) => void;
  onExit: () => void;
}

const PracticeSessionInner: React.FC<Props> = ({ project, config, onComplete, onExit }) => {
  // ── Core state ──────────────────────────────────────────────────
  const [uiState, setUiState] = useState<'intro' | 'generating' | 'active' | 'evaluating' | 'feedback' | 'finalizing'>('intro');
  const [coverageMap, setCoverageMap] = useState<CoverageMap>({});
  const [targetSection, setTargetSection] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<PanelQuestion | null>(null);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [timeLeft, setTimeLeft] = useState((config?.duration || 30) * 60);
  const [response, setResponse] = useState('');
  const [currentEval, setCurrentEval] = useState<RubricEvaluation | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [history, setHistory] = useState<QuestionAnswer[]>([]);
  const [ragChunks, setRagChunks] = useState<RagChunk[]>([]);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [ragError, setRagError] = useState<string | null>(null);
  const [answerSeconds, setAnswerSeconds] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showInactivityPrompt, setShowInactivityPrompt] = useState(false);

  // ── Connectivity ─────────────────────────────────────────────────
  // A defense simulation needs a live AI panel. If the network drops or every
  // AI provider fails, the session pauses on a blocking overlay rather than
  // limping along on offline heuristics.
  const [connectionLost, setConnectionLost] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryActionRef = useRef<null | (() => Promise<void>)>(null);

  // ── Inactivity refs ──────────────────────────────────────────────
  const inactivityWarnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityEndRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInactiveRef     = useRef(false);

  // ── Voice state ─────────────────────────────────────────────────
  const isVoiceEnabled = config?.mode === 'voice' || config?.mode === 'hybrid';
  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [speakRate, setSpeakRate] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingReaction, setIsPlayingReaction] = useState(false);
  const [silencePrompt, setSilencePrompt] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // ── Thread (conversational follow-up) state ─────────────────────
  const [activeThreadExchanges, setActiveThreadExchanges] = useState<ThreadExchange[]>([]);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [consecutiveEvasiveCount, setConsecutiveEvasiveCount] = useState(0);
  const [isThreadEvaluating, setIsThreadEvaluating] = useState(false);
  const [panelistRemark, setPanelistRemark] = useState<string | null>(null);
  const [threadSatisfactionScore, setThreadSatisfactionScore] = useState(0);
  const [threadVerdict, setThreadVerdict] = useState<'satisfied' | 'capped' | 'skipped'>('satisfied');
  const [cappedSections, setCappedSections] = useState<Set<string>>(new Set());

  const sttRef = useRef<STTSession | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenQRef = useRef<string>('');
  const isListeningRef = useRef(false);
  const nextQPreloadRef = useRef<Promise<PanelQuestion | null> | null>(null);
  const sessionCompletedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootQuestionRef = useRef<PanelQuestion | null>(null);

  // ── Click-and-drag scroll (native scrollbar hidden via .no-scrollbar) ──
  const dragScrollRef = useRef<{ el: HTMLElement; startY: number; startScrollTop: number } | null>(null);
  const handleDragScrollStart = (e: React.MouseEvent<HTMLElement>) => {
    dragScrollRef.current = { el: e.currentTarget, startY: e.pageY, startScrollTop: e.currentTarget.scrollTop };
  };
  const handleDragScrollMove = (e: React.MouseEvent<HTMLElement>) => {
    const drag = dragScrollRef.current;
    if (!drag) return;
    // Mouse button released outside this element (or outside the window) —
    // e.buttons won't include the primary button even though we never got
    // a matching mouseup/mouseleave here. Without this check the stale
    // drag state survives and the next plain hover snaps scrollTop back
    // using the old startY/startScrollTop, which looked like a random
    // jump-to-top while just scrolling normally.
    if ((e.buttons & 1) === 0) { dragScrollRef.current = null; return; }
    e.preventDefault();
    drag.el.scrollTop = drag.startScrollTop - (e.pageY - drag.startY);
  };
  const handleDragScrollEnd = () => { dragScrollRef.current = null; };
  // Belt-and-suspenders: also clear on any mouseup/blur anywhere on the
  // page, in case the button was released off-element entirely.
  useEffect(() => {
    const clear = () => { dragScrollRef.current = null; };
    window.addEventListener('mouseup', clear);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('mouseup', clear);
      window.removeEventListener('blur', clear);
    };
  }, []);
  const dragScrollHandlers = {
    onMouseDown: handleDragScrollStart,
    onMouseMove: handleDragScrollMove,
    onMouseUp: handleDragScrollEnd,
    onMouseLeave: handleDragScrollEnd,
  };
  const dragScrollClass = 'no-scrollbar cursor-grab active:cursor-grabbing';
  const threadFinalAnswerRef = useRef<string>('');

  // Auto-grow textarea as user types
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [response]);

  // When a new root question loads, snapshot it and reset thread state
  useEffect(() => {
    if (!currentQuestion || currentQuestion.question_type === 'Follow-up') return;
    rootQuestionRef.current = currentQuestion;
    setActiveThreadExchanges([]);
    setFollowUpCount(0);
    setConsecutiveEvasiveCount(0);
    setPanelistRemark(null);
    setThreadSatisfactionScore(0);
    setThreadVerdict('satisfied');
    threadFinalAnswerRef.current = '';
  }, [currentQuestion?.question]);

  // ── Inactivity detection ─────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityWarnRef.current) clearTimeout(inactivityWarnRef.current);
    if (inactivityEndRef.current)  clearTimeout(inactivityEndRef.current);
    setShowInactivityPrompt(false);
    isInactiveRef.current = false;

    // A defense question deserves real thinking time. Warn only after 3 minutes
    // of no input, then end 2 minutes after that if there's still no response.
    inactivityWarnRef.current = setTimeout(() => {
      setShowInactivityPrompt(true);
      isInactiveRef.current = true;
      inactivityEndRef.current = setTimeout(() => {
        setShowInactivityPrompt(false);
        completeSession(history);
      }, 120_000);
    }, 180_000);
  }, [history]);

  useEffect(() => {
    if (uiState !== 'active') {
      if (inactivityWarnRef.current) clearTimeout(inactivityWarnRef.current);
      if (inactivityEndRef.current)  clearTimeout(inactivityEndRef.current);
      setShowInactivityPrompt(false);
      return;
    }
    resetInactivityTimer();
    const handleActivity = () => resetInactivityTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown',   handleActivity);
    window.addEventListener('click',     handleActivity);
    return () => {
      if (inactivityWarnRef.current) clearTimeout(inactivityWarnRef.current);
      if (inactivityEndRef.current)  clearTimeout(inactivityEndRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown',   handleActivity);
      window.removeEventListener('click',     handleActivity);
    };
  }, [uiState, resetInactivityTimer]);

  // Pause the session the moment the browser reports the network is gone.
  useEffect(() => {
    const onOffline = () => {
      if (uiState === 'active' || uiState === 'evaluating' || uiState === 'generating') {
        setConnectionLost(true);
      }
    };
    window.addEventListener('offline', onOffline);
    return () => window.removeEventListener('offline', onOffline);
  }, [uiState]);

  // Re-run whatever AI call failed, once the student hits "Try again".
  const handleRetryConnection = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // still offline — leave the overlay up
      return;
    }
    const action = retryActionRef.current;
    if (!action) { setConnectionLost(false); return; }
    setIsRetrying(true);
    try {
      await action();
      retryActionRef.current = null;
      setConnectionLost(false);
    } catch {
      // still failing — keep the overlay
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const threshold = MASTERY_THRESHOLD[config?.difficulty] ?? 65;
  const coveredCount = Object.values(coverageMap).filter(s => s.covered).length;
  const totalSections = Object.keys(coverageMap).length;
  const sessionPhase: SessionPhase = (
    targetSection.includes('Method') ? SessionPhase.METHODOLOGY :
    targetSection.includes('Result') || targetSection.includes('Discussion') ? SessionPhase.RESULTS :
    targetSection.includes('Conclusion') || targetSection.includes('Recommend') ? SessionPhase.DEFENSE :
    SessionPhase.INTRODUCTION
  );

  const runningAvg = history.length > 0
    ? Math.round(history.reduce((a, b) => a + b.feedback.score, 0) / history.length)
    : null;

  // Panelists are generated server-side (fresh random names each session,
  // logged to Supabase) instead of picked from a fixed list during setup.
  const [selectedPanelists, setSelectedPanelists] = useState<Panelist[]>(PANELISTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getSessionToken();
        const res = await fetch('/api/panelists/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ domain: config?.detectedDomain ?? 'default' }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.panelists) && data.panelists.length > 0) {
          setSelectedPanelists(data.panelists);
        }
      } catch {
        // Network/AI hiccup — keep the local PANELISTS fallback already set.
      }
    })();
    return () => { cancelled = true; };
  }, [config?.detectedDomain]);

  const EVAL_TIMEOUT_MS = 90_000;

  // ── RAG initialization ───────────────────────────────────────────
  useEffect(() => {
    if (!project?.abstractText) return;
    const init = async () => {
      try {
        const texts = createChunks(project.abstractText!);
        const embeddings = await getEmbeddings(texts);
        setRagChunks(texts.map((t, i) => ({ id: `chunk-${i}`, text: t, embedding: embeddings[i], metadata: { section: 'Abstract' } })));
      } catch {
        setRagError('Abstract indexing failed — questions generated without RAG context.');
      }
    };
    init();
  }, [project?.abstractText]);

  // ── Answer timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (uiState !== 'active') { setAnswerSeconds(0); return; }
    const t = setInterval(() => setAnswerSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [uiState, currentQuestion]);

  // ── Session countdown ────────────────────────────────────────────
  useEffect(() => {
    if (uiState !== 'active' && uiState !== 'feedback') return;
    const t = setInterval(() => setTimeLeft(p => (p > 0 ? p - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [uiState]);

  useEffect(() => {
    if (timeLeft === 0 && (uiState === 'active' || uiState === 'feedback') && history.length > 0) {
      completeSession(history);
    }
  }, [timeLeft]);

  // ── Core logic ───────────────────────────────────────────────────
  const fetchQuestion = useCallback(async (
    section: string, map: CoverageMap, lastQ: string, lastA: string, lastScore: number, qIndex: number,
    askedQs: string[] = [],
  ) => {
    if (!project) return;
    setIsGeneratingQuestion(true);
    try {
      const q = await generateDynamicQuestion(
        project.abstractText || '', selectedPanelists, config?.difficulty || 'Intermediate',
        map, lastQ, lastA, lastScore, section, qIndex, ragChunks, askedQs,
      );
      setCurrentQuestion(q);
      setStartTime(Date.now());
    } catch (err) {
      console.error('Question generation failed:', err);
      // No live panel → pause the session; don't fabricate a question offline.
      retryActionRef.current = () =>
        fetchQuestion(section, map, lastQ, lastA, lastScore, qIndex, askedQs);
      setConnectionLost(true);
      setIsGeneratingQuestion(false);
      throw err instanceof AIUnavailableError ? err : new AIUnavailableError();
    }
    setIsGeneratingQuestion(false);
  }, [project, selectedPanelists, config?.difficulty, ragChunks]);

  const initializeSession = useCallback(async () => {
    if (!project) return;
    // Runs inside the "Begin Defense" click — unlocks the speech engine now so
    // the first question (spoken later, outside any gesture) isn't blocked by
    // the browser's autoplay policy.
    if (isVoiceEnabled) primeSpeechSynthesis();
    resetContextualFallback();   // restart offline-fallback question cycling for this session
    setUiState('generating');
    const sections: string[] = config?.selectedSections?.length
      ? config.selectedSections
      : detectDocumentSections(project.abstractText || '');
    const map = initCoverageMap(sections.length > 0 ? sections : ['Abstract', 'Methodology', 'Results', 'Conclusions']);
    setCoverageMap(map);
    const first = sections[0] || 'Abstract';
    setTargetSection(first);
    setQuestionsAsked(1);
    // The overlay (connectionLost) covers the screen if this throws; its
    // "Try again" button re-runs fetchQuestion for this same first question.
    setUiState('active');
    try {
      await fetchQuestion(first, map, '', '', 0, 0);
    } catch { /* handled — overlay is up */ }
  }, [project, config?.selectedSections, fetchQuestion, isVoiceEnabled]);

  const completeSession = (finalHistory: QuestionAnswer[]) => {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;
    setUiState('finalizing');
    if (finalHistory.length === 0) { onExit(); return; }
    const mean = (pick: (b: QuestionAnswer) => number) =>
      Math.round(
        finalHistory.reduce((a, b) => a + (pick(b) || 0), 0) / finalHistory.length,
      );
    const avg = mean((h) => h.feedback.score);
    const scoreMap = {
      Accuracy:     mean((b) => b.feedback.semanticRelevance),
      Completeness: mean((b) => b.feedback.keywordAccuracy),
      Clarity:      mean((b) => b.feedback.clarity ?? 0),
      Confidence:   mean((b) => b.feedback.confidenceLevel),
    };
    const weakest = Object.entries(scoreMap).sort((a, b) => a[1] - b[1])[0][0];
    onComplete({
      id: Math.random().toString(36).slice(2),
      date: new Date().toISOString(),
      overallScore: Math.round(avg),
      duration: (config?.duration || 30) - Math.floor(timeLeft / 60),
      questionsAnswered: finalHistory.length,
      categoryScores: scoreMap,
      history: finalHistory,
      weakestCategory: weakest,
    } as any);
  };

  const handleEndSession = () => {
    setShowEndConfirm(false);
    stopSpeaking();
    sttRef.current?.stop();
    completeSession(history);
  };

  // ── Voice helpers ────────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    setVoiceError(null); setIsReviewingTranscript(false); setLiveTranscript(''); setSilencePrompt(false);
    if (silenceRef.current) clearTimeout(silenceRef.current);
    const permState = await checkMicPermission();
    if (permState === 'denied') { setVoiceError('Microphone is blocked. Allow it in browser settings, then refresh.'); return; }
    isListeningRef.current = true; setIsListening(true);
    sttRef.current = startSTT({
      onInterim: (text) => { setLiveTranscript(text); resetInactivityTimer(); if (silenceRef.current) clearTimeout(silenceRef.current); setSilencePrompt(false); silenceRef.current = setTimeout(() => setSilencePrompt(true), 5000); },
      onFinal: (text) => { setLiveTranscript(text); resetInactivityTimer(); },
      onEnd: () => { if (!isListeningRef.current) { if (silenceRef.current) clearTimeout(silenceRef.current); setIsListening(false); setIsReviewingTranscript(true); } },
      onError: (msg) => { isListeningRef.current = false; setIsListening(false); if (msg) setVoiceError(msg); },
      shouldRestart: () => isListeningRef.current,
    });
  }, []);

  const handleStopRecording = useCallback(() => {
    isListeningRef.current = false; sttRef.current?.stop();
    if (silenceRef.current) clearTimeout(silenceRef.current); setSilencePrompt(false);
  }, []);

  const speakQuestion = useCallback((question: string, role: string, panelistName?: string) => {
    if (isMuted || !isTTSSupported()) return;
    setIsTtsSpeaking(true);
    speakText(question, role, {
      rate: speakRate,
      panelistName,
      // Mark the question as spoken only once speech actually begins. Marking it
      // synchronously would let StrictMode's mount/unmount/remount cancel the
      // first utterance and then skip re-speaking it (ref already matches).
      onStart: () => { spokenQRef.current = question; },
      onEnd: () => { setIsTtsSpeaking(false); if (config?.mode === 'voice' && isSTTSupported()) handleStartRecording(); },
    });
  }, [isMuted, speakRate, config?.mode, handleStartRecording]);

  useEffect(() => {
    if (!isVoiceEnabled || !currentQuestion || uiState !== 'active') return;
    if (currentQuestion.question === spokenQRef.current) return;
    setIsReviewingTranscript(false); setLiveTranscript('');
    speakQuestion(currentQuestion.question, currentQuestion.panelist?.role || '', currentQuestion.panelist?.name);
    return () => stopSpeaking();
  }, [currentQuestion?.question, uiState]);

  useEffect(() => {
    if (uiState !== 'feedback' || !isVoiceEnabled || !currentQuestion || isMuted) return;
    const reaction = getPanelistReaction(currentEval?.finalScore ?? 0);
    setIsPlayingReaction(true);
    speakText(reaction, currentQuestion.panelist?.role || '', { rate: speakRate, onEnd: () => setIsPlayingReaction(false) });
    return () => { stopSpeaking(); setIsPlayingReaction(false); };
  }, [uiState]);

  // ── Evaluation ───────────────────────────────────────────────────
  const runEvaluation = useCallback(async (text: string) => {
    if (!text.trim() || !project || !currentQuestion) return;
    setUiState('evaluating'); setEvalError(null);
    const responseTime = Date.now() - startTime;
    // Always evaluate against the root question, not a follow-up
    const evalQuestion = rootQuestionRef.current ?? currentQuestion;
    try {
      const evalRes = await Promise.race([
        evaluateResponseDetailed(
          evalQuestion.question, text, project.abstractText || '', responseTime,
          evalQuestion.expectedKeywords ?? [],
          history.slice(-3).map(h => ({ question: h.question, answer: h.answer, score: h.feedback.score })),
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Evaluation timed out.')), EVAL_TIMEOUT_MS)),
      ]);
      setCurrentEval(evalRes);
      setUiState('feedback');
    } catch (e: any) {
      if (e instanceof AIUnavailableError) {
        // No live panel → pause; retry re-scores this same answer.
        retryActionRef.current = () => runEvaluation(text);
        setConnectionLost(true);
        setUiState('evaluating');
        return;
      }
      // A non-connectivity failure (e.g. eval timeout) — let the student move on.
      setEvalError(e?.message || 'Evaluation failed. You can continue to the next question.');
      setCurrentEval(null);
      setUiState('feedback');
    }
  }, [project, currentQuestion, startTime, history]);

  const handleSubmit = async (answerOverride?: string) => {
    const capturedAnswer = (answerOverride ?? response).trim();
    if (!capturedAnswer || !currentQuestion || !project) return;
    // Keep the textarea/state in sync when the answer came from voice.
    if (answerOverride !== undefined && answerOverride !== response) setResponse(answerOverride);

    const root = rootQuestionRef.current ?? currentQuestion;
    const currentFollowUpCount = followUpCount;
    const threadHistoryForEval = activeThreadExchanges.map(e => ({
      question: e.question, answer: e.answer, isFollowUp: e.isFollowUp,
    }));

    setIsThreadEvaluating(true);
    setPanelistRemark(null);

    // If the student just resubmits an answer they already gave in this thread,
    // there is nothing new to press on — close the thread instead of asking the
    // same follow-up again.
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
    const na = norm(capturedAnswer);
    const repeated = activeThreadExchanges.some(e => {
      const ne = norm(e.answer);
      if (!ne || !na) return false;
      if (ne === na) return true;
      const shorter = ne.length < na.length ? ne : na;
      const longer = ne.length < na.length ? na : ne;
      return shorter.length > 25 && longer.includes(shorter);
    });

    let satResult: SatisfactionResult;
    if (repeated && activeThreadExchanges.length > 0) {
      const prevScore = activeThreadExchanges[activeThreadExchanges.length - 1].satisfactionScore ?? 45;
      satResult = {
        satisfaction_score: prevScore,
        verdict: prevScore >= SATISFACTION_THRESHOLD ? 'satisfied' : 'evasive',
        gaps: ['You repeated an earlier answer without adding anything new.'],
        followup_question: null,
        panelist_remark:
          "That's the same answer you already gave. I won't press further here — note this gap and strengthen it before your real defense.",
      };
      setIsThreadEvaluating(false);
    } else {
    try {
      satResult = await evaluateSatisfaction(
        root.question,
        threadHistoryForEval,
        capturedAnswer,
        project.abstractText || '',
        currentQuestion.panelist,
        currentFollowUpCount,
        consecutiveEvasiveCount,
      );
    } catch (err) {
      // No live panel → pause; the student re-submits this same answer on retry.
      console.error('Satisfaction evaluation failed:', err);
      retryActionRef.current = () => handleSubmit(capturedAnswer);
      setConnectionLost(true);
      setIsThreadEvaluating(false);
      return;
    }
    }

    const exchange: ThreadExchange = {
      question: currentQuestion.question,
      answer: capturedAnswer,
      isFollowUp: currentFollowUpCount > 0,
      satisfactionScore: satResult.satisfaction_score,
      verdict: satResult.verdict,
      gaps: satResult.gaps ?? [],
      panelistRemark: satResult.panelist_remark ?? '',
    };

    const newExchanges = [...activeThreadExchanges, exchange];
    setActiveThreadExchanges(newExchanges);
    setIsThreadEvaluating(false);
    setPanelistRemark(satResult.panelist_remark ?? null);

    // The evaluator returns no follow-up either when it's satisfied or when it
    // has decided to stop pressing (follow-up cap / repeated evasion).
    const evaluatorStopped = !satResult.followup_question;
    const isCapped =
      currentFollowUpCount >= MAX_FOLLOWUPS ||
      (evaluatorStopped && satResult.verdict !== 'satisfied') ||
      consecutiveEvasiveCount >= 2;
    const isSatisfied = satResult.verdict === 'satisfied' || satResult.satisfaction_score >= SATISFACTION_THRESHOLD;

    if (isSatisfied || isCapped) {
      // Score the thread on the student's BEST answer, not whatever they typed
      // last. A strong opening answer must not be dragged to zero by a
      // frustrated one-word reply at the end of a long follow-up chain.
      const bestEx = newExchanges.reduce((a, b) =>
        (b.satisfactionScore ?? 0) >= (a.satisfactionScore ?? 0) ? b : a,
      );
      const bestAnswer =
        (bestEx.satisfactionScore ?? 0) > (satResult.satisfaction_score ?? 0)
          ? bestEx.answer
          : capturedAnswer;
      const finalScore = Math.max(satResult.satisfaction_score, bestEx.satisfactionScore ?? 0);
      setThreadSatisfactionScore(finalScore);
      setThreadVerdict(isSatisfied || finalScore >= SATISFACTION_THRESHOLD ? 'satisfied' : 'capped');
      if (isCapped && finalScore < SATISFACTION_THRESHOLD) {
        setCappedSections(prev => new Set([...prev, targetSection]));
      }
      threadFinalAnswerRef.current = bestAnswer;
      await runEvaluation(bestAnswer);
    } else {
      // Follow-up needed
      const newEvasiveCount = satResult.verdict === 'evasive' ? consecutiveEvasiveCount + 1 : 0;
      setConsecutiveEvasiveCount(newEvasiveCount);

      const followUpQuestion = satResult.followup_question
        ?? 'Go deeper on that. Give a specific example from your research and explain how it supports your point.';

      setFollowUpCount(f => f + 1);
      setResponse('');

      // Mutate currentQuestion to the follow-up (same panelist, same section context)
      setCurrentQuestion({
        ...currentQuestion,
        question: followUpQuestion,
        question_type: 'Follow-up',
        source_excerpt: '',
        difficulty: currentQuestion.difficulty,
      });
    }
  };
  // Voice answers go through the exact same pipeline as typed answers
  // (satisfaction check → follow-ups → rubric evaluation), so voice and text
  // sessions ask the same number of questions and never end early.
  const handleSubmitVoice = async () => {
    const text = liveTranscript.trim();
    if (!text) return;
    isListeningRef.current = false;
    sttRef.current?.stop();
    setIsReviewingTranscript(false);
    setSilencePrompt(false);
    await handleSubmit(text);
  };

  useEffect(() => {
    if (uiState !== 'feedback' || !currentQuestion || !project) return;
    const score = currentEval?.finalScore ?? 0;
    const previewCoverage = updateCoverage(coverageMap, targetSection, score, threshold);
    const nextSec = getNextSection(previewCoverage, targetSection, score, threshold);
    if (!nextSec || timeLeft <= 0) return;
    const alreadyAsked = [...history.map(h => h.question), currentQuestion.question];
    // The answer just given isn't in `history` yet, so the NEXT question's index
    // is history.length + 1 (matches what advanceAfterAnswer computes). Passing
    // history.length here rotated the panelist one slot short — which is why
    // only the first 2 of 4 panelists ever asked anything.
    const nextQuestionIndex = history.length + 1;
    const answerJustGiven =
      threadFinalAnswerRef.current || response || history[history.length - 1]?.answer || '';
    nextQPreloadRef.current = generateDynamicQuestion(
      project.abstractText || '', selectedPanelists, config?.difficulty || 'Intermediate',
      previewCoverage, currentQuestion.question, answerJustGiven, score,
      nextSec, nextQuestionIndex, ragChunks, alreadyAsked,
    ).catch(() => null);   // preload is best-effort; real fetch (with its overlay) runs on advance
  }, [uiState]);

  const advanceAfterAnswer = useCallback(async (capturedResponse: string, score: number, newHistory: QuestionAnswer[], lastQuestionText: string) => {
    const newCoverage = updateCoverage(coverageMap, targetSection, score, threshold);
    setCoverageMap(newCoverage);
    // Purely score-driven now — a section keeps getting questions (threaded
    // follow-ups or fresh ones) until its mastery actually clears the
    // threshold, however many exchanges that takes.
    let nextSection = getNextSection(newCoverage, targetSection, score, threshold);
    // Every panelist on the panel should get at least one question. If the exam
    // would otherwise end before everyone has asked, keep it going on the
    // weakest section until each of the selected panelists has had a turn.
    if (!nextSection && timeLeft > 0 && newHistory.length < selectedPanelists.length) {
      nextSection =
        Object.values(newCoverage).sort((a, b) => a.mastery - b.mastery)[0]?.section
        ?? targetSection;
    }
    if (!nextSection || timeLeft <= 0) { completeSession(newHistory); return; }
    setTargetSection(nextSection);
    const nextIndex = newHistory.length;
    setQuestionsAsked(nextIndex + 1);
    setUiState('active');
    setIsGeneratingQuestion(true);

    if (nextQPreloadRef.current) {
      try {
        const preloaded = await Promise.race([
          nextQPreloadRef.current,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('preload timeout')), 50_000)),
        ]);
        nextQPreloadRef.current = null;
        if (preloaded) {
          setCurrentQuestion(preloaded);
          setStartTime(Date.now());
          setIsGeneratingQuestion(false);
          return;
        }
      } catch {
        nextQPreloadRef.current = null;
      }
    }
    const askedQs = newHistory.map(h => h.question);
    try {
      await fetchQuestion(nextSection, newCoverage, lastQuestionText, capturedResponse, score, nextIndex, askedQs);
    } catch { /* handled — connection-lost overlay is up, "Try again" retries */ }
  }, [coverageMap, targetSection, threshold, timeLeft, fetchQuestion, selectedPanelists.length]);

  const handleNext = useCallback(async () => {
    if (!currentQuestion) return;
    // Use the thread's final answer if available (response was cleared when follow-up was shown)
    const capturedResponse = threadFinalAnswerRef.current || response;
    const score = currentEval?.finalScore ?? 0;
    const rootQuestion = rootQuestionRef.current ?? currentQuestion;
    const lastQuestionText = rootQuestion.question;
    // "Threaded" = the panel actually asked follow-ups (more than the one root
    // exchange). A question answered in one go is not a thread.
    const wasThreaded = activeThreadExchanges.length > 1;
    // For a thread, record EVERY question and answer in it (this full text is
    // what lands in Supabase's answer column); for a single exchange, just the
    // answer itself.
    const answerForRecord = wasThreaded
      ? activeThreadExchanges
          .map((ex, i) =>
            `${ex.isFollowUp ? `Follow-up ${i}` : 'Question'}: ${ex.question}\nAnswer: ${(ex.answer || '(no answer)').trim()}`,
          )
          .join('\n\n')
      : capturedResponse;
    const qa: QuestionAnswer = {
      question: lastQuestionText,
      answer: answerForRecord,
      category: sessionPhase,
      panelistName: rootQuestion.panelist?.name ?? undefined,
      panelistPersonality: rootQuestion.panelist?.persona ?? undefined,
      threadExchanges: wasThreaded ? activeThreadExchanges : undefined,
      satisfactionScore: wasThreaded ? threadSatisfactionScore : undefined,
      threadVerdict: wasThreaded ? threadVerdict : undefined,
      followUpsUsed: wasThreaded ? followUpCount : undefined,
      feedback: currentEval ? {
        score: currentEval.finalScore, semanticRelevance: currentEval.accuracy,
        keywordAccuracy: currentEval.completeness, clarity: currentEval.clarity,
        confidenceLevel: currentEval.confidence, strengths: currentEval.strengths,
        improvements: currentEval.improvements, betterExample: currentEval.suggestedAnswer,
      } : { score: 0, semanticRelevance: 0, keywordAccuracy: 0, clarity: 0, confidenceLevel: 0, strengths: [], improvements: ['Evaluation could not be completed.'], betterExample: 'N/A' },
    };
    const newHistory = [...history, qa];
    setHistory(newHistory); setResponse(''); setCurrentEval(null); setEvalError(null);
    threadFinalAnswerRef.current = '';
    stopSpeaking(); isListeningRef.current = false; sttRef.current?.stop(); spokenQRef.current = '';
    setIsListening(false); setIsReviewingTranscript(false); setLiveTranscript(''); setSilencePrompt(false); setVoiceError(null);
    await advanceAfterAnswer(capturedResponse, score, newHistory, lastQuestionText);
  }, [currentQuestion, response, currentEval, history, sessionPhase, activeThreadExchanges, threadSatisfactionScore, threadVerdict, followUpCount, advanceAfterAnswer]);

  const handleSkip = useCallback(async () => {
    if (!currentQuestion) return;
    const rootQuestion = rootQuestionRef.current ?? currentQuestion;
    const lastQuestionText = rootQuestion.question;
    const wasThreaded = activeThreadExchanges.length > 1;
    const qa: QuestionAnswer = {
      question: lastQuestionText,
      answer: '(Skipped)',
      category: sessionPhase,
      panelistName: rootQuestion.panelist?.name ?? undefined,
      panelistPersonality: rootQuestion.panelist?.persona ?? undefined,
      threadExchanges: wasThreaded ? activeThreadExchanges : undefined,
      threadVerdict: 'skipped',
      followUpsUsed: wasThreaded ? followUpCount : undefined,
      feedback: { score: 0, semanticRelevance: 0, keywordAccuracy: 0, clarity: 0, confidenceLevel: 0, strengths: [], improvements: ['Question skipped.'], betterExample: 'N/A' },
    };
    const newHistory = [...history, qa];
    setHistory(newHistory); setResponse('');
    threadFinalAnswerRef.current = '';
    await advanceAfterAnswer('(Skipped)', 0, newHistory, lastQuestionText);
  }, [currentQuestion, history, sessionPhase, activeThreadExchanges, followUpCount, advanceAfterAnswer]);

  // ─────────────────────────────────────────────────────────────────
  // No project guard
  // ─────────────────────────────────────────────────────────────────

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight mb-2">No Project Found</h2>
          <p className="text-slate-400 text-sm mb-8">Your group does not have a project yet. Return to the dashboard and create one first.</p>
          <button type="button" onClick={onExit}
            className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-sm transition-all uppercase tracking-widest flex items-center gap-2 mx-auto">
            <RefreshCw className="w-4 h-4" /> Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Shared header
  // ─────────────────────────────────────────────────────────────────

  const Header = () => (
    <header className="h-14 px-5 border-b border-slate-200 flex items-center justify-between bg-white/90 backdrop-blur-md sticky top-0 z-50 shrink-0">
      {/* Left: branding */}
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="Defensa" className="w-8 h-8 rounded-lg shadow-lg shadow-blue-200" />
        <div className="hidden sm:block">
          <p className="font-black text-xs uppercase tracking-widest text-slate-800 leading-none">Defensa</p>
          <p className="text-[10px] text-slate-500 font-medium truncate max-w-[200px]">{project.title}</p>
        </div>
      </div>

      {/* Center: session stats */}
      {(uiState === 'active' || uiState === 'feedback' || uiState === 'evaluating') && (
        <div className="flex items-center gap-2.5">
          {/* Timer — shifts amber → red as time runs low */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-black border transition-colors duration-500 ${
            timeLeft < 60
              ? 'bg-red-100 border-red-300 text-red-600'
              : timeLeft < 180
              ? 'bg-amber-100 border-amber-200 text-amber-600'
              : 'bg-slate-100 border-slate-200 text-slate-600'
          }`}>
            <Timer className="w-3.5 h-3.5" />
            <span>{formatTime(timeLeft)}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold">
            <FileText className="w-3.5 h-3.5" />Q{questionsAsked}
          </div>
          {runningAvg !== null && (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-black ${scoreColor(runningAvg)}`}>
              <BarChart3 className="w-3.5 h-3.5" />{runningAvg}
            </div>
          )}
        </div>
      )}

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {isVoiceEnabled && (uiState === 'active' || uiState === 'feedback') && (
          <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-lg">
            <button type="button" title={isMuted ? 'Unmute' : 'Mute'} onClick={() => { setIsMuted(m => !m); if (!isMuted) stopSpeaking(); }}
              className="p-1 rounded hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-800">
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            {currentQuestion && !isTtsSpeaking && uiState === 'active' && (
              <button type="button" title="Replay question" onClick={() => speakQuestion(currentQuestion.question, currentQuestion.panelist?.role || '', currentQuestion.panelist?.name)}
                className="p-1 rounded hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-800">
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            {isTtsSpeaking && (
              <button type="button" title="Stop speaking" aria-label="Stop speaking" onClick={() => { stopSpeaking(); setIsTtsSpeaking(false); }}
                className="p-1 rounded hover:bg-slate-200 transition-all text-red-600">
                <Square className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="flex items-center gap-0.5 ml-1">
              {[0.75, 1.0, 1.25].map(r => (
                <button key={r} type="button" onClick={() => setSpeakRate(r)}
                  className={`px-1 py-0.5 text-[10px] font-black rounded transition-all ${speakRate === r ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                  {r}×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* End Session — quiet ghost, only in header */}
        {(uiState === 'active' || uiState === 'feedback') && (
          <button type="button" onClick={() => setShowEndConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 text-xs font-bold rounded-lg transition-all uppercase tracking-wider">
            <StopCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">End</span>
          </button>
        )}

        <button type="button" onClick={() => (uiState === 'intro' || uiState === 'generating') ? onExit() : setShowExitConfirm(true)}
          title="Exit" className="p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-600 rounded-lg transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );

  // ─────────────────────────────────────────────────────────────────
  // LEFT PANEL — Panelists
  // ─────────────────────────────────────────────────────────────────
  const LeftPanel = () => {
    const activePanelist = currentQuestion?.panelist;
    const others = selectedPanelists.filter(p => p.id !== activePanelist?.id);
    return (
      <aside className={`flex flex-col gap-3 h-full overflow-y-auto ${dragScrollClass}`} {...dragScrollHandlers}>
        {/* Active panelist — hero card */}
        {activePanelist ? (
          <div className="p-5 rounded-2xl border bg-[#0F1A2E] border-blue-500/25 shadow-lg shadow-black/30 flex flex-col items-center text-center gap-3">
            <div className="relative">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black border-2 transition-all duration-300 ${
                isTtsSpeaking
                  ? 'bg-blue-500/40 border-blue-400/70 text-white shadow-lg shadow-blue-500/25'
                  : 'bg-blue-600/25 border-blue-500/45 text-blue-200'
              }`}>
                {getInitials(activePanelist.name)}
              </div>
              {isTtsSpeaking && (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex gap-[3px] items-end bg-[#0C1425] px-2 py-0.5 rounded-full border border-blue-500/30">
                  <div className="w-[3px] h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce" />
                  <div className="w-[3px] h-2.5 rounded-full bg-blue-400 motion-safe:animate-bounce [animation-delay:150ms]" />
                  <div className="w-[3px] h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
            <div>
              <p className="font-black text-sm text-white leading-tight">{activePanelist.name}</p>
              <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mt-0.5">{activePanelist.role}</p>
            </div>

            {/* Status badge — SVG icons only, no emoji */}
            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${
              isTtsSpeaking
                ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                : uiState === 'evaluating'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : uiState === 'feedback'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-blue-600/15 border-blue-500/25 text-blue-300'
            }`}>
              {isTtsSpeaking ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-current motion-safe:animate-pulse shrink-0" />Speaking</>
              ) : uiState === 'evaluating' ? (
                <><Loader2 className="w-2.5 h-2.5 motion-safe:animate-spin shrink-0" />Reviewing</>
              ) : uiState === 'feedback' ? (
                <><CheckCircle2 className="w-2.5 h-2.5 shrink-0" />Responded</>
              ) : (
                <><span className="w-1.5 h-1.5 rounded-full bg-current motion-safe:animate-pulse shrink-0" />Examining</>
              )}
            </div>

            <p className="text-[9px] text-slate-500 leading-relaxed line-clamp-3">{activePanelist.persona?.split('.')[0]}.</p>
          </div>
        ) : (
          <div className="p-5 rounded-2xl border border-white/8 bg-white/[0.02] flex flex-col items-center text-center gap-3 opacity-60">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Users className="w-7 h-7 text-slate-500" />
            </div>
            <p className="text-xs text-slate-500 font-bold">Awaiting question…</p>
          </div>
        )}

        {/* Other panelists — compact, dimmed */}
        {others.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-2">Also on the panel</p>
            {others.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.02] border border-white/[0.07] rounded-xl opacity-60 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center text-[10px] font-black shrink-0">
                  {getInitials(p.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-300 truncate">{p.name}</p>
                  <p className="text-[9px] text-slate-400 truncate">{p.role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    );
  };

  // ─────────────────────────────────────────────────────────────────
  // RIGHT PANEL — Progress & History
  // ─────────────────────────────────────────────────────────────────
  const RightPanel = () => (
    <aside className={`flex flex-col gap-4 overflow-y-auto ${dragScrollClass}`} {...dragScrollHandlers}>
      {/* Coverage progress */}
      <div className="p-4 bg-white/[0.02] border border-white/[0.07] rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Section Coverage</span>
          <span className="ml-auto text-[10px] font-black text-blue-400">{coveredCount}/{totalSections}</span>
        </div>
        <div className="space-y-3">
          {Object.values(coverageMap).map(s => {
            const isActive = s.section === targetSection;
            const isCovered = s.covered;
            const isCapped = cappedSections.has(s.section);
            const barColor = isCovered
              ? (isCapped ? 'bg-amber-500' : 'bg-emerald-500')
              : isActive ? 'bg-blue-500' : 'bg-slate-700';
            const textColor = isCovered
              ? (isCapped ? 'text-amber-400' : 'text-emerald-400')
              : isActive ? 'text-blue-300 font-black' : 'text-slate-400';
            const scoreTextColor = isCovered
              ? (isCapped ? 'text-amber-400' : 'text-emerald-400')
              : isActive ? 'text-blue-400' : 'text-slate-500';
            return (
              <div key={s.section} className={`transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-75'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className={`flex items-center gap-1 min-w-0 text-[10px] font-bold ${textColor}`}>
                    {isCovered
                      ? <CheckCircle2 className={`w-3 h-3 shrink-0 ${isCapped ? 'text-amber-400' : 'text-emerald-400'}`} />
                      : isActive
                      ? <ChevronRight className="w-3 h-3 shrink-0 text-blue-400" />
                      : <span className="w-3 shrink-0" />
                    }
                    <span className="truncate max-w-[110px]">{s.section}</span>
                    {isCapped && <span className="text-[8px] text-amber-500 ml-1">cap</span>}
                  </div>
                  <span className={`text-[10px] font-black ml-1 shrink-0 ${scoreTextColor}`}>{s.mastery}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <ProgressFill pct={s.mastery} className={`h-full rounded-full transition-all duration-700 ${barColor}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Running score */}
      {runningAvg !== null && (
        <div className="p-4 bg-white/[0.02] border border-white/[0.07] rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Running Score</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className={`text-3xl font-black leading-none ${scoreColor(runningAvg)}`}>{runningAvg}</span>
            <span className="text-slate-500 text-sm font-bold">/100</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <ProgressFill pct={runningAvg} className={`h-full rounded-full transition-all duration-700 ${scoreBg(runningAvg)}`} />
          </div>
        </div>
      )}

      {/* Question history */}
      {history.length > 0 && (
        <div className="p-4 bg-white/[0.02] border border-white/[0.07] rounded-2xl flex flex-col gap-2 min-h-0">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">History</span>
            <span className="ml-auto text-[10px] font-black text-slate-500">{history.length} answered</span>
          </div>
          <div className={`space-y-2 overflow-y-auto max-h-60 ${dragScrollClass}`} {...dragScrollHandlers}>
            {[...history].reverse().map((h, i) => {
              const verdict = verdictLabel(h.feedback.score);
              return (
                <div key={i} className="p-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Q{history.length - i}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${verdict.bg} ${verdict.color}`}>{verdict.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{h.question}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[9px] text-slate-500">{h.category}</span>
                    <span className={`text-[10px] font-black ${scoreColor(h.feedback.score)}`}>{h.feedback.score}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans [zoom:1.12]">
      <Header />

      {/* Dialogs */}
      {showEndConfirm && (
        <ConfirmDialog
          title="End Defense Session?"
          message="Your answers and scores up to this point will be saved and you will be taken to the session review."
          confirmLabel="End Session"
          cancelLabel="Continue Defense"
          danger
          onConfirm={handleEndSession}
          onCancel={() => setShowEndConfirm(false)}
        />
      )}
      {showExitConfirm && (
        <ConfirmDialog
          title="Exit Without Saving?"
          message="Your session progress will be lost. Are you sure you want to leave?"
          confirmLabel="Exit"
          cancelLabel="Stay"
          danger
          onConfirm={onExit}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}

      {showInactivityPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full shadow-xl shadow-slate-300/50 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Timer className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Are you still there?</h3>
            <p className="text-slate-400 text-sm mb-7 leading-relaxed">
              No activity for a few minutes. Your session will auto-save and end in 2 minutes if there's still no response.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { resetInactivityTimer(); }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl uppercase tracking-widest text-xs transition-all">
                I'm Here
              </button>
              <button type="button" onClick={() => { setShowInactivityPrompt(false); completeSession(history); }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs transition-all">
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONNECTION LOST ────────────────────────────────────────
          A live viva needs a live panel. When the network drops or every AI
          provider fails, the session halts here until the student reconnects
          — it does not continue on offline heuristics. */}
      {connectionLost && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <WifiOff className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Connection lost</h3>
            <p className="text-slate-500 text-sm mb-7 leading-relaxed">
              Defensa can't reach the AI panel, so the session is paused &mdash; it won't
              continue without one. Reconnect to the internet, then hit Try again.
            </p>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={handleRetryConnection} disabled={isRetrying}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black rounded-2xl uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2">
                {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isRetrying ? 'Reconnecting…' : 'Try again'}
              </button>
              <button type="button" onClick={() => { setConnectionLost(false); stopSpeaking(); sttRef.current?.stop(); completeSession(history); }}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs transition-all">
                End session now
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-grow overflow-hidden">

        {/* ── INTRO ──────────────────────────────────────────────── */}
        {uiState === 'intro' && (() => {
          const dur = config?.duration || 30;
          const diff = config?.difficulty || 'Intermediate';
          const mode = config?.mode || 'text';
          const diffColor = diff === 'Beginner' ? 'text-emerald-600' : diff === 'Advanced' ? 'text-red-600' : 'text-amber-600';
          const diffBg = diff === 'Beginner' ? 'bg-emerald-50 border-emerald-200' : diff === 'Advanced' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';

          return (
            <div className={`h-full overflow-y-auto flex items-start justify-center p-6 ${dragScrollClass}`} {...dragScrollHandlers}>
              <div className="max-w-3xl w-full py-6">
                <div className="text-center mb-10">
                  <div className="w-16 h-16 bg-blue-100 border border-blue-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Sparkles className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-3xl font-black uppercase tracking-tight mb-2">Defense Simulation Ready</h2>
                  <p className="text-slate-400 text-sm max-w-lg mx-auto">
                    Your session is configured. The panel will evaluate you across all sections of your research document.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-8">
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                    <Timer className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Duration</p>
                    <p className="font-black text-slate-800">{dur} min</p>
                  </div>
                  <div className={`p-5 border rounded-2xl text-center ${diffBg}`}>
                    <div className={`w-5 h-5 rounded-full mx-auto mb-2 ${diff === 'Beginner' ? 'bg-emerald-400' : diff === 'Advanced' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Difficulty</p>
                    <p className={`font-black ${diffColor}`}>{diff}</p>
                  </div>
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                    <Mic className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Mode</p>
                    <p className="font-black text-slate-800 capitalize">{mode}</p>
                  </div>
                </div>

                <div className="mb-8">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Your Examination Panel</p>
                  <div className={`grid gap-3 ${selectedPanelists.length <= 2 ? 'grid-cols-2 max-w-sm mx-auto' : selectedPanelists.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
                    {selectedPanelists.map(p => (
                      <div key={p.id} className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-sm font-black mx-auto mb-2 border border-blue-200">{getInitials(p.name)}</div>
                        <p className="font-black text-xs text-slate-800 truncate mb-0.5">{p.name}</p>
                        <p className="text-[10px] text-blue-600 font-bold">{p.role}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {(config?.mode === 'voice' || config?.mode === 'hybrid') && <MicTestButton />}

                <div className="text-center">
                  <button type="button" onClick={initializeSession}
                    className="inline-flex items-center gap-3 px-12 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-200 uppercase tracking-widest text-sm">
                    Begin Defense <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── GENERATING ─────────────────────────────────────────── */}
        {uiState === 'generating' && (
          <div className="relative h-[calc(100vh-56px)] flex items-center justify-center p-6 overflow-hidden bg-[#070C16]">
            {/* Animated WebGL plasma background */}
            <ShaderBackground />

            {/* Dark vignette so the center text stays readable */}
            <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-[#070C16]/60 to-[#070C16]/95 pointer-events-none" />

            {/* Content card */}
            <div className="relative z-10 text-center max-w-sm">
              {/* Spinner */}
              <div className="w-14 h-14 bg-blue-600/30 border border-blue-500/40 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-900/40 backdrop-blur-sm">
                <Loader2 className="w-7 h-7 text-blue-300 animate-spin" />
              </div>

              <h2 className="text-xl font-black uppercase tracking-tight mb-2 text-white drop-shadow">
                Panel Preparing
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed drop-shadow">
                Analyzing your research document and formulating your first question…
              </p>
            </div>
          </div>
        )}

        {/* ── FINALIZING (session end) ───────────────────────────── */}
        {uiState === 'finalizing' && (
          <div className="relative h-[calc(100vh-56px)] flex items-center justify-center p-6 overflow-hidden bg-[#070C16]">
            <ShaderBackground />
            <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-[#070C16]/60 to-[#070C16]/95 pointer-events-none" />
            <div className="relative z-10 text-center max-w-sm">
              <div className="w-14 h-14 bg-blue-600/30 border border-blue-500/40 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-900/40 backdrop-blur-sm">
                <Loader2 className="w-7 h-7 text-blue-300 animate-spin" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight mb-2 text-white drop-shadow">
                Compiling Your Results
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed drop-shadow">
                Scoring your answers and building your readiness summary…
              </p>
            </div>
          </div>
        )}

        {/* ── ACTIVE — STAGE LAYOUT ───────────────────────────────── */}
        {uiState === 'active' && (
          <div className="h-[calc(100vh-56px)] grid grid-cols-1 lg:grid-cols-[220px_1fr_240px] gap-0 overflow-hidden">

            {/* Left sidebar */}
            <div className={`hidden lg:flex flex-col p-4 border-r border-white/[0.07] overflow-y-auto bg-[#0C1425] ${dragScrollClass}`} {...dragScrollHandlers}>
              <LeftPanel />
            </div>

            {/* ── Center stage: vertically + horizontally centered ── */}
            <div className={`overflow-y-auto min-h-0 ${dragScrollClass}`} {...dragScrollHandlers}>
              {/* min-h-full + flex items-center = centers vertically when content is short,
                  scrolls naturally when content overflows */}
              <div className="min-h-full flex items-center justify-center px-5 py-10">
                <div className="w-full max-w-[720px] flex flex-col gap-5">

                  {/* ① Badges row + answer timer */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentQuestion && !isGeneratingQuestion ? (
                      <>
                        {(() => { const dm = DIFFICULTY_META[currentQuestion.difficulty] ?? DIFFICULTY_META.Moderate; return (
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border ${dm.bg} ${dm.border} ${dm.color}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${dm.dot}`} />
                            {currentQuestion.difficulty}
                          </span>
                        ); })()}
                        {currentQuestion.question_type && (
                          <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg border bg-slate-50 border-slate-200 text-slate-400 uppercase tracking-widest">
                            {currentQuestion.question_type}
                          </span>
                        )}
                        {currentQuestion.source_section && (
                          <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg border bg-blue-50 border-blue-200 text-blue-600">
                            {currentQuestion.source_section}
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-black text-slate-500">
                          <Clock className="w-3 h-3" />
                          {formatTime(answerSeconds)}
                        </div>
                      </>
                    ) : (
                      /* Skeleton badges */
                      <div className="flex gap-2">
                        <div className="h-6 w-16 bg-slate-100 rounded-lg motion-safe:animate-pulse" />
                        <div className="h-6 w-20 bg-slate-100 rounded-lg motion-safe:animate-pulse" />
                        <div className="h-6 w-24 bg-slate-100 rounded-lg motion-safe:animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* ② Examiner name + role (only when question is ready) */}
                  {currentQuestion && !isGeneratingQuestion ? (
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border shrink-0 transition-all duration-300 ${
                        isTtsSpeaking
                          ? 'bg-blue-100 border-blue-400 text-blue-700 shadow-md shadow-blue-100'
                          : 'bg-blue-50 border-blue-300 text-blue-600'
                      }`}>
                        {getInitials(currentQuestion.panelist.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm text-slate-800 leading-none">{currentQuestion.panelist.name}</p>
                          {isTtsSpeaking && (
                            <div className="flex gap-[3px] items-end">
                              <div className="w-[3px] h-2.5 bg-blue-400 rounded-full motion-safe:animate-bounce" />
                              <div className="w-[3px] h-3.5 bg-blue-400 rounded-full motion-safe:animate-bounce [animation-delay:120ms]" />
                              <div className="w-[3px] h-2 bg-blue-400 rounded-full motion-safe:animate-bounce [animation-delay:240ms]" />
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wider mt-0.5">{currentQuestion.panelist.role}</p>
                      </div>
                    </div>
                  ) : (
                    /* Skeleton examiner row */
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0 motion-safe:animate-pulse" />
                      <div className="flex flex-col gap-1.5">
                        <div className="h-3.5 w-32 bg-slate-100 rounded motion-safe:animate-pulse" />
                        <div className="h-2.5 w-20 bg-slate-100 rounded motion-safe:animate-pulse" />
                      </div>
                    </div>
                  )}

                  {/* ③ Thread history — collapsed exchange log for follow-up threads */}
                  {activeThreadExchanges.length > 0 && (
                    <div className="space-y-2">
                      {activeThreadExchanges.map((ex, i) => (
                        <div key={i} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                          {/* Panelist Q */}
                          <div className="flex items-start gap-2.5 px-4 py-3 border-b border-slate-100">
                            <div className="w-5 h-5 rounded-md bg-blue-100 border border-blue-200 flex items-center justify-center text-[9px] font-black text-blue-600 shrink-0 mt-0.5">
                              {ex.isFollowUp ? '↩' : 'Q'}
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed flex-1">{ex.question}</p>
                          </div>
                          {/* Student A */}
                          <div className="flex items-start gap-2.5 px-4 py-3">
                            <div className="w-5 h-5 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center text-[9px] font-black text-emerald-600 shrink-0 mt-0.5">
                              A
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-600 leading-relaxed">{ex.answer.length > 180 ? ex.answer.slice(0, 180) + '…' : ex.answer}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[9px] font-black uppercase tracking-widest ${ex.satisfactionScore >= 75 ? 'text-emerald-600' : ex.satisfactionScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {ex.satisfactionScore}% satisfied
                                </span>
                                {ex.gaps.length > 0 && (
                                  <span className="text-[9px] text-slate-500">· {ex.gaps.length} gap{ex.gaps.length > 1 ? 's' : ''} noted</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ③b Panelist remark bubble — shown after each exchange */}
                  {panelistRemark && !isThreadEvaluating && activeThreadExchanges.length > 0 && currentQuestion?.question_type === 'Follow-up' && (
                    <div className="flex items-start gap-3 animate-question-in">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-300 flex items-center justify-center text-[9px] font-black text-blue-600 shrink-0 mt-0.5">
                        {currentQuestion.panelist ? getInitials(currentQuestion.panelist.name) : '?'}
                      </div>
                      <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                        <p className="text-xs text-blue-700 leading-relaxed">&ldquo;{panelistRemark}&rdquo;</p>
                      </div>
                    </div>
                  )}

                  {/* ③c Panelist thinking indicator — shown while evaluating satisfaction */}
                  {isThreadEvaluating && (
                    <div className="flex items-center gap-3 animate-question-in">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-300 flex items-center justify-center shrink-0">
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                      </div>
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-4 py-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce" />
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce [animation-delay:150ms]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce [animation-delay:300ms]" />
                        <span className="text-[10px] text-slate-500 ml-2">Panelist is evaluating your response…</span>
                      </div>
                    </div>
                  )}

                  {/* ④ Question hero — keyed so React remounts on each new question,
                      restarting the CSS entrance animation */}
                  <div key={isGeneratingQuestion ? 'skeleton' : (currentQuestion?.question ?? 'empty')}>
                    {isGeneratingQuestion || !currentQuestion ? (
                      /* Generating skeleton */
                      <div className="bg-white border border-slate-200 rounded-2xl p-7 space-y-4">
                        <div className="flex gap-1.5 items-end mb-2">
                          <div className="w-1.5 h-4 bg-blue-100 rounded-full motion-safe:animate-bounce" />
                          <div className="w-1.5 h-6 bg-blue-100 rounded-full motion-safe:animate-bounce [animation-delay:100ms]" />
                          <div className="w-1.5 h-3 bg-blue-100 rounded-full motion-safe:animate-bounce [animation-delay:200ms]" />
                          <div className="w-1.5 h-5 bg-blue-100 rounded-full motion-safe:animate-bounce [animation-delay:300ms]" />
                          <div className="w-1.5 h-2.5 bg-blue-100 rounded-full motion-safe:animate-bounce [animation-delay:400ms]" />
                        </div>
                        <div className="space-y-3">
                          <div className="h-5 bg-slate-100 rounded-lg motion-safe:animate-pulse w-full" />
                          <div className="h-5 bg-slate-100 rounded-lg motion-safe:animate-pulse w-[92%]" />
                          <div className="h-5 bg-slate-100 rounded-lg motion-safe:animate-pulse w-[78%]" />
                        </div>
                        <p className="text-slate-500 text-xs text-center pt-1">Panel is formulating your question…</p>
                      </div>
                    ) : (
                      /* Live question card — entrance animation plays on each remount */
                      <div className={`animate-question-in bg-white border rounded-2xl p-7 transition-[border-color,box-shadow] duration-300 ${
                        isTtsSpeaking
                          ? 'border-blue-300 shadow-lg shadow-blue-200'
                          : 'border-slate-200 shadow-sm shadow-slate-200/50'
                      }`}>
                        {/* Question hero text */}
                        <p className="font-medium text-[1.5rem] lg:text-[1.625rem] text-slate-800 leading-[1.6] max-w-[65ch] tracking-tight">
                          {currentQuestion.question}
                        </p>
                        {currentQuestion.source_excerpt && (
                          <p className="mt-5 text-[11px] text-slate-500 border-t border-slate-200 pt-4 leading-relaxed">
                            Ref: {currentQuestion.source_excerpt}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ④ Voice error */}
                  {isVoiceEnabled && voiceError && (
                    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <p className="text-xs text-red-600 leading-relaxed flex-1">{voiceError}</p>
                      <button type="button" title="Dismiss" aria-label="Dismiss error" onClick={() => setVoiceError(null)} className="text-red-500 hover:text-red-600 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* ④ Voice recording in-progress */}
                  {isVoiceEnabled && isListening && (
                    <div className="bg-white border border-red-200 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-red-600 font-black text-xs">
                          <div className="w-2 h-2 rounded-full bg-red-500 motion-safe:animate-pulse" />
                          Recording your answer…
                        </div>
                        <button type="button" onClick={handleStopRecording}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-red-100 transition-all">
                          <Square className="w-3 h-3" /> Done
                        </button>
                      </div>
                      {liveTranscript
                        ? <p className="text-slate-600 text-sm leading-relaxed">&ldquo;{liveTranscript}&rdquo;</p>
                        : <p className="text-slate-500 text-sm">Speak clearly into your microphone…</p>
                      }
                      {silencePrompt && (
                        <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                          <p className="text-slate-400 text-xs font-bold">Done?</p>
                          <button type="button" onClick={handleStopRecording}
                            className="px-2.5 py-1 bg-blue-100 border border-blue-300 text-blue-600 text-[10px] font-black rounded-lg uppercase tracking-widest">Yes, Submit</button>
                          <button type="button" onClick={() => setSilencePrompt(false)}
                            className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-black rounded-lg uppercase tracking-widest">Continue</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ④ Transcript review */}
                  {isVoiceEnabled && isReviewingTranscript && !isListening && (
                    <div className="bg-white border border-blue-200 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                          <Edit3 className="w-3 h-3" /> Review & Edit Transcript
                        </h3>
                        <button type="button" onClick={() => { setIsReviewingTranscript(false); handleStartRecording(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-slate-200">
                          <Mic className="w-3 h-3" /> Re-record
                        </button>
                      </div>
                      <textarea aria-label="Transcript"
                        className="w-full min-h-[100px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 resize-none outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 text-sm leading-relaxed transition-all duration-200"
                        value={liveTranscript} onChange={e => setLiveTranscript(e.target.value)} />
                      <button type="button" onClick={handleSubmitVoice} disabled={!liveTranscript.trim()}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black rounded-xl uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all">
                        <Send className="w-3.5 h-3.5" /> Submit Answer
                      </button>
                    </div>
                  )}

                  {/* ⑤ Answer textarea + char counter — hidden while thread evaluating */}
                  {!isThreadEvaluating && (
                    <div className="relative">
                      <textarea
                        ref={textareaRef}
                        aria-label="Your response"
                        autoFocus
                        maxLength={3000}
                        rows={7}
                        className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none text-slate-800 placeholder:text-slate-400 resize-none overflow-hidden transition-all duration-200 text-base leading-relaxed shadow-sm shadow-slate-200/50"
                        placeholder={followUpCount > 0 ? "Address the panelist's follow-up question…" : 'Articulate your response based on your research findings…'}
                        value={response}
                        onChange={e => setResponse(e.target.value)}
                      />
                      {/* Character counter — floats inside bottom-right of textarea */}
                      <span className={`absolute bottom-3.5 right-4 text-[10px] font-bold tabular-nums pointer-events-none transition-colors duration-200 ${
                        response.length >= 2900 ? 'text-red-600' : response.length >= 2700 ? 'text-amber-600' : 'text-slate-600'
                      }`}>
                        {response.length}/3000
                      </span>
                    </div>
                  )}

                  {/* ⑥ Action bar — Skip | Mic | Submit */}
                  {!isThreadEvaluating && (
                    <div className="flex items-center justify-end gap-3">
                      <button type="button" onClick={handleSkip}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-600 text-[10px] font-black uppercase tracking-widest transition-colors duration-150 mr-auto">
                        <FastForward className="w-3 h-3" /> Skip
                      </button>
                      {isSTTSupported() && (
                        <button type="button" onClick={isListening ? handleStopRecording : handleStartRecording}
                          title={isListening ? 'Stop recording' : 'Voice input'}
                          className={`p-2.5 rounded-xl border transition-all duration-200 ${
                            isListening
                              ? 'bg-red-100 border-red-300 text-red-600 motion-safe:animate-pulse'
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700 hover:border-slate-300'
                          }`}>
                          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                      )}
                      <button type="button" disabled={!response.trim() || !currentQuestion || isGeneratingQuestion} onClick={() => handleSubmit()}
                        className="flex items-center gap-2 px-7 py-2.5 bg-blue-600 hover:bg-blue-500 hover:-translate-y-px active:translate-y-0 disabled:opacity-25 disabled:cursor-not-allowed disabled:translate-y-0 text-white font-black rounded-xl transition-all duration-150 text-xs uppercase tracking-widest shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-200">
                        {followUpCount > 0 ? 'Respond' : 'Submit'} <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Mobile coverage chips (hidden on desktop where right panel shows) */}
                  {totalSections > 0 && (
                    <div className="lg:hidden flex flex-wrap gap-2 pt-4 border-t border-slate-200">
                      {Object.values(coverageMap).map(s => (
                        <span key={s.section}
                          className={`flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border transition-all ${
                            s.covered
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : s.section === targetSection
                              ? 'bg-blue-50 border-blue-200 text-blue-600'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>
                          {s.covered
                            ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                            : s.section === targetSection
                            ? <ChevronRight className="w-2.5 h-2.5 shrink-0" />
                            : null
                          }
                          {s.section}
                        </span>
                      ))}
                    </div>
                  )}

                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className={`hidden lg:flex flex-col p-4 border-l border-white/[0.07] overflow-y-auto bg-[#0C1425] ${dragScrollClass}`} {...dragScrollHandlers}>
              <RightPanel />
            </div>
          </div>
        )}

        {/* ── EVALUATING ─────────────────────────────────────────── */}
        {uiState === 'evaluating' && (
          <div className="relative h-[calc(100vh-56px)] flex items-center justify-center p-6 overflow-hidden bg-[#070C16]">
            <ShaderBackground />
            <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-[#070C16]/60 to-[#070C16]/95 pointer-events-none" />
            <div className="relative z-10 text-center max-w-sm">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full motion-safe:animate-ping" />
                <div className="w-20 h-20 bg-blue-600/20 border border-blue-500/25 rounded-2xl flex items-center justify-center">
                  <Sparkles className="w-9 h-9 text-blue-300" />
                </div>
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight mb-2 text-white drop-shadow">Evaluating Answer</h2>
              <p className="text-slate-300 text-sm mb-8 drop-shadow">Applying rubric weights and analyzing your response…</p>
              <div className="space-y-2 text-left">
                {[
                  { label: 'Accuracy',     color: 'bg-blue-500' },
                  { label: 'Completeness', color: 'bg-sky-400' },
                  { label: 'Clarity',      color: 'bg-blue-300' },
                  { label: 'Confidence',   color: 'bg-cyan-300' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl backdrop-blur-sm">
                    <div className={`w-2 h-2 rounded-full ${item.color} motion-safe:animate-pulse ${['', '[animation-delay:150ms]', '[animation-delay:300ms]', '[animation-delay:450ms]'][i] ?? ''}`} />
                    <span className="text-xs font-bold text-slate-200">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── FEEDBACK ───────────────────────────────────────────── */}
        {uiState === 'feedback' && (
          <div className="h-[calc(100vh-56px)] grid grid-cols-1 lg:grid-cols-[1fr_280px] overflow-hidden">
            <div className={`overflow-y-auto p-5 lg:p-8 ${dragScrollClass}`} {...dragScrollHandlers}>

              {!currentEval && (
                <div className="max-w-lg mx-auto text-center py-16">
                  <div className="w-14 h-14 bg-amber-100 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <AlertCircle className="w-7 h-7 text-amber-600" />
                  </div>
                  <h2 className="text-xl font-black uppercase tracking-tight mb-2">Evaluation Unavailable</h2>
                  <p className="text-slate-400 text-sm mb-2">{evalError || 'The AI evaluator did not return a result. Your response was recorded.'}</p>
                  <p className="text-slate-500 text-xs mb-8">This response will be scored as 0. You can continue to the next question.</p>
                  <button type="button" onClick={handleNext}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-500 transition-all text-xs uppercase tracking-widest">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {currentEval && (() => {
                const v = verdictLabel(currentEval.finalScore);
                return (
                  <div className="max-w-2xl mx-auto space-y-6">
                    {/* Thread summary — shown only when follow-ups occurred */}
                    {activeThreadExchanges.length > 1 && (
                      <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Panel Exchange</p>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${
                              threadVerdict === 'satisfied'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                : threadVerdict === 'capped'
                                ? 'bg-amber-50 border-amber-200 text-amber-600'
                                : 'bg-slate-100 border-slate-300 text-slate-400'
                            }`}>
                              {threadVerdict === 'satisfied' ? 'Satisfied' : threadVerdict === 'capped' ? 'Follow-up cap reached' : 'Skipped'}
                            </span>
                            <span className="text-[9px] text-slate-500">{followUpCount} follow-up{followUpCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {activeThreadExchanges.map((ex, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <span className={`text-[9px] font-black uppercase shrink-0 mt-0.5 w-12 text-right ${ex.isFollowUp ? 'text-blue-600' : 'text-slate-500'}`}>
                                {ex.isFollowUp ? 'Follow' : 'Root'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-500 leading-relaxed">{ex.question.length > 90 ? ex.question.slice(0, 90) + '…' : ex.question}</p>
                                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{ex.answer.length > 120 ? ex.answer.slice(0, 120) + '…' : ex.answer}</p>
                              </div>
                              <span className={`text-[9px] font-black shrink-0 tabular-nums mt-0.5 ${ex.satisfactionScore >= 75 ? 'text-emerald-600' : ex.satisfactionScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                {ex.satisfactionScore}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Score header */}
                    <div className="flex items-center justify-between gap-4 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Your Score</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-5xl font-black leading-none tracking-tight ${scoreColor(currentEval.finalScore)}`}>{currentEval.finalScore}</span>
                          <span className="text-slate-500 font-bold">/100</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Verdict</p>
                        <span className={`inline-block px-3 py-1.5 border rounded-xl text-xs font-black uppercase tracking-widest ${v.bg} ${v.color}`}>{v.label}</span>
                      </div>
                    </div>

                    {/* Category breakdown */}
                    <div className="p-6 bg-white border border-slate-200 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">Category Breakdown</p>
                      <div className="grid grid-cols-2 gap-5">
                        {[
                          { label: 'Accuracy',     val: currentEval.accuracy,    desc: currentEval.explanations.accuracy },
                          { label: 'Completeness', val: currentEval.completeness, desc: currentEval.explanations.completeness },
                          { label: 'Clarity',      val: currentEval.clarity,      desc: currentEval.explanations.clarity },
                          { label: 'Confidence',   val: currentEval.confidence,   desc: currentEval.explanations.confidence },
                        ].map((cat, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{cat.label}</span>
                              <span className={`text-sm font-black ${scoreColor(cat.val)}`}>{cat.val}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                              <ProgressFill pct={cat.val} className={`h-full rounded-full transition-all duration-700 ${scoreBg(cat.val)}`} />
                            </div>
                            <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{cat.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Strengths & Improvements */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                        <h4 className="text-emerald-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 mb-3">
                          <CheckCircle2 className="w-3.5 h-3.5" />Strengths
                        </h4>
                        <ul className="space-y-2">
                          {currentEval.strengths.map((s, i) => (
                            <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
                        <h4 className="text-amber-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 mb-3">
                          <AlertCircle className="w-3.5 h-3.5" />Improvements
                        </h4>
                        <ul className="space-y-2">
                          {currentEval.improvements.map((s, i) => (
                            <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                              <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Suggested answer */}
                    {currentEval.suggestedAnswer && (
                      <div className="p-5 bg-blue-50 border border-blue-200 rounded-2xl">
                        <h4 className="text-blue-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 mb-3">
                          <Sparkles className="w-3.5 h-3.5" />Suggested Answer
                        </h4>
                        <p className="text-slate-600 text-sm leading-relaxed">&ldquo;{currentEval.suggestedAnswer}&rdquo;</p>
                      </div>
                    )}

                    {/* Voice reaction */}
                    {isVoiceEnabled && isPlayingReaction && (
                      <div className="flex items-center gap-2 text-blue-600 text-xs font-bold py-2 justify-center">
                        <div className="flex gap-0.5 items-end">
                          <div className="w-0.5 h-2.5 bg-blue-400 rounded-full motion-safe:animate-pulse" />
                          <div className="w-0.5 h-3.5 bg-blue-400 rounded-full motion-safe:animate-pulse [animation-delay:150ms]" />
                          <div className="w-0.5 h-2.5 bg-blue-400 rounded-full motion-safe:animate-pulse [animation-delay:300ms]" />
                        </div>
                        Panelist is responding…
                      </div>
                    )}

                    {/* Next button */}
                    <button type="button" onClick={handleNext} disabled={isVoiceEnabled && isPlayingReaction}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-500 hover:-translate-y-px disabled:opacity-40 disabled:translate-y-0 text-white font-black rounded-2xl transition-all duration-150 flex items-center justify-center gap-2 uppercase tracking-widest text-xs shadow-lg shadow-blue-200 hover:shadow-blue-200">
                      {coveredCount >= totalSections && totalSections > 0 ? 'Finalize Defense' : 'Next Question'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Feedback right panel */}
            <div className={`hidden lg:flex flex-col p-4 border-l border-white/[0.07] overflow-y-auto bg-[#0C1425] ${dragScrollClass}`} {...dragScrollHandlers}>
              <RightPanel />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper with Error Boundary
// ─────────────────────────────────────────────────────────────────────────────

const PracticeSessionView: React.FC<Props> = (props) => (
  <SessionErrorBoundary onReset={props.onExit}>
    <PracticeSessionInner {...props} />
  </SessionErrorBoundary>
);

export default PracticeSessionView;
