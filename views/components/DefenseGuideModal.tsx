import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FileText, Target, MessageSquare, Mic, TrendingUp,
  CheckCircle2, Quote,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Tip {
  text: string;
}

interface Section {
  icon: React.ReactNode;
  title: string;
  tips: Tip[];
}

const SECTIONS: Section[] = [
  {
    icon: <FileText className="w-5 h-5" />,
    title: 'Before You Start',
    tips: [
      { text: 'Upload your full document, not just the abstract. The panel only asks about content it can actually read — a thin upload means shallow, generic questions.' },
      { text: 'On the Outline Selection screen, pick sections deliberately. The panel goes deep on whatever you select rather than skimming everything, so choose the chapters you actually want to be tested on.' },
    ],
  },
  {
    icon: <Target className="w-5 h-5" />,
    title: 'How Scoring Works',
    tips: [
      { text: 'Your final score per answer is weighted: Accuracy 35%, Completeness 25%, Clarity 20%, Confidence 20%. Accuracy carries the most weight — get your facts and terminology exactly right first.' },
      { text: 'A section only closes once your running mastery on it hits about 50%. Weak answers don’t get skipped past — you’ll keep getting probed on the same topic until you actually demonstrate you know it.' },
    ],
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    title: 'During the Session',
    tips: [
      { text: 'Cite your own document specifically — exact methodology names, real figures, actual tool/framework choices. Generic answers score lower even if they’re technically correct.' },
      { text: 'If a follow-up question appears, it’s targeting a specific gap the panelist noticed in your last answer. Address that gap directly instead of repeating what you already said.' },
      { text: 'Strong answers get harder follow-ups — an edge case, a counter-argument, a deeper implication. That’s the system escalating because you’re doing well, not a sign you answered wrong.' },
    ],
  },
  {
    icon: <Mic className="w-5 h-5" />,
    title: 'Confidence Score',
    tips: [
      { text: 'Confidence scoring specifically penalizes hesitation markers ("uh", "um") and hedge words ("I think", "maybe", "I’m not sure"). State your answer definitively.' },
      { text: 'Practice in Voice mode, not just Text. Saying an answer out loud under time pressure is a different skill than typing it, and it’s the one your actual defense will test.' },
    ],
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: 'After Each Session',
    tips: [
      { text: 'Check your Readiness Dashboard for the "Weakest Category" and lowest-scoring focus areas after every attempt.' },
      { text: 'Start your next session by selecting specifically the chapters you scored worst on — targeted repetition closes gaps faster than a full re-run every time.' },
    ],
  },
];

const DefenseGuideModal: React.FC<Props> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[32px] shadow-2xl relative flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 pb-6 border-b border-slate-100 flex items-start justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-1">
                  Defense Guide
                </h2>
                <p className="text-slate-500 text-sm">Practical tips for getting the most out of practice sessions.</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close guide"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 space-y-8">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="flex items-center gap-2 font-black text-slate-800 uppercase tracking-tight text-sm mb-4">
                    <span className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                      {section.icon}
                    </span>
                    {section.title}
                  </h3>
                  <ul className="space-y-3 pl-1">
                    {section.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <span>{tip.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="flex items-start gap-3 p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                <Quote className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-sm text-blue-800 leading-relaxed">
                  Treat every session like the real thing. The panel is only as useful as how honestly you engage with it — skipping hard questions just means your actual defense will be the first time you face them.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 shrink-0">
              <button
                onClick={onClose}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all uppercase tracking-tight text-xs"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DefenseGuideModal;
