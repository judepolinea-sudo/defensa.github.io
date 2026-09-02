
import React, { useState } from 'react';
import {
  CheckCircle, Star, Clock, ListChecks,
  TrendingUp, BarChart, ArrowRight, Home,
  X, MessageSquare, AlertCircle, CheckCircle2,
  Sparkles, FastForward, Loader2, Brain,
  ThumbsUp, ThumbsDown, BookOpen, Target, Lightbulb,
} from 'lucide-react';
import { SessionResult, QuestionAnswer } from '../../types';
import { generateSessionEvalReport, SessionEvalReport } from '../../services/geminiService';

interface Props {
  result: SessionResult;
  sessionId?: string | null;
  token?: string | null;
  onGoDashboard: () => void;
  onViewDetailed: () => void;
}

// Quick post-session survey. `key` is the field the backend expects.
const SURVEY_QUESTIONS: { key: 'realism' | 'difficulty' | 'helpfulness'; label: string; low: string; high: string }[] = [
  { key: 'realism', label: "How realistic did the panel's questions feel?", low: 'Not realistic', high: 'Just like a real defense' },
  { key: 'difficulty', label: 'Was the difficulty level right for you?', low: 'Way off', high: 'Just right' },
  { key: 'helpfulness', label: 'How helpful was the feedback you received?', low: 'Not helpful', high: 'Very helpful' },
];

const SessionSummaryView: React.FC<Props> = ({ result, sessionId, token, onGoDashboard, onViewDetailed }) => {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [report, setReport] = useState<SessionEvalReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const surveyStorageKey = `defensa.survey.${sessionId ?? result.id}`;
  const [surveyRatings, setSurveyRatings] = useState<Record<string, number>>({});
  const [surveyPrepared, setSurveyPrepared] = useState<'yes' | 'somewhat' | 'no' | ''>('');
  const [surveyComment, setSurveyComment] = useState('');
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyDone, setSurveyDone] = useState(() => {
    try { return localStorage.getItem(surveyStorageKey) === '1'; } catch { return false; }
  });

  const submitSurvey = async () => {
    setSurveySubmitting(true);
    try {
      await fetch(`/api/sessions/${sessionId ?? 'unknown'}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          realism: surveyRatings.realism ?? null,
          difficulty: surveyRatings.difficulty ?? null,
          helpfulness: surveyRatings.helpfulness ?? null,
          prepared: surveyPrepared || null,
          comment: surveyComment,
        }),
      });
    } catch {
      /* non-fatal — feedback is best-effort */
    } finally {
      try { localStorage.setItem(surveyStorageKey, '1'); } catch { /* ignore */ }
      setSurveyDone(true);
      setSurveySubmitting(false);
    }
  };

  const handleGenerateReport = async () => {
    setIsReportOpen(true);
    if (report) return; // already generated
    setReportLoading(true);
    setReportError(null);
    try {
      const historyForReport = result.history.map(h => ({
        question: h.question,
        answer: h.answer,
        category: h.category,
        feedback: { score: h.feedback.score },
      }));
      const r = await generateSessionEvalReport(
        (result as any).abstractText || '',
        historyForReport,
        result.overallScore,
      );
      setReport(r);
    } catch {
      setReportError('Failed to generate AI report. Please try again.');
    } finally {
      setReportLoading(false);
    }
  };

  const verdictColor = (v: string) => {
    if (v.toUpperCase().includes('PASS') && !v.toUpperCase().includes('CONDITIONAL')) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200';
    if (v.toUpperCase().includes('CONDITIONAL')) return 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-200';
    return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="bg-white dark:bg-slate-900 rounded-[40px] p-10 md:p-16 shadow-xl border border-slate-100 dark:border-slate-800 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-48 h-48 bg-blue-50 dark:bg-blue-500/10 rounded-full -ml-24 -mt-24" />
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-50 dark:bg-blue-500/10 rounded-full -mr-24 -mb-24" />

          <div className="relative z-10">
            <div className="w-24 h-24 bg-green-100 dark:bg-green-500/20 text-green-600 rounded-[40px] flex items-center justify-center mx-auto mb-10 animate-bounce shadow-lg">
              <CheckCircle className="w-12 h-12" />
            </div>

            <h1 className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-2 uppercase tracking-tighter">Session Complete!</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-12 font-medium">Institutional defense readiness analysis updated successfully.</p>

            <div className="flex justify-center items-center gap-12 mb-16">
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Final Score</p>
                <p className="text-7xl font-black text-blue-600 leading-none mb-4">{result.overallScore}</p>
                <div className="flex justify-center gap-1.5 text-amber-400">
                  {[1,2,3,4].map(i => (
                    <Star key={i} className={`w-5 h-5 ${i <= Math.round(result.overallScore / 25) ? 'fill-current' : ''}`} />
                  ))}
                </div>
              </div>
              <div className="h-24 w-px bg-slate-100 dark:bg-slate-800 hidden sm:block" />
              <div className="text-left hidden sm:block">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Evaluation</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter mb-1">
                  {result.overallScore > 80 ? 'Optimal' : result.overallScore > 60 ? 'Stable' : 'Needs Focus'}
                </p>
                <p className="text-sm text-green-600 font-black uppercase tracking-widest">Defense Readiness</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
              <div className="p-8 bg-slate-50 dark:bg-slate-950 rounded-[32px] border border-slate-100 dark:border-slate-800 group hover:border-blue-200 transition-all">
                <Clock className="w-8 h-8 text-blue-500 mx-auto mb-4" />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mb-1">Duration</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{result.duration}m</p>
              </div>
              <div className="p-8 bg-slate-50 dark:bg-slate-950 rounded-[32px] border border-slate-100 dark:border-slate-800 group hover:border-blue-200 transition-all">
                <ListChecks className="w-8 h-8 text-blue-500 mx-auto mb-4" />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mb-1">Questions</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{result.questionsAnswered}</p>
              </div>
              <div className="p-8 bg-slate-50 dark:bg-slate-950 rounded-[32px] border border-slate-100 dark:border-slate-800 group hover:border-green-200 transition-all">
                <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-4" />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mb-1">Difficulty</p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">Mid</p>
              </div>
            </div>

            {/* ── Quick feedback survey ─────────────────────────────── */}
            <div className="mb-10 p-8 bg-slate-50 dark:bg-slate-950 rounded-[32px] border border-slate-100 dark:border-slate-800 text-left">
              {surveyDone ? (
                <div className="flex items-center gap-3 justify-center py-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    Thanks for the feedback — it helps us improve Defensa.
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-1">30-second survey</p>
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                      How was this session?
                    </h3>
                  </div>

                  <div className="space-y-6">
                    {SURVEY_QUESTIONS.map((q) => (
                      <div key={q.key}>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{q.label}</p>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setSurveyRatings((r) => ({ ...r, [q.key]: n }))}
                              className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${
                                surveyRatings[q.key] === n
                                  ? 'bg-blue-600 text-white shadow-lg'
                                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-blue-300'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 px-1">
                          <span>{q.low}</span>
                          <span>{q.high}</span>
                        </div>
                      </div>
                    ))}

                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Do you feel more prepared for your actual defense?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {([['yes', 'Yes'], ['somewhat', 'Somewhat'], ['no', 'Not yet']] as const).map(([val, lbl]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setSurveyPrepared(val)}
                            className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-tight transition-all ${
                              surveyPrepared === val
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-blue-300'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Anything else you&apos;d like us to know? <span className="font-medium text-slate-400">(optional)</span>
                      </p>
                      <textarea
                        rows={2}
                        value={surveyComment}
                        onChange={(e) => setSurveyComment(e.target.value)}
                        maxLength={2000}
                        className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="Your comments…"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={submitSurvey}
                      disabled={surveySubmitting}
                      className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {surveySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Submit feedback
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button type="button"                onClick={onViewDetailed}
                className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-3xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest text-sm"
              >
                Go to Analytics <BarChart className="w-5 h-5" />
              </button>
              <button type="button"                onClick={handleGenerateReport}
                className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-3xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest text-sm"
              >
                AI Review Report <Brain className="w-5 h-5" />
              </button>
              <button type="button"                onClick={() => setIsTranscriptOpen(true)}
                className="w-full py-5 bg-slate-900 text-white font-black rounded-3xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-200 uppercase tracking-widest text-sm"
              >
                Review Transcript <MessageSquare className="w-5 h-5" />
              </button>
              <button type="button"                onClick={onGoDashboard}
                className="w-full py-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-black rounded-3xl flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-xs"
              >
                <Home className="w-4 h-4" /> Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Review Report Modal ──────────────────────────────────── */}
      {isReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
            <header className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">AI Evaluation Report</h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Post-Session Analysis with References</p>
              </div>
              <button type="button" onClick={() => setIsReportOpen(false)} className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 rounded-2xl transition-all" aria-label="Close report">
                <X className="w-6 h-6" />
              </button>
            </header>

            <div className="flex-grow overflow-y-auto p-8 space-y-8 bg-slate-50 dark:bg-slate-950/30">
              {reportLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-500/20 rounded-3xl flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">Generating AI analysis…</p>
                </div>
              )}

              {reportError && (
                <div className="flex items-center gap-3 p-5 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-2xl">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">{reportError}</p>
                </div>
              )}

              {report && !reportLoading && (
                <>
                  {/* Verdict */}
                  <div className={`p-6 rounded-3xl border-2 text-center ${verdictColor(report.verdict)}`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 opacity-70">Official Verdict</p>
                    <p className="text-2xl font-black uppercase tracking-tight">{report.verdict}</p>
                  </div>

                  {/* Overall Readiness */}
                  <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-blue-500" /> Overall Readiness Assessment
                    </h3>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{report.overallReadiness}</p>
                  </div>

                  {/* Strengths & Improvements */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-6 bg-emerald-50 dark:bg-emerald-500/10 rounded-3xl border border-emerald-100">
                      <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <ThumbsUp className="w-3.5 h-3.5" /> Strengths
                      </h3>
                      <ul className="space-y-2">
                        {report.strengths.map((s, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-6 bg-amber-50 dark:bg-amber-500/10 rounded-3xl border border-amber-100">
                      <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <ThumbsDown className="w-3.5 h-3.5" /> Areas for Improvement
                      </h3>
                      <ul className="space-y-2">
                        {report.areasForImprovement.map((s, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Section Breakdown */}
                  {report.sectionBreakdown.length > 0 && (
                    <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                      <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-blue-500" /> Section-by-Section Breakdown
                      </h3>
                      <div className="space-y-4">
                        {report.sectionBreakdown.map((sec, i) => (
                          <div key={i} className="flex gap-4 items-start">
                            <div className="shrink-0 text-center">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm ${
                                sec.score >= 80 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
                                sec.score >= 60 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                                'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
                              }`}>
                                {sec.score}
                              </div>
                            </div>
                            <div>
                              <p className="font-black text-slate-800 dark:text-slate-100 text-sm uppercase tracking-tight">{sec.section}</p>
                              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed mt-1">{sec.observations}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  <div className="p-6 bg-blue-50 dark:bg-blue-500/10 rounded-3xl border border-blue-100">
                    <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <Lightbulb className="w-3.5 h-3.5" /> Recommendations
                    </h3>
                    <ul className="space-y-2">
                      {report.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <span className="font-black text-blue-400 shrink-0">{i + 1}.</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Key Concepts */}
                  {(report.keyConceptsCovered.length > 0 || report.keyConceptsMissed.length > 0) && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {report.keyConceptsCovered.length > 0 && (
                        <div className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Concepts Demonstrated</p>
                          <div className="flex flex-wrap gap-2">
                            {report.keyConceptsCovered.map((c, i) => (
                              <span key={i} className="px-3 py-1 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-black rounded-xl uppercase">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {report.keyConceptsMissed.length > 0 && (
                        <div className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Concepts to Review</p>
                          <div className="flex flex-wrap gap-2">
                            {report.keyConceptsMissed.map((c, i) => (
                              <span key={i} className="px-3 py-1 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 text-xs font-black rounded-xl uppercase">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <footer className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-end shrink-0">
              <button type="button" onClick={() => setIsReportOpen(false)} className="px-10 py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg">
                Close Report
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ── Transcript Modal ────────────────────────────────────────── */}
      {isTranscriptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-[40px] shadow-2xl flex flex-col relative overflow-hidden">
            <header className="p-10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Session Transcript</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-widest">Question-by-Question AI Analysis</p>
              </div>
              <button type="button" onClick={() => setIsTranscriptOpen(false)} className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 rounded-2xl transition-all" aria-label="Close transcript">
                <X className="w-6 h-6" />
              </button>
            </header>

            <div className="flex-grow overflow-y-auto p-10 space-y-12 bg-slate-50 dark:bg-slate-950/20">
              {result.history.map((qa: QuestionAnswer, i: number) => {
                const isSkipped = qa.feedback.score === 0;
                return (
                  <div key={i} className={`space-y-6 p-8 rounded-[40px] border transition-all ${isSkipped ? 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 border-dashed opacity-80' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Sequence {i + 1} &bull; {qa.category}</span>
                      {isSkipped ? (
                        <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <FastForward className="w-3 h-3" /> Skipped
                        </span>
                      ) : (
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${qa.feedback.score > 80 ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                          Score: {qa.feedback.score}/100
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="bg-slate-50 dark:bg-slate-950 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800 relative">
                          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-4">Panelist Question</div>
                          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-relaxed">"{qa.question}"</p>
                        </div>
                        <div className={`p-8 rounded-[32px] border relative ${isSkipped ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-800' : 'bg-blue-50 dark:bg-blue-500/10/30 border-blue-100'}`}>
                          <div className="text-[10px] font-black text-blue-400 uppercase mb-4">{isSkipped ? 'User Action' : 'Your Answer'}</div>
                          <p className={`font-medium leading-relaxed ${isSkipped ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>{qa.answer}</p>
                        </div>
                      </div>

                      <div className={`rounded-[32px] p-8 space-y-8 border ${isSkipped ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-60' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'}`}>
                        <div>
                          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-blue-500" /> AI Diagnostic
                          </h4>
                          <div className="grid grid-cols-2 gap-6 mb-8">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-2">Relevance</p>
                              <p className="text-xl font-black text-slate-800 dark:text-slate-100">{Math.round(qa.feedback.semanticRelevance || 0)}%</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-2">Confidence</p>
                              <p className="text-xl font-black text-slate-800 dark:text-slate-100">{Math.round(qa.feedback.confidenceLevel || 0)}%</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {qa.feedback.strengths.length > 0 && (
                            <div className="flex gap-4">
                              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                              <div>
                                <p className="text-[10px] font-black text-green-600 uppercase mb-1">Strengths</p>
                                <ul className="text-xs font-bold text-slate-600 dark:text-slate-400 space-y-1">
                                  {qa.feedback.strengths.map((s, idx) => <li key={idx}>&bull; {s}</li>)}
                                </ul>
                              </div>
                            </div>
                          )}
                          <div className="flex gap-4">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                            <div>
                              <p className="text-[10px] font-black text-amber-600 uppercase mb-1">{isSkipped ? 'Skipped Reason' : 'Growth Areas'}</p>
                              <ul className="text-xs font-bold text-slate-600 dark:text-slate-400 space-y-1">
                                {qa.feedback.improvements.map((s, idx) => <li key={idx}>&bull; {s}</li>)}
                              </ul>
                            </div>
                          </div>
                        </div>

                        {!isSkipped && (
                          <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-black text-blue-500 uppercase mb-3">Model Response Suggestion</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">"{qa.feedback.betterExample}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="p-10 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-end">
              <button type="button" onClick={() => setIsTranscriptOpen(false)} className="px-10 py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-lg">
                Done Reviewing
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionSummaryView;
