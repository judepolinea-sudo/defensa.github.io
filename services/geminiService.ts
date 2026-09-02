import { DifficultyLevel, Panelist, RagChunk, SessionPhase } from "../types";
import { PANELISTS } from "../constants";

// ============================================================
// VIRTUAL VIVA VOCE DEFENSE SIMULATION ENGINE — SYSTEM PROMPTS
// ============================================================

const SYSTEM_QUESTION = `You are a senior capstone thesis-defense panelist running a real-time adaptive oral exam. Ask ONE targeted question grounded in the document section under assessment, the student's last answer, and that section's mastery level (calibrate difficulty to it).

NEVER: invent details/technologies/findings not in the document; ask a generic question ("What is your methodology?"); repeat a prior question; use information from outside the document.

Adapt to the last score:
- <50 (weak): "Your document states X, but you said Y — reconcile that."
- 50-69 (partial): "You covered X. What about [missing aspect from the document]?"
- >=70 (strong): challenge with an edge case, counter-argument, or deeper implication from the document.

Always cite the document, e.g. "Your document uses [X]. Why was it more suitable than [Y], and what in Chapter Z supports that?"

Categories: Clarification, Methodology Defense, Design Justification, Literature Validation, Limitation Analysis, Assumption Challenge, Data Integrity, Security, Scalability, Future Improvements.

Return ONLY valid JSON — no markdown, no extra text.`;

const SYSTEM_EVALUATOR = `You are the LLM-as-judge evaluation engine of a virtual thesis-defense panel. Produce a precise, fair, academically rigorous evaluation of one defense answer; your output feeds the performance report.

Dimensions and weights: accuracy 35% (domain knowledge — content correctness and research relevance); completeness 25% (depth and coverage); clarity 20% (organisation and academic register); confidence 20% (composure).

Verdicts:
- finalScore >= 80 AND accuracy >= 75 -> "✅ Correct"
- finalScore 60-79 OR accuracy 50-74 -> "⚠️ Partially Correct"
- otherwise -> "❌ Insufficient"

Rules:
- Score SUBSTANCE, not length — a short precise answer beats a long vague one.
- Quote ACTUAL phrases from the answer in every explanation field.
- Give partial credit, stating what was right vs. missing. Paraphrasing is never wrong.
- Never hallucinate facts about the research — stick to the abstract provided.
- LENIENCY: a coherent, on-topic answer showing sensible grasp scores 60-80 even if informal or missing minor detail. Reserve <50 for genuinely off-topic, incoherent, or non-engaging answers.
- Confidence: start at 90; -12 per strong hesitation marker (uh/um/erm); -6 per weak hedge (I think/maybe/I guess/sort of/kind of/I'm not sure).
- finalScore MUST equal accuracy*0.35 + completeness*0.25 + clarity*0.20 + confidence*0.20.
- Return ONLY valid JSON — no markdown fences, no extra text.`;

interface CallAIOptions {
  /** interactive path — server prioritises the lowest-latency providers */
  fast?: boolean;
  /** output token cap — smaller = faster for short JSON replies */
  maxTokens?: number;
  timeoutMs?: number;
}

async function callServerAI(
  prompt: string,
  system?: string,
  opts: CallAIOptions = {},
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const resp = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, system, fast: opts.fast, maxTokens: opts.maxTokens }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("[AI] Server returned", resp.status, errBody);
      throw new Error(`Server AI proxy error ${resp.status}: ${errBody}`);
    }
    const data = await resp.json();
    if (!data.text) console.error("[AI] Server returned empty text:", data);
    return data.text ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// --- ABSTRACT ANALYSIS ---

function extractAbstractTerms(abstract: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "this",
    "that",
    "these",
    "those",
    "which",
    "with",
    "for",
    "and",
    "or",
    "but",
    "not",
    "in",
    "on",
    "at",
    "to",
    "of",
    "has",
    "have",
    "been",
    "by",
    "as",
    "its",
    "be",
    "their",
    "they",
    "from",
    "into",
    "will",
    "can",
    "may",
    "also",
    "more",
    "than",
    "such",
    "about",
    "after",
    "before",
    "between",
    "each",
    "both",
    "all",
    "some",
    "any",
    "when",
    "where",
    "while",
    "study",
    "research",
    "paper",
    "work",
    "using",
    "used",
    "based",
    "system",
    "data",
    "results",
    "findings",
    "analysis",
    "approach",
    "method",
    "methods",
  ]);
  const words = abstract.toLowerCase().match(/\b[a-z][a-z]{3,}\b/g) || [];
  const freq: Record<string, number> = {};
  words.forEach((w) => {
    if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

function getResearchTopic(abstract: string): string {
  const first = abstract.split(/[.!?\n]/)[0]?.trim() || "";
  return first.substring(0, 100) || abstract.substring(0, 80);
}

// A panelist's role should shape HOW they interrogate (their disposition and the
// kind of weakness they look for), never WHICH topic they ask about — the topic
// always comes from the document. Deliberately contains no subject nouns.
function panelistAngleFor(role: string): string {
  const r = (role || "").toLowerCase();
  if (/method|research design|psychometric|assessment|statistic|epidemiolog/.test(r))
    return "You press on rigour and evidence — why a choice was made over the alternatives, and whether the section's own claims are actually supported by what it reports.";
  if (/advers|critic|ethic|impact|reviewer/.test(r))
    return "You go for the single weakest point in what the section actually says — an unsupported claim, a contradiction, an assumption left unexamined.";
  if (/practition|industry|operation|management|entrepreneur|quality/.test(r))
    return "You test whether what the section describes would hold up in real use — feasibility, what was left out, what happens once the study ends.";
  if (/architect|technical|engineer|systems|design|developer/.test(r))
    return "You dig into how something was built or decided and whether that choice holds up — what was assumed, what trade-off was accepted, where it could fail.";
  return "You examine the section critically from your area of expertise, staying strictly on what the document reports.";
}

// Map an arbitrary selected section label to the closest fallback-template group.
function phaseForSection(section: string): string {
  const s = (section || "").toLowerCase();
  if (/(literature|related stud|related work|rrl|framework|review of related)/.test(s)) return "Literature";
  if (/(method|design|sdlc|architecture|erd|diagram|data gathering|sampling|instrument)/.test(s)) return SessionPhase.METHODOLOGY;
  if (/(result|finding|testing|test case|evaluation|discussion|data analysis|uat|acceptance)/.test(s)) return SessionPhase.RESULTS;
  if (/(conclusion|recommendation|summary)/.test(s)) return "Conclusions";
  if (/(limitation|contribution|future|defense)/.test(s)) return SessionPhase.DEFENSE;
  if (/(introduction|background|problem|objective|scope|significance|rationale)/.test(s)) return SessionPhase.INTRODUCTION;
  return SessionPhase.INTRODUCTION;
}

// --- CONTEXTUAL FALLBACK QUESTIONS (used when the AI call fails) ---
// Every template weaves in the actual selected section and, where possible, a
// real phrase lifted from the document, so even the offline path stays about
// THIS paper rather than sounding like a generic panel script.

type TplCtx = { section: string; topic: string; kw: string[]; phrase: string };
type Tpl = (c: TplCtx) => { question: string; category: string };

const kwList = (kw: string[], n = 2) => kw.slice(0, n).join(" and ") || "your study";

const PHRASE_TEMPLATES: Tpl[] = [
  ({ section, phrase }) => ({
    question: `In your ${section}, you write "${phrase}". Unpack that for the panel — what does it actually mean and why did you put it that way?`,
    category: "Clarification",
  }),
  ({ section, phrase }) => ({
    question: `Your ${section} states "${phrase}". What evidence in your own work backs that claim up?`,
    category: "Data Integrity",
  }),
  ({ section, phrase }) => ({
    question: `You base part of your ${section} on "${phrase}". What would change in your study if that turned out not to hold?`,
    category: "Assumption Challenge",
  }),
];

const CONTEXTUAL_TEMPLATES: Record<string, Tpl[]> = {
  [SessionPhase.INTRODUCTION]: [
    ({ section }) => ({ question: `What specific gap did your ${section} identify, and how do your objectives address exactly that gap?`, category: "Research Gap" }),
    ({ kw }) => ({ question: `Your objectives centre on ${kwList(kw, 3)}. Which one is hardest to actually achieve, and why?`, category: "Objectives" }),
    ({ topic }) => ({ question: `Why does "${topic}" matter now, and who is the primary beneficiary you had in mind?`, category: "Significance" }),
    ({ section, kw }) => ({ question: `What did your ${section} deliberately leave out of scope around ${kw[0] || "the topic"}, and what did excluding it cost you?`, category: "Scope" }),
  ],
  Literature: [
    ({ section }) => ({ question: `Of the studies in your ${section}, which one is closest to your work, and how is yours different?`, category: "Literature Validation" }),
    ({ kw }) => ({ question: `Where do the sources you reviewed on ${kwList(kw)} disagree with each other, and whose side did you take?`, category: "Literature Validation" }),
    ({ section }) => ({ question: `What in your ${section} directly justifies the approach you ended up choosing?`, category: "Design Justification" }),
    ({ section }) => ({ question: `Which claim in your ${section} is the weakest-supported, and would you still keep it?`, category: "Assumption Challenge" }),
  ],
  [SessionPhase.METHODOLOGY]: [
    ({ section }) => ({ question: `Walk the panel through the design in your ${section} step by step — where is it most likely to have gone wrong?`, category: "Methodology Defense" }),
    ({ kw }) => ({ question: `How exactly did you collect data on ${kwList(kw)}, and how do you know the instrument measured what you think it did?`, category: "Data Integrity" }),
    ({ section }) => ({ question: `What alternative method could have answered your questions, and why did you reject it in your ${section}?`, category: "Methodology Defense" }),
    ({ section }) => ({ question: `Which single decision in your ${section} would you defend hardest if a panelist attacked it?`, category: "Design Justification" }),
  ],
  [SessionPhase.RESULTS]: [
    ({ section }) => ({ question: `What is the single most important finding in your ${section}, and what makes it more than a coincidence?`, category: "Data Integrity" }),
    ({ kw }) => ({ question: `Did your results on ${kwList(kw)} match what your literature predicted? Where didn't they, and why?`, category: "Literature Validation" }),
    ({ section }) => ({ question: `Which result in your ${section} surprised you, and how do you explain it?`, category: "Clarification" }),
    ({ section }) => ({ question: `Does your ${section} fully answer every research objective? Which one is only partly answered?`, category: "Limitation Analysis" }),
  ],
  [SessionPhase.DEFENSE]: [
    ({ section }) => ({ question: `What is the most serious limitation in your ${section}, and how far does it narrow what you can claim?`, category: "Limitation Analysis" }),
    ({ kw }) => ({ question: `What does your work on ${kwList(kw)} let someone do that they couldn't before?`, category: "Future Improvements" }),
    ({ section }) => ({ question: `If you restarted this study tomorrow, what one change to your ${section} would matter most?`, category: "Future Improvements" }),
  ],
  Conclusions: [
    ({ section }) => ({ question: `Which conclusion in your ${section} goes furthest beyond what your data can actually support?`, category: "Assumption Challenge" }),
    ({ section }) => ({ question: `Your ${section} makes recommendations — who is supposed to act on them, and can they realistically do so?`, category: "Future Improvements" }),
    ({ section }) => ({ question: `Summarise your contribution in one sentence. Does your ${section} actually demonstrate that?`, category: "Clarification" }),
  ],
};

const usedContextualIndices: Record<string, Set<number>> = {};

// Call at the start of each practice session so template cycling restarts.
export function resetContextualFallback() {
  for (const k of Object.keys(usedContextualIndices)) delete usedContextualIndices[k];
}

// Pull a short, substantive phrase straight from the document for grounding.
function pickDocumentPhrase(text: string, avoid: string[] = []): string {
  const sentences = (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 180 && /[a-z]{4,}/i.test(s));
  const usedBlob = avoid.join(" ").toLowerCase();
  const fresh = sentences.filter((s) => !usedBlob.includes(s.toLowerCase().slice(0, 30)));
  const pool = fresh.length > 0 ? fresh : sentences;
  if (pool.length === 0) return "";
  const s = pool[Math.floor(Math.random() * pool.length)];
  return s.replace(/["]/g, "").slice(0, 150);
}

function getContextualFallbackQuestion(
  phase: string,
  panelist: Panelist,
  abstract: string,
  askedQuestions: string[] = [],
  targetSection?: string,
) {
  const terms = extractAbstractTerms(abstract);
  const topic = getResearchTopic(abstract);
  const section = targetSection || phase;
  const phrase = pickDocumentPhrase(abstract, askedQuestions);

  const base = CONTEXTUAL_TEMPLATES[phase] ?? CONTEXTUAL_TEMPLATES[SessionPhase.INTRODUCTION];
  // Phrase-grounded templates go first and are only usable when we found a phrase.
  const templates = phrase ? [...PHRASE_TEMPLATES, ...base] : base;
  const ctx: TplCtx = { section, topic, kw: terms, phrase };

  const key = `${phase}:${section}`;
  if (!usedContextualIndices[key]) usedContextualIndices[key] = new Set();

  const askedLower = askedQuestions.map((q) => q.toLowerCase().trim());
  const isRepeat = (q: string) =>
    askedLower.some((a) => a.slice(0, 60) === q.toLowerCase().trim().slice(0, 60));

  const allIndices = templates.map((_, i) => i);
  const notUsed = allIndices.filter((i) => !usedContextualIndices[key].has(i));
  const pool = notUsed.length > 0 ? notUsed : allIndices;

  const withQ = pool.map((i) => ({ i, ...templates[i](ctx) }));
  const fresh = withQ.filter(({ question }) => !isRepeat(question));
  const candidates = fresh.length > 0 ? fresh : withQ;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  usedContextualIndices[key].add(chosen.i);
  if (usedContextualIndices[key].size >= templates.length) usedContextualIndices[key].clear();

  return { question: chosen.question, category: chosen.category, expectedKeywords: terms, panelist };
}

// --- LOCAL EVALUATOR (used when AI is unavailable) ---

// --- ANSWER QUALITY GUARDS ---------------------------------------------------
// Used by the offline scorers AND as a hard clamp on the AI scorers so that
// keyboard-mashing or "I don't know" can never earn points (a small model can
// otherwise be talked into scoring them as "partial").

const NON_ANSWER_RE =
  /^\s*(i\s+(do\s*n['’]?t|don['’]?t|do\s+not|can\s*not|can['’]?t)\s+know|no\s+idea|not\s+sure|unsure|idk|i\s+pass|pass|skip|n\s*\/?\s*a|none|nothing|no\s+comment|i\s+forgot|i\s+have\s+no\s+(idea|answer)|i\s+can['’]?t\s+answer)\b/i;

// Help/support requests and "I'm confused" noises — not attempts to answer.
const META_OR_CONFUSED_RE =
  /\b(help\s*me|i\s+need\s+help|please\s+help|assist\s+me|my\s+(account|password|email|access)\s+(is\s+)?(lost|gone|missing|hacked|not\s+working)|i\s+(lost|forgot)\s+my\s+(account|password|email)|can['’]?t\s+(log\s*in|sign\s*in|access\s+my)|log\s*in\s+(problem|issue)|reset\s+my\s+password|what\s+(what|do\s+you\s+mean|are\s+you\s+asking)|repeat\s+the\s+question|i\s+don['’]?t\s+understand\s+the\s+question|say\s+(that\s+)?again|come\s+again)\b/i;

export function isNonAnswer(answer: string): boolean {
  const raw = (answer || "").trim();
  const t = raw.toLowerCase().replace(/[.!?,;:\s]+$/g, "");
  if (!t) return true;
  if (["no", "yes", "ok", "okay", "maybe", "na", "n/a", "none", "idk", "huh", "what", "why", "wat", "eh"].includes(t))
    return true;
  if (NON_ANSWER_RE.test(t)) return true;
  if (META_OR_CONFUSED_RE.test(t)) return true;
  // Made up only of interrogatives / punctuation — "what what/what???", "huh??"
  const wordsOnly = t.replace(/[^a-z\s]/g, " ").trim();
  if (wordsOnly && /^((what|why|how|huh|wat|eh|who|when|where)\s*)+$/i.test(wordsOnly)) return true;
  return false;
}

// True when the answer's substantive vocabulary connects to NEITHER the
// question nor the source document — i.e. it's off-topic, even if it's real
// words ("my account is lost", a tangent, etc.).
export function looksOffTopic(
  answer: string,
  question: string,
  sourceText = "",
): boolean {
  const OT_STOP = new Set([
    "the","a","an","is","are","was","were","this","that","these","those","and","or","but",
    "not","for","with","from","into","your","you","have","has","had","will","can","would",
    "could","should","about","what","why","how","does","did","study","research","paper",
    "system","please","help","need","want","just","like","some","any","also","more",
  ]);
  const terms = (s: string) =>
    new Set(
      (s.toLowerCase().match(/\b[a-z][a-z-]{3,}\b/g) || []).filter((w) => !OT_STOP.has(w)),
    );
  const aTerms = [...terms(answer)];
  const wordCount = (answer.trim().match(/\S+/g) || []).length;
  if (wordCount > 0 && aTerms.length === 0) return true; // words, but nothing substantive
  if (aTerms.length === 0) return true;
  const qTerms = terms(question);
  const src = (sourceText || "").toLowerCase();
  const connected = aTerms.filter(
    (w) => qTerms.has(w) || (src.length > 40 && src.includes(w.slice(0, 6))),
  ).length;
  // A short answer whose content words barely touch the question or the paper
  // isn't engaging with what was asked.
  return wordCount <= 18 && aTerms.length <= 10 && connected / aTerms.length < 0.17;
}

export function looksLikeGibberish(answer: string): boolean {
  const t = (answer || "").trim().toLowerCase();
  if (!t) return true;
  const tokens = t.split(/\s+/);
  const letters = (w: string) => w.replace(/[^a-z]/g, "");
  // a long token that reuses very few distinct letters = keyboard mashing
  // (asdasdasd, qweqwe...); a real long word uses many distinct letters
  if (tokens.some((w) => {
    const l = letters(w);
    return l.length >= 12 && new Set(l).size / l.length < 0.5;
  })) return true;
  // a 2–4 char pattern repeated 3+ times inside a token
  if (tokens.some((w) => w.length >= 6 && /([a-z]{2,4})\1{2,}/.test(w))) return true;
  // consonant run of 5+ — no real English word has this
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(t)) return true;
  // share of tokens that look like real words (has a vowel, letters only, sane length)
  const wordish = tokens.filter(
    (w) => /[aeiou]/.test(w) && /^[a-z'’-]+$/.test(w) && w.length <= 24,
  ).length;
  if (tokens.length >= 2 && wordish / tokens.length < 0.45) return true;
  if (tokens.length === 1 && wordish === 0) return true;
  return false;
}

// Fixed near-zero result for a non-substantive answer. Confidence is deliberately
// low: composure is meaningless when nothing was actually said.
function nonSubstantiveResult(kind: "gibberish" | "nonanswer" | "trivial"): RubricEvaluation {
  const trivial = kind === "trivial";
  const accuracy = trivial ? 8 : 3;
  const completeness = trivial ? 8 : 3;
  const clarity = trivial ? 18 : 5;
  const confidence = trivial ? 22 : 8;
  const finalScore = Math.round(accuracy * 0.35 + completeness * 0.25 + clarity * 0.2 + confidence * 0.2);
  const accExpl =
    kind === "nonanswer"
      ? "The response declines to answer or states that the answer is unknown."
      : kind === "gibberish"
        ? "The response contains no meaningful content related to the question."
        : "The response is too short to show any understanding of the question.";
  return {
    accuracy, completeness, clarity, confidence, finalScore,
    explanations: {
      accuracy: accExpl,
      completeness: "The question was not addressed.",
      clarity: "There is no substantive content to evaluate.",
      confidence: "Not applicable. The question was not answered.",
    },
    feedback:
      kind === "nonanswer"
        ? "❌ Insufficient. You did not attempt an answer. Even a partial explanation from your research is better than declining."
        : kind === "gibberish"
          ? "❌ Insufficient. The response does not address the question. Engage with the specific topic being asked."
          : "❌ Insufficient. The response is far too short. Give a full explanation with supporting evidence from your study.",
    strengths: [],
    improvements: [
      "Answer the question directly using specific details from your own research.",
      "Use the terminology, methods, and findings from your study.",
    ],
    suggestedAnswer:
      "A complete answer would state the point directly and back it with a specific method, result, or piece of evidence from your research document.",
    confidenceMetrics: { hesitationFillers: 0, vagueLanguageScore: trivial ? 20 : 80, concisenessScore: 15 },
  };
}

function localEvaluate(
  question: string,
  answer: string,
  expectedKeywords: string[] = [],
  _responseTimeMs: number = 0,
): RubricEvaluation {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lowerAnswer = answer.toLowerCase();
  const lowerQuestion = question.toLowerCase();

  // === GIBBERISH / OFF-TOPIC DETECTION ===
  // Check semantic overlap: how many words in the answer appear in question or keywords
  const questionWords = lowerQuestion.split(/\W+/).filter((w) => w.length > 3);
  const keywordsLower = expectedKeywords.map((k) => k.toLowerCase());
  const allContextWords = [...new Set([...questionWords, ...keywordsLower])];
  const meaningfulHits = words.filter((w) =>
    allContextWords.some((cw) => w.includes(cw.slice(0, 5)) || cw.includes(w.slice(0, 5))),
  ).length;
  const overlapRatio = wordCount > 0 ? meaningfulHits / wordCount : 0;

  // Non-substantive answers get a fixed near-zero result — including a low
  // confidence, because "composure" on an empty answer is not a real score.
  if (isNonAnswer(answer)) return nonSubstantiveResult("nonanswer");
  if (
    looksLikeGibberish(answer) ||
    looksOffTopic(answer, question, expectedKeywords.join(" ")) ||
    (wordCount > 6 && overlapRatio < 0.06 && meaningfulHits < 3)
  ) {
    return nonSubstantiveResult("gibberish");
  }
  if (wordCount < 5) return nonSubstantiveResult("trivial");

  // === ACCURACY ===
  const matched = expectedKeywords.filter((kw) => {
    const lkw = kw.toLowerCase();
    return (
      lowerAnswer.includes(lkw) ||
      words.some((w) => w.length > 4 && (lkw.startsWith(w.slice(0, 5)) || w.startsWith(lkw.slice(0, 5))))
    );
  });
  const keywordRatio = expectedKeywords.length > 0 ? matched.length / expectedKeywords.length : overlapRatio;

  const hasNumbers = /\b\d+(\.\d+)?%?\b/.test(answer);
  const longDomainWords = words.filter((w) => w.length >= 8).length;
  const specificityBonus = (hasNumbers ? 6 : 0) + Math.min(longDomainWords * 2, 10);

  const relevanceRatio = questionWords.length > 0
    ? questionWords.filter((qw) => lowerAnswer.includes(qw)).length / questionWords.length
    : overlapRatio;

  // Lenient by design: a coherent, on-topic answer shouldn't need to hit every
  // expected keyword to land in the adequate-to-good range. Baselines are raised
  // and keyword-matching weight is reduced so sensible-but-imprecise answers
  // aren't scored as if they were wrong.
  const accuracyRaw = wordCount < 10
    ? Math.max(25, Math.round(25 + keywordRatio * 25))
    : Math.round(32 + keywordRatio * 35 + relevanceRatio * 15 + specificityBonus);
  const accuracy = Math.min(95, accuracyRaw);

  // === COMPLETENESS ===
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 8);
  const hasExamples = /for example|such as|specifically|namely|e\.g\.|instance|as seen|like when|illustrated by/i.test(answer);
  const hasMultiplePoints = sentences.length >= 3;

  // Word count contributes but is capped — no longer the sole driver
  const wcBase = wordCount < 15 ? Math.round(wordCount * 2) : wordCount < 60 ? Math.round(38 + (wordCount - 15) * 0.7) : Math.min(70, 70);
  const completenessBonus = (hasExamples ? 8 : 0) + (hasMultiplePoints ? 7 : 0) + Math.round(keywordRatio * 15);
  const completeness = Math.min(95, wcBase + completenessBonus);

  // === CLARITY ===
  const avgSentenceLen = wordCount / Math.max(sentences.length, 1);
  const wellPaced = avgSentenceLen >= 7 && avgSentenceLen <= 35;
  const hasConnectives = /therefore|because|however|additionally|furthermore|in contrast|as a result|consequently|moreover|thus|first|second|finally|in addition/i.test(answer);

  const clarityBase = sentences.length < 1 ? 28 : !wellPaced ? 48 : sentences.length === 1 ? 58 : Math.min(78, 62 + sentences.length * 5);
  const clarity = Math.min(90, clarityBase + (hasConnectives ? 8 : 0));

  // === CONFIDENCE ===
  const strongFillers = (answer.match(/\b(uh|um|erm)\b/gi) || []).length;
  const weakFillers = (
    answer.match(
      /\b(like|maybe|i think|i guess|perhaps|sort of|kind of|basically|literally|you know|i believe|not sure|i'm not sure|might be)\b/gi,
    ) || []
  ).length;
  const totalFillers = strongFillers + weakFillers;
  let confidence = Math.max(
    28,
    Math.min(100, 92 - strongFillers * 14 - weakFillers * 6),
  );
  // A barely-substantive answer cannot be "confident" in any meaningful way —
  // otherwise a short, off-topic answer with no filler words scores ~92 here
  // and drags the whole result up.
  const thinAnswer =
    wordCount < 15 || (relevanceRatio < 0.12 && keywordRatio < 0.15);
  if (thinAnswer) confidence = Math.min(confidence, 50);

  const finalScore = Math.round(
    accuracy * 0.35 + completeness * 0.25 + clarity * 0.2 + confidence * 0.2,
  );

  // === FEEDBACK STRINGS ===
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (keywordRatio >= 0.5)
    strengths.push(
      `Your response addressed ${matched.length} of the core concepts expected in this answer.`,
    );
  if (wordCount >= 60)
    strengths.push(
      "You provided a well-developed answer with sufficient depth.",
    );
  if (sentences.length >= 3)
    strengths.push("Your answer was organized across multiple clear points.");
  if (totalFillers === 0)
    strengths.push(
      "You delivered your answer with confidence and no hesitation words.",
    );
  if (hasConnectives)
    strengths.push(
      "Good use of transitional language made your answer easy to follow.",
    );
  if (hasNumbers)
    strengths.push("You grounded your answer with specific data or numbers.");

  if (keywordRatio < 0.4)
    improvements.push(
      `Your answer missed key terms like: ${expectedKeywords
        .filter((kw) => !matched.includes(kw))
        .slice(0, 3)
        .join(", ")}. Use precise research terminology.`,
    );
  if (wordCount < 40)
    improvements.push(
      "Expand your answer — aim for at least 50 words to show adequate depth.",
    );
  if (strongFillers > 0)
    improvements.push(
      `Remove filler words like "uh" and "um" (detected ${strongFillers}). Pause silently instead.`,
    );
  if (weakFillers > 2)
    improvements.push(
      `Avoid hedging phrases like "I think" or "maybe" (detected ${weakFillers}). State your findings with conviction.`,
    );
  if (sentences.length < 2)
    improvements.push(
      "Structure your answer into 2–3 complete sentences covering different aspects of the question.",
    );
  if (!hasConnectives && sentences.length > 1)
    improvements.push(
      "Use transition words (e.g., 'therefore', 'additionally', 'however') to connect your ideas.",
    );

  const missedTerms = expectedKeywords
    .filter((kw) => !matched.includes(kw))
    .slice(0, 5);

  return {
    accuracy,
    completeness,
    clarity,
    confidence,
    explanations: {
      accuracy:
        matched.length >= Math.ceil(expectedKeywords.length * 0.5)
          ? `Your answer correctly addressed the question and covered ${matched.length}/${expectedKeywords.length} expected concepts.`
          : `Your answer covered ${matched.length}/${expectedKeywords.length} key concepts. Missing: ${missedTerms.join(", ")}.`,
      completeness:
        wordCount >= 50
          ? `At ${wordCount} words across ${sentences.length} sentence(s), your answer demonstrated adequate depth.`
          : `At ${wordCount} words, your answer was brief. Expand with specific examples or data from your research.`,
      clarity:
        clarity >= 68
          ? `Your sentences were clear and logically organized${hasConnectives ? ", with good use of transitions" : ""}.`
          : `Aim for 2–3 well-constructed sentences. Vary your sentence structure and use transitional language.`,
      confidence:
        totalFillers === 0
          ? "Excellent — you answered with full confidence and no hesitation language."
          : `Detected ${totalFillers} hesitation/hedging word(s) (strong: ${strongFillers}, weak: ${weakFillers}). Practice speaking with conviction.`,
    },
    finalScore,
    feedback: `Your answer scored ${finalScore}/100. ${
      finalScore >= 85
        ? "Excellent response — highly specific and well-delivered."
        : finalScore >= 70
          ? "Good response. Strengthen precision by incorporating more research-specific terminology and examples."
          : finalScore >= 55
            ? "Adequate response. Focus on depth, specific data, and confident delivery."
            : "Needs improvement. Provide more specific, structured answers grounded in your actual research findings."
    }`,
    strengths:
      strengths.length > 0
        ? strengths.slice(0, 3)
        : ["You attempted to answer the question."],
    improvements:
      improvements.length > 0
        ? improvements.slice(0, 3)
        : [
            "Continue practicing with more specific, research-grounded answers.",
          ],
    suggestedAnswer:
      missedTerms.length > 0
        ? `A strong answer should incorporate terms like: ${missedTerms.join(", ")}. Structure it as: (1) directly answer the question, (2) cite specific findings or methods, (3) relate it back to your research objectives.`
        : `Structure your answer as: (1) directly address the question, (2) support with specific data or methodology from your research, (3) conclude by connecting it to your study's broader impact.`,
    confidenceMetrics: {
      hesitationFillers: totalFillers,
      vagueLanguageScore: Math.min(100, weakFillers * 14 + strongFillers * 20),
      concisenessScore: Math.max(0, 100 - Math.max(0, wordCount - 180)),
    },
  };
}

function parseAIJson(raw: string): any {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  return JSON.parse(cleaned);
}

// --- RAG LOGIC ---

export const createChunks = (
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.substring(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
};

export const getEmbeddings = async (text: string | string[]) => {
  const texts = Array.isArray(text) ? text : [text];
  return texts.map(() => [] as number[]);
};

export const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  if (!vecA.length || !vecB.length) return 0;
  const dot = vecA.reduce((s, a, i) => s + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((s, a) => s + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((s, b) => s + b * b, 0));
  return dot / (magA * magB);
};

export const retrieveRelevantChunks = async (
  query: string,
  chunks: RagChunk[],
  topK = 5,
): Promise<RagChunk[]> => {
  if (chunks.length === 0) return [];
  return retrieveRelevantChunksImproved(query, chunks, topK);
};

// --- CORE SERVICES ---

export interface PanelQuestion {
  question: string;
  source_section: string;
  source_excerpt: string;
  difficulty: "Easy" | "Moderate" | "Hard" | "Expert";
  question_type: string;
  reason: string;
  panelist: Panelist;
  category: string;
  expectedKeywords: string[];
}

export interface RubricEvaluation {
  accuracy: number;
  completeness: number;
  clarity: number;
  confidence: number;
  explanations: {
    accuracy: string;
    completeness: string;
    clarity: string;
    confidence: string;
  };
  finalScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  suggestedAnswer: string;
  confidenceMetrics?: {
    hesitationFillers: number;
    vagueLanguageScore: number;
    concisenessScore: number;
  };
}

export const analyzeAbstract = async (text: string) => {
  try {
    const prompt = `Analyze this research abstract and return JSON only.
Fields: wordCount(int), keyTopics(string[5-8 specific topics]), technicalTermsCount(int), summary(string, 2-3 sentences summarizing the research), methodologyDetails(string, the research method used).
Abstract: ${text.substring(0, 800)}`;
    const raw = await callServerAI(prompt, undefined, { fast: true, maxTokens: 500 });
    return parseAIJson(raw);
  } catch {
    const terms = extractAbstractTerms(text);
    return {
      wordCount: text.split(/\s+/).length,
      keyTopics: terms.slice(0, 5),
      technicalTermsCount: terms.length,
      summary: text.substring(0, 200),
      methodologyDetails: "",
    };
  }
};

// ============================================================
// OUTLINE ENGINE — document structure detection + section selection
// ============================================================

export interface OutlineSection {
  id: string;
  label: string;
}

export interface OutlineChapter {
  title: string;
  sections: OutlineSection[];
}

export interface DocumentOutline {
  chapters: OutlineChapter[];
}

const CHAPTER_GROUPS: Array<{
  chapter: string;
  order: number;
  keywords: string[];
}> = [
  {
    chapter: "CHAPTER 1 — Introduction",
    order: 0,
    keywords: [
      "introduction",
      "background",
      "problem statement",
      "objectives",
      "scope",
      "limitation",
      "significance",
      "rationale",
    ],
  },
  {
    chapter: "CHAPTER 2 — Review of Related Literature",
    order: 1,
    keywords: [
      "review of related literature",
      "related literature",
      "related studies",
      "related works",
      "conceptual framework",
      "theoretical framework",
    ],
  },
  {
    chapter: "CHAPTER 3 — Methodology",
    order: 2,
    keywords: [
      "methodology",
      "research design",
      "sdlc",
      "data gathering",
      "system architecture",
      "architecture",
      "database design",
      "erd",
      "entity relationship",
      "use case",
      "activity diagram",
      "sequence diagram",
      "dfd",
      "data flow",
    ],
  },
  {
    chapter: "CHAPTER 4 — Results & Testing",
    order: 3,
    keywords: [
      "results",
      "findings",
      "testing",
      "test case",
      "user acceptance",
      "evaluation",
      "discussion",
      "data analysis",
    ],
  },
  {
    chapter: "CHAPTER 5 — Conclusions",
    order: 4,
    keywords: ["conclusion", "recommendation"],
  },
];

function buildOutlineFromSections(sections: string[]): DocumentOutline {
  const chapterBuckets: Record<
    string,
    { title: string; order: number; sections: OutlineSection[] }
  > = {};

  sections.forEach((section, i) => {
    const lower = section.toLowerCase();
    const match = CHAPTER_GROUPS.find((g) =>
      g.keywords.some((k) => lower.includes(k)),
    );
    const chapterTitle = match?.chapter ?? "General";
    const order = match?.order ?? 99;
    if (!chapterBuckets[chapterTitle]) {
      chapterBuckets[chapterTitle] = {
        title: chapterTitle,
        order,
        sections: [],
      };
    }
    chapterBuckets[chapterTitle].sections.push({
      id: `s${i}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: section,
    });
  });

  return {
    chapters: Object.values(chapterBuckets).sort((a, b) => a.order - b.order),
  };
}

export const analyzeDocumentOutline = async (
  text: string,
): Promise<DocumentOutline> => {
  const prompt = `Analyze this research document and identify its ACTUAL chapter and section structure.
Return ONLY this JSON — no markdown, no extra text:
{
  "chapters": [
    {
      "title": "CHAPTER 1 — Introduction",
      "sections": [
        { "id": "ch1-intro", "label": "Introduction" },
        { "id": "ch1-background", "label": "Background of the Study" }
      ]
    }
  ]
}

Rules:
- ONLY include chapters and sections ACTUALLY PRESENT in this document
- Group sections into standard academic chapters (Introduction, Literature Review, Methodology, Results, Conclusions)
- Include diagrams and frameworks when detected (ERD, Use Case, Activity Diagram, Conceptual Framework, etc.)
- Use clear, concise section labels
- IDs must be lowercase and hyphenated
- EXCLUDE non-examinable front matter entirely — do not list Title Page, Dedication,
  Acknowledgement, Executive Summary, Table of Contents, List of Figures/Tables, or
  similar preliminary pages as sections. A defense panel does not examine these; only
  include substantive chapter content a panelist could actually ask questions about.

Document:
${text.substring(0, 40000)}`;

  try {
    const raw = await callServerAI(prompt, undefined, { fast: true, maxTokens: 1400 });
    const parsed = parseAIJson(raw);
    if (
      parsed?.chapters &&
      Array.isArray(parsed.chapters) &&
      parsed.chapters.length > 0
    ) {
      return parsed as DocumentOutline;
    }
    throw new Error("invalid");
  } catch {
    const sections = detectDocumentSections(text);
    return buildOutlineFromSections(sections);
  }
};

// ============================================================
// COVERAGE ENGINE — section detection, tracking, and adaptive flow
// ============================================================

export interface SectionCoverage {
  section: string;
  mastery: number;
  questionCount: number;
  covered: boolean;
}

export type CoverageMap = Record<string, SectionCoverage>;

const SECTION_PATTERNS: Array<{ patterns: string[]; label: string }> = [
  { patterns: ["abstract"], label: "Abstract" },
  { patterns: ["introduction"], label: "Introduction" },
  {
    patterns: ["problem statement", "statement of the problem"],
    label: "Problem Statement",
  },
  { patterns: ["objective", "research objective"], label: "Objectives" },
  { patterns: ["scope", "limitation"], label: "Scope and Limitations" },
  {
    patterns: [
      "review of related literature",
      "related literature",
      "related studies",
      "related works",
    ],
    label: "Review of Related Literature",
  },
  { patterns: ["conceptual framework"], label: "Conceptual Framework" },
  { patterns: ["theoretical framework"], label: "Theoretical Framework" },
  {
    patterns: ["methodology", "research design", "research method"],
    label: "Methodology",
  },
  {
    patterns: ["system architecture", "architecture"],
    label: "System Architecture",
  },
  {
    patterns: ["database design", "database schema"],
    label: "Database Design",
  },
  { patterns: ["entity relationship", " erd "], label: "ERD" },
  { patterns: ["use case"], label: "Use Case Diagram" },
  { patterns: ["activity diagram"], label: "Activity Diagram" },
  { patterns: ["sequence diagram"], label: "Sequence Diagram" },
  { patterns: ["testing", "test case", "user acceptance"], label: "Testing" },
  { patterns: ["results", "findings", "data analysis"], label: "Results" },
  { patterns: ["discussion"], label: "Discussion" },
  { patterns: ["conclusion"], label: "Conclusions" },
  { patterns: ["recommendation"], label: "Recommendations" },
];

export function detectDocumentSections(text: string): string[] {
  const lower = text.toLowerCase();
  const found = SECTION_PATTERNS.filter((s) =>
    s.patterns.some((p) => lower.includes(p)),
  ).map((s) => s.label);
  // Always include core sections if nothing detected
  if (found.length < 3) {
    ["Abstract", "Methodology", "Results", "Conclusions"].forEach((d) => {
      if (!found.includes(d)) found.push(d);
    });
  }
  return found;
}

export function initCoverageMap(sections: string[]): CoverageMap {
  const map: CoverageMap = {};
  sections.forEach((section) => {
    map[section] = { section, mastery: 0, questionCount: 0, covered: false };
  });
  return map;
}

// A selected section always gets at least this many questions before it can be
// marked "covered", even if the first answers score well — otherwise a focused
// single-section session could end after one good answer.
export const MIN_QUESTIONS_PER_SECTION = 3;

export function updateCoverage(
  map: CoverageMap,
  section: string,
  score: number,
  threshold: number,
): CoverageMap {
  const current = map[section];
  if (!current) return map;
  // Weighted average — new score counts 60%
  const newMastery =
    current.questionCount === 0
      ? score
      : Math.min(100, Math.round(current.mastery * 0.4 + score * 0.6));
  const newCount = current.questionCount + 1;
  return {
    ...map,
    [section]: {
      ...current,
      mastery: newMastery,
      questionCount: newCount,
      // Covered only once mastery clears the threshold AND the section has had
      // a fair number of questions. No upper cap — it stays open past the
      // minimum until mastery is actually reached.
      covered: newMastery >= threshold && newCount >= MIN_QUESTIONS_PER_SECTION,
    },
  };
}

export function getNextSection(
  map: CoverageMap,
  currentSection: string,
  lastScore: number,
  threshold: number,
): string | null {
  const current = map[currentSection];
  // Stay on the current section while the last answer was below threshold, or
  // until it has had its minimum number of questions. Only a passing score on a
  // section that has met the minimum moves the exam forward.
  if (current && (lastScore < threshold || current.questionCount < MIN_QUESTIONS_PER_SECTION)) {
    return currentSection;
  }
  // Find next uncovered section with fewest questions asked (breadth-first)
  // Include ALL uncovered sections — do NOT exclude currentSection so single-section
  // sessions can keep receiving questions on the same section instead of ending early.
  const uncovered = Object.values(map)
    .filter((s) => !s.covered)
    .sort((a, b) => a.questionCount - b.questionCount || a.mastery - b.mastery);

  // Prefer a different section if one exists; otherwise stay on the current one
  const other = uncovered.find((s) => s.section !== currentSection);
  if (other) return other.section;
  if (uncovered.length > 0) return uncovered[0].section; // only the current section remains uncovered
  return null; // all sections are covered → end the session
}

export const generateDynamicQuestion = async (
  abstract: string,
  panelists: Panelist[],
  difficulty: DifficultyLevel,
  coverageMap: CoverageMap,
  lastQuestion: string,
  lastAnswer: string,
  lastScore: number,
  targetSection: string,
  questionIndex: number,
  ragChunks: RagChunk[] = [],
  askedQuestions: string[] = [],
): Promise<PanelQuestion> => {
  // Pull the parts of the document that are actually about this section (plus
  // the thread of the current answer) instead of always feeding the first N
  // characters — otherwise, on a long paper, every question ends up drawn from
  // the introduction.
  // A gibberish / non-answer shouldn't steer which part of the paper we pull.
  const answerForQuery =
    lastAnswer && !isNonAnswer(lastAnswer) && !looksLikeGibberish(lastAnswer) ? lastAnswer : "";
  let docChunk: string;
  if (ragChunks.length > 0) {
    const query = `${targetSection} ${lastQuestion} ${answerForQuery}`.trim() || targetSection;
    const hits = retrieveRelevantChunksImproved(query, ragChunks, 6)
      .filter((c) => !looksLikeReferenceList(c.text));
    const usable = hits.length > 0 ? hits : ragChunks.filter((c) => !looksLikeReferenceList(c.text));
    const picked = (usable.length > 0 ? usable : ragChunks).slice(0, 4).map((c) => c.text).join("\n");
    // Drop individual lines that are clearly a reference-list entry, so a stray
    // citation inside an otherwise-relevant chunk can't become the question.
    docChunk = picked
      .split(/\n+/)
      .filter((line) => !looksLikeReferenceList(line) && !/^\s*\[\d+\]\s/.test(line))
      .join("\n")
      .substring(0, 1800);
    if (docChunk.trim().length < 60) docChunk = picked.substring(0, 1800);
  } else {
    docChunk = abstract.substring(0, 1800);
  }

  const pool = panelists.length > 0 ? panelists : PANELISTS;
  const panelist = pool[questionIndex % pool.length];
  const sectionData = coverageMap[targetSection];
  const sectionMastery = sectionData?.mastery ?? 0;
  const sectionQuestionCount = sectionData?.questionCount ?? 0;

  const adaptiveDifficulty =
    sectionMastery >= 75
      ? "Expert"
      : sectionMastery >= 50
        ? "Hard"
        : sectionMastery >= 25
          ? "Moderate"
          : "Easy";

  const coverageSummary = Object.values(coverageMap)
    .map((s) => `${s.section} ${s.mastery}%${s.covered ? " ✓" : ""}`)
    .join(" · ");

  const recentAsked = askedQuestions.slice(-24).map((q) => q.slice(0, 140));

  const hasPrevious = !!(lastQuestion && lastAnswer);
  const followUpCtx = !hasPrevious
    ? "FIRST QUESTION — begin with comprehension of the section."
    : lastScore < 50
      ? `WEAK ANSWER (${lastScore}/100) — probe for the missing or incorrect concept directly.`
      : lastScore < 70
        ? `PARTIAL ANSWER (${lastScore}/100) — ask for the missing elements or justification.`
        : `STRONG ANSWER (${lastScore}/100) — advance to a harder aspect or challenge an assumption.`;

  const panelistAngle = panelistAngleFor(panelist.role);

  const prompt = `You are ${panelist.name}, ${panelist.role} on a thesis-defense panel${panelist.specialization ? ` (${panelist.specialization})` : ""}.
Your role sets the ANGLE you scrutinise from and your tone — it does NOT choose the topic. ${panelistAngle}

SECTION UNDER EXAMINATION: "${targetSection}" — difficulty ${adaptiveDifficulty} (section mastery ${sectionMastery}/100, ${sectionQuestionCount} question(s) asked here so far).

DOCUMENT — the ONLY source of subject matter. Every question must be about a specific claim, method, result, term, number, or decision that is actually written below:
${docChunk}

${hasPrevious
  ? `LAST EXCHANGE:\nQ: ${lastQuestion.substring(0, 220)}\nA: ${lastAnswer.substring(0, 360)}\nScore ${lastScore}/100 — ${followUpCtx}`
  : followUpCtx}

SECTION PROGRESS: ${coverageSummary}
${recentAsked.length > 0 ? `\nQUESTIONS THE PANEL HAS ALREADY ASKED (you included) — choose a DIFFERENT aspect of the section, do not repeat or rephrase any of these:\n${recentAsked.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n` : ""}
RULES:
- The subject must come from what "${targetSection}" of the document above actually says. Put the exact phrase you are probing in source_excerpt.
- Do NOT ask about scalability, security, sampling, ROI, market fit, ethics, statistical power, or any topic your specialty suggests UNLESS the document itself raises it.
- Apply your angle to that document content: same facts from the paper, your kind of scrutiny.
- NEVER build a question from a citation, reference-list entry, publisher, place of publication, page numbers, DOI, or the year a cited work was published (e.g. "Mahwah, NJ: Lawrence Erlbaum, 2007" is bibliographic metadata, not a claim the student is defending). Probe the student's own argument, method, data, or design decision.
- Ask ONE question, specific enough that it would make no sense asked about any other paper.

Return ONLY this JSON:
{"question":"...","source_section":"${targetSection}","source_excerpt":"exact phrase from the document, max 100 chars","difficulty":"${adaptiveDifficulty}","question_type":"Clarification|Methodology Defense|Design Justification|Literature Validation|Limitation Analysis|Assumption Challenge|Data Integrity|Security|Scalability|Future Improvements","reason":"1 sentence","panelist_name":"${panelist.name}","expectedKeywords":["6-8 terms taken from the document for ${targetSection}"]}`;

  try {
    const raw = await callServerAI(prompt, SYSTEM_QUESTION, { fast: true, maxTokens: 450, timeoutMs: 15_000 });
    const parsed = parseAIJson(raw);
    if (!parsed.question) throw new Error("Missing question field");
    return {
      question: parsed.question,
      source_section: parsed.source_section || targetSection,
      source_excerpt: parsed.source_excerpt || "",
      difficulty: parsed.difficulty || adaptiveDifficulty,
      question_type: parsed.question_type || "Clarification",
      reason: parsed.reason || "",
      panelist,
      category: parsed.question_type || targetSection,
      expectedKeywords: Array.isArray(parsed.expectedKeywords)
        ? parsed.expectedKeywords
        : [],
    };
  } catch (err) {
    console.error(
      "[AI] generateDynamicQuestion failed, using contextual fallback:",
      err,
    );
    const phase = phaseForSection(targetSection);
    const fallback = getContextualFallbackQuestion(phase, panelist, abstract, askedQuestions, targetSection);
    return {
      question: fallback.question,
      source_section: targetSection,
      source_excerpt: abstract.substring(0, 80).trim(),
      difficulty: adaptiveDifficulty as any,
      question_type: "Clarification",
      reason: "Assessing understanding of this research section.",
      panelist,
      category: fallback.category,
      expectedKeywords: Array.isArray(fallback.expectedKeywords)
        ? fallback.expectedKeywords
        : [],
    };
  }
};

// Legacy fallback (used internally when dynamic generation fails completely)
function generateFallbackQuestions(
  abstract: string,
  panelists: Panelist[],
  _difficulty: DifficultyLevel,
): PanelQuestion[] {
  const phases = [
    SessionPhase.INTRODUCTION,
    SessionPhase.INTRODUCTION,
    SessionPhase.METHODOLOGY,
    SessionPhase.METHODOLOGY,
    SessionPhase.RESULTS,
    SessionPhase.RESULTS,
    SessionPhase.DEFENSE,
    SessionPhase.DEFENSE,
  ];
  const difficulties: Array<"Easy" | "Moderate" | "Hard" | "Expert"> = [
    "Easy",
    "Easy",
    "Moderate",
    "Moderate",
    "Hard",
    "Hard",
    "Expert",
    "Expert",
  ];
  const types = [
    "Clarification",
    "Literature Validation",
    "Methodology Defense",
    "Design Justification",
    "Assumption Challenge",
    "Data Integrity",
    "Limitation Analysis",
    "Future Improvements",
  ];
  const reasons = [
    "Verifying comprehension of the study's stated purpose.",
    "Testing awareness of related literature and research context.",
    "Assessing whether methodological choices can be defended.",
    "Evaluating the rationale behind key design decisions.",
    "Challenging the underlying assumptions of the research.",
    "Probing the integrity and accuracy of the collected data.",
    "Identifying the boundaries and critical limitations of the study.",
    "Exploring the potential for future research and improvement.",
  ];
  return phases.map((phase, i) => {
    const panelist = panelists[i % panelists.length];
    const fallback = getContextualFallbackQuestion(phase, panelist, abstract);
    return {
      question: fallback.question,
      source_section: phase,
      source_excerpt: abstract.substring(0, 100).trim(),
      difficulty: difficulties[i],
      question_type: types[i],
      reason: reasons[i],
      panelist,
      category: fallback.category,
      expectedKeywords: Array.isArray(fallback.expectedKeywords)
        ? fallback.expectedKeywords
        : [],
    };
  });
}

export const generateAllQuestions = async (
  abstract: string,
  panelists: Panelist[],
  difficulty: DifficultyLevel,
  ragChunks: RagChunk[] = [],
): Promise<PanelQuestion[]> => {
  if (!abstract.trim())
    return generateFallbackQuestions(abstract, panelists, difficulty);

  const documentText =
    ragChunks.length > 0 ? ragChunks.map((c) => c.text).join("\n\n") : abstract;
  const docChunk = documentText.substring(0, 3500);

  const panelistRoster = panelists
    .map(
      (p, i) =>
        `Panelist ${i + 1}: ${p.name} — ${p.role} (${p.specialization})`,
    )
    .join("\n");

  const difficultyNote =
    difficulty === "Beginner"
      ? "Calibrate all 4 questions for beginners: focus on comprehension and recall. Keep language accessible and tone encouraging."
      : difficulty === "Advanced"
        ? "Calibrate all 4 questions for experts: maximize adversarial pressure, attack assumptions, demand rigorous justification."
        : "Calibrate all 4 questions for standard academic defense: balance comprehension with critical analysis.";

  const prompt = `🎓 THESIS DEFENSE PANEL — ADVERSARIAL QUESTION GENERATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMINATION PANEL MEMBERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${panelistRoster}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIFFICULTY CALIBRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${difficultyNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESEARCH DOCUMENT (ALL questions must be grounded in this content only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${docChunk}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK: Generate EXACTLY 8 questions as a JSON array
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each object must follow this schema:
{
  "question": "...",
  "source_section": "Section where evidence was found (e.g. Abstract, Methodology, Results, Conclusion)",
  "source_excerpt": "Exact or paraphrased text from the document (max 120 chars)",
  "difficulty": "Easy|Moderate|Hard|Expert",
  "question_type": "Clarification|Methodology Defense|Design Justification|Literature Validation|Limitation Analysis|Assumption Challenge|Data Integrity|Security|Scalability|Future Improvements",
  "reason": "Why this question challenges the researcher (1 sentence)",
  "panelist_name": "Name of panelist asking this question",
  "expectedKeywords": ["specific", "terms", "from", "document"]
}

Panelist assignment — cycle through your panel for each question:
Q1: ${panelists[0]?.name} | Q2: ${panelists[1 % panelists.length]?.name} | Q3: ${panelists[2 % panelists.length]?.name} | Q4: ${panelists[3 % panelists.length]?.name}
Q5: ${panelists[0]?.name} | Q6: ${panelists[1 % panelists.length]?.name} | Q7: ${panelists[2 % panelists.length]?.name} | Q8: ${panelists[3 % panelists.length]?.name}

Difficulty assignment (strictly follow):
Q1 Easy | Q2 Easy | Q3 Moderate | Q4 Moderate | Q5 Hard | Q6 Hard | Q7 Expert | Q8 Expert

Return ONLY the JSON array — no markdown, no extra text.`;

  try {
    const raw = await callServerAI(prompt, SYSTEM_QUESTION, { fast: true, maxTokens: 1600 });
    const parsed = parseAIJson(raw);

    if (!Array.isArray(parsed) || parsed.length < 4) {
      throw new Error("AI returned invalid question array");
    }

    const difficulties: Array<"Easy" | "Moderate" | "Hard" | "Expert"> = [
      "Easy",
      "Easy",
      "Moderate",
      "Moderate",
      "Hard",
      "Hard",
      "Expert",
      "Expert",
    ];

    return parsed.slice(0, 8).map((q: any, i: number) => {
      if (!q.question)
        throw new Error(`Question ${i + 1} missing question text`);
      const panelist =
        panelists.find((p) => p.name === q.panelist_name) ??
        panelists[i % panelists.length];
      return {
        question: q.question,
        source_section: q.source_section || "Document",
        source_excerpt: q.source_excerpt || "",
        difficulty: difficulties[i],
        question_type: q.question_type || "Clarification",
        reason: q.reason || "",
        panelist,
        category: q.question_type || "General",
        expectedKeywords: Array.isArray(q.expectedKeywords)
          ? q.expectedKeywords
          : [],
      } as PanelQuestion;
    });
  } catch (err) {
    console.error(
      "[AI] generateAllQuestions failed, using contextual fallback:",
      err,
    );
    return generateFallbackQuestions(abstract, panelists, difficulty);
  }
};

// ============================================================
// DOMAIN DETECTION (Prompt 8)
// ============================================================

export type ResearchDomain =
  | 'software_development'
  | 'business'
  | 'tourism'
  | 'psychology'
  | 'healthcare'
  | 'education'
  | 'civil_engineering'
  | 'electrical_engineering'
  | 'communication'
  | 'default';

const DOMAIN_PATTERNS: Array<{ domain: ResearchDomain; keywords: RegExp }> = [
  {
    domain: 'software_development',
    keywords: /\b(software|algorithm|database|machine learning|artificial intelligence|mobile app|web app|iot|network|cybersecurity|programming|automation|api|system development|deep learning|neural network|computer vision|natural language processing|blockchain|cloud|devops)\b/i,
  },
  {
    domain: 'business',
    keywords: /\b(business|marketing|management|finance|accounting|entrepreneurship|supply chain|human resource|organizational|consumer behavior|market|revenue|profitability|strategy|competitive|e-commerce|brand)\b/i,
  },
  {
    domain: 'tourism',
    keywords: /\b(tourism|hospitality|hotel|travel|resort|ecotourism|guest|accommodation|destination|tourist|visitor|attraction|heritage|agritourism|heritage tourism)\b/i,
  },
  {
    domain: 'psychology',
    keywords: /\b(psychology|behavior|mental health|cognitive|emotion|therapy|counseling|anxiety|depression|personality|motivation|trauma|psychosocial|wellbeing|stress)\b/i,
  },
  {
    domain: 'healthcare',
    keywords: /\b(nursing|healthcare|medical|clinical|patient|medication|diagnosis|treatment|hospital|nursing|health promotion|disease|prevention|epidemiology|public health|pharmaceutical|wound)\b/i,
  },
  {
    domain: 'education',
    keywords: /\b(education|teaching|learning|curriculum|pedagogy|classroom|student performance|academic achievement|instructional|e-learning|blended learning|assessment|teacher|higher education)\b/i,
  },
  {
    domain: 'civil_engineering',
    keywords: /\b(civil engineering|structural|construction|infrastructure|bridge|road|concrete|geotechnical|soil|foundation|drainage|pavement|building|reinforced|earthquake|seismic)\b/i,
  },
  {
    domain: 'electrical_engineering',
    keywords: /\b(electrical|electronics|circuit|power|microcontroller|embedded|sensor|renewable energy|solar|automation|plc|iot|signal|voltage|current|pcb|microprocessor)\b/i,
  },
  {
    domain: 'communication',
    keywords: /\b(communication|media|journalism|broadcasting|social media|public relations|digital media|content|audience|framing|narrative|advertising|mass media|radio|television|film)\b/i,
  },
];

export function detectResearchDomain(abstract: string): ResearchDomain {
  const scores: Record<ResearchDomain, number> = {} as any;
  for (const { domain, keywords } of DOMAIN_PATTERNS) {
    const matches = abstract.match(new RegExp(keywords.source, 'gi')) || [];
    scores[domain] = matches.length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return 'default';
  return best[0] as ResearchDomain;
}

// ============================================================
// IMPROVED RAG — keyword-based BM25-style retrieval (Prompt 9)
// ============================================================

function tokenizeForSearch(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
}

// A chunk that is mostly a bibliography / works-cited list — publisher names,
// "et al.", page ranges, DOIs, year-in-parens citations. Questions must never
// be built from these (e.g. "You base your Objectives on 'Mahwah, NJ: Lawrence
// Erlbaum, 2007'" — a publisher location is not a claim).
export function looksLikeReferenceList(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (t.length < 40) return false;
  let hits = 0;
  if (/\bet al\.?/.test(t)) hits++;
  if (/\bpp?\.\s*\d+/.test(t) || /\bvol\.\s*\d+/.test(t) || /\bno\.\s*\d+/.test(t)) hits++;
  if (/\bdoi:|https?:\/\/(dx\.)?doi\.org/.test(t)) hits++;
  if (/\b(lawrence erlbaum|springer|elsevier|routledge|sage publications|ieee|acm|wiley|mcgraw-hill|prentice hall|o'reilly|mit press)\b/.test(t)) hits++;
  if (/\b(mahwah|hoboken|thousand oaks|new york|london|berlin)\s*,\s*(nj|ny|ca|usa|uk)\b/.test(t)) hits++;
  // many "Name, A. (2007)." style citation openers
  const citeOpeners = (t.match(/[a-z]+,\s+[a-z]\.\s*(?:[a-z]\.\s*)?\(?\d{4}\)?/g) || []).length;
  if (citeOpeners >= 2) hits += 2;
  const years = (t.match(/\b(19|20)\d{2}\b/g) || []).length;
  if (years >= 4 && t.length < 1400) hits++;
  return hits >= 2;
}

export const retrieveRelevantChunksImproved = (
  query: string,
  chunks: RagChunk[],
  topK = 5,
): RagChunk[] => {
  if (chunks.length === 0) return [];
  const queryTerms = new Set(tokenizeForSearch(query));
  const stopSet = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but', 'its', 'our', 'can', 'will', 'also', 'been', 'all', 'more', 'than']);
  const filteredTerms = [...queryTerms].filter(t => !stopSet.has(t));

  const scored = chunks.map(chunk => {
    const chunkText = chunk.text.toLowerCase();
    const chunkWords = tokenizeForSearch(chunk.text);
    const chunkWordCount = Math.max(chunkWords.length, 1);

    let score = 0;
    for (const term of filteredTerms) {
      // BM25-inspired: count occurrences with length normalization
      const termCount = (chunkText.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
      const tf = termCount / chunkWordCount;
      const idf = Math.log(chunks.length / (1 + chunks.filter(c => c.text.toLowerCase().includes(term)).length));
      score += tf * Math.max(idf, 0.1);
    }
    return { chunk, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.chunk);
};

// ============================================================
// AI SESSION EVALUATION REPORT (Prompt 4)
// ============================================================

export interface SessionEvalReport {
  verdict: string;
  overallReadiness: string;
  strengths: string[];
  areasForImprovement: string[];
  sectionBreakdown: Array<{ section: string; score: number; observations: string }>;
  recommendations: string[];
  keyConceptsCovered: string[];
  keyConceptsMissed: string[];
}

export const generateSessionEvalReport = async (
  abstract: string,
  history: Array<{ question: string; answer: string; category: string; feedback: { score: number } }>,
  overallScore: number,
): Promise<SessionEvalReport> => {
  if (history.length === 0) {
    return {
      verdict: 'No questions answered',
      overallReadiness: 'Session contained no answered questions.',
      strengths: [],
      areasForImprovement: ['Complete at least one question to receive an evaluation.'],
      sectionBreakdown: [],
      recommendations: ['Practice answering questions about each section of your research.'],
      keyConceptsCovered: [],
      keyConceptsMissed: [],
    };
  }

  const transcript = history.map((h, i) =>
    `Q${i + 1} [${h.category}] (Score: ${h.feedback.score}/100):\nQ: ${h.question.substring(0, 200)}\nA: ${h.answer.substring(0, 400)}`
  ).join('\n\n');

  const prompt = `You are an academic defense evaluation expert. Analyze this complete defense session and produce a comprehensive evaluation report.

RESEARCH ABSTRACT:
${abstract.substring(0, 600)}

DEFENSE SESSION TRANSCRIPT (${history.length} questions, Overall Score: ${overallScore}/100):
${transcript.substring(0, 3500)}

Return ONLY this JSON (no markdown, no extra text):
{
  "verdict": "PASSED / CONDITIONAL PASS / FAILED — one line verdict with score context",
  "overallReadiness": "2-3 sentence overall assessment of the candidate's readiness for the actual defense",
  "strengths": ["3-5 specific strengths observed across the session with reference to actual answers"],
  "areasForImprovement": ["3-5 specific areas that need improvement with reference to actual weaknesses"],
  "sectionBreakdown": [
    {
      "section": "category name from the transcript",
      "score": average score for questions in this category (0-100),
      "observations": "1-2 sentence specific observation about performance in this section"
    }
  ],
  "recommendations": ["4-6 specific, actionable recommendations for improving defense readiness"],
  "keyConceptsCovered": ["concepts the candidate demonstrated understanding of"],
  "keyConceptsMissed": ["important concepts that should have appeared but were missing or poorly explained"]
}`;

  try {
    const raw = await callServerAI(prompt, undefined, { fast: true, maxTokens: 1600 });
    return parseAIJson(raw) as SessionEvalReport;
  } catch {
    // Fallback: local summary
    const catScores: Record<string, { total: number; count: number }> = {};
    for (const h of history) {
      if (!catScores[h.category]) catScores[h.category] = { total: 0, count: 0 };
      catScores[h.category].total += h.feedback.score;
      catScores[h.category].count += 1;
    }
    const weak = Object.entries(catScores).sort((a, b) => (a[1].total / a[1].count) - (b[1].total / b[1].count));
    const strong = [...weak].reverse();
    return {
      verdict: overallScore >= 80 ? 'PASSED' : overallScore >= 65 ? 'CONDITIONAL PASS' : 'FAILED',
      overallReadiness: `Your overall score of ${overallScore}/100 suggests ${overallScore >= 75 ? 'good' : 'moderate'} readiness for the actual defense. Focus on the weaker sections to improve.`,
      strengths: strong.slice(0, 2).map(([cat]) => `Demonstrated competency in ${cat}`),
      areasForImprovement: weak.slice(0, 2).map(([cat]) => `Needs improvement in ${cat}`),
      sectionBreakdown: Object.entries(catScores).map(([section, { total, count }]) => ({
        section,
        score: Math.round(total / count),
        observations: `Average score: ${Math.round(total / count)}/100 across ${count} question(s).`,
      })),
      recommendations: [
        'Review your weakest sections and practice articulating answers more specifically.',
        'Use research-specific terminology consistently.',
        'Support claims with data from your actual study.',
      ],
      keyConceptsCovered: extractAbstractTerms(abstract).slice(0, 4),
      keyConceptsMissed: [],
    };
  }
};

// ============================================================
// IMPROVED EVALUATION WITH HISTORY CONTEXT (Prompt 5)
// ============================================================

export const evaluateResponseDetailed = async (
  question: string,
  answer: string,
  abstract: string,
  responseTimeMs = 0,
  expectedKeywords: string[] = [],
  historyContext?: Array<{ question: string; answer: string; score: number }>,
): Promise<RubricEvaluation> => {
  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  const strongFillers = (answer.match(/\b(uh|um|erm)\b/gi) || []).length;
  const weakFillers = (
    answer.match(
      /\b(like|maybe|i think|i guess|perhaps|sort of|kind of|basically|i believe|not sure)\b/gi,
    ) || []
  ).length;
  const totalFillers = strongFillers + weakFillers;

  try {
    const confidenceScore = Math.max(
      28,
      Math.min(100, 90 - strongFillers * 12 - weakFillers * 6),
    );
    const verdict = `${
      totalFillers === 0
        ? "No hesitation markers detected — full composure score."
        : `${totalFillers} hesitation marker(s) detected: ${strongFillers} strong (uh/um/erm, −12 each) + ${weakFillers} weak hedge(s) (I think/maybe/sort of/kind of, −6 each). Composure score: ${confidenceScore}/100.`
    }`;

    const historySnippet =
      historyContext && historyContext.length > 0
        ? `\n═══════════════════════════════════════════\nPRIOR SESSION CONTEXT (last ${Math.min(historyContext.length, 3)} exchanges)\n═══════════════════════════════════════════\n${historyContext
            .slice(-3)
            .map(
              (h, i) =>
                `Prior Q${i + 1} (score ${h.score}/100): ${h.question.substring(0, 150)}\nPrior A${i + 1}: ${h.answer.substring(0, 200)}`,
            )
            .join('\n\n')}\n\nConsistency check: Flag if the current answer contradicts or repeats prior answers without adding new information.`
        : '';

    const prompt = `🔬 VIRTUAL VIVA VOCE DEFENSE — LLM-AS-JUDGE EVALUATION ENGINE

═══════════════════════════════════════════
EXAMINATION RECORD
═══════════════════════════════════════════
Question: ${question.substring(0, 300)}

Candidate's Response: ${answer.substring(0, 700)}

Response Metadata:
- Word count: ${wordCount}
- Strong hesitation markers (uh/um/erm): ${strongFillers}
- Weak hedging markers (I think/maybe/sort of/kind of/I'm not sure): ${weakFillers}
- Total composure deductions: ${strongFillers} × 12 + ${weakFillers} × 6 = ${strongFillers * 12 + weakFillers * 6} pts
- Pre-calculated composure score: ${confidenceScore}/100
- Response time: ${responseTimeMs}ms

Research Abstract: ${abstract.substring(0, 300)}
Expected Knowledge Markers: ${expectedKeywords.slice(0, 10).join(", ")}${historySnippet}

═══════════════════════════════════════════
LLM-AS-JUDGE RUBRIC
═══════════════════════════════════════════
| Rubric Dimension | Judge Dimension           | Weight | Scoring Guide |
|-----------------|---------------------------|--------|---------------|
| accuracy        | Domain Knowledge          |  35%   | Does the candidate know their research? CRITICAL: If the answer is random text, keyboard mashing, gibberish, nonsense words, or completely unrelated to the question → accuracy = 3, completeness = 3. Off-topic or vague but coherent = below 40. Correct and specific = 70–100. |
| completeness    | Clarity of Argument (Coverage) | 25% | Were all aspects of the question addressed? Is there depth with supporting evidence? No real content = 3. |
| clarity         | Clarity of Argument (Expression) | 20% | Is the answer organized, logically structured, academically expressed? |
| confidence      | Composure                 |  20%   | PRE-CALCULATED = ${confidenceScore}. Use this exact value. |

VERDICT DETERMINATION (include in feedback):
- finalScore ≥ 80 AND accuracy ≥ 75 → "✅ Correct"
- finalScore 60–79 OR accuracy 50–74 → "⚠️ Partially Correct"
- finalScore < 60 OR accuracy < 50 → "❌ Insufficient"

═══════════════════════════════════════════
JUDGE OUTPUT — Return ONLY this JSON:
═══════════════════════════════════════════
{
  "accuracy": number (0-100, Domain Knowledge — content correctness and research relevance),
  "completeness": number (0-100, Clarity of Argument coverage — depth and completeness of answer),
  "clarity": number (0-100, Clarity of Argument expression — organization and academic language),
  "confidence": ${confidenceScore},
  "explanations": {
    "accuracy": "Cite 1-2 specific phrases from the candidate's actual response. Explain what demonstrated correct domain knowledge and what was missing, incorrect, or off-topic.",
    "completeness": "Identify which aspects of the question were addressed (with reference to actual content) and which critical aspects were omitted.",
    "clarity": "Comment on the structural quality of the argument — sentence construction, logical flow, use of transitions, and academic register.",
    "confidence": "${verdict}"
  },
  "finalScore": number (MUST equal accuracy×0.35 + completeness×0.25 + clarity×0.20 + ${confidenceScore}×0.20, rounded to nearest integer),
  "feedback": "2-3 sentences. Open with the verdict (✅ Correct / ⚠️ Partially Correct / ❌ Insufficient). Be encouraging but academically honest. Reference specific things the candidate said.",
  "strengths": [
    "Specific praise that quotes or closely references actual phrasing from the candidate's response"
  ],
  "improvements": [
    "Specific, actionable revision — describe what should have been said AND provide an example of better academic phrasing"
  ],
  "suggestedAnswer": "4-5 sentence model answer that a top-performing thesis candidate would give for this exact question, grounded in the research abstract",
  "confidenceMetrics": {
    "hesitationFillers": ${totalFillers},
    "vagueLanguageScore": ${Math.min(100, weakFillers * 14 + strongFillers * 20)},
    "concisenessScore": number (0-100, rate how concise and direct the response was)
  }
}`;

    const raw = await callServerAI(prompt, SYSTEM_EVALUATOR, { fast: true, maxTokens: 900, timeoutMs: 20_000 });
    const parsed = parseAIJson(raw);

    // Hard clamp: keyboard-mashing, "I don't know", help requests, and answers
    // that never engage the question / the research can never earn points.
    if (
      isNonAnswer(answer) ||
      looksLikeGibberish(answer) ||
      looksOffTopic(answer, question, abstract)
    ) {
      return localEvaluate(
        question,
        answer,
        expectedKeywords.length > 0 ? expectedKeywords : extractAbstractTerms(abstract),
        responseTimeMs,
      );
    }

    // Enforce correct finalScore calculation regardless of what AI returned
    const recalculated = Math.round(
      (parsed.accuracy ?? 0) * 0.35 +
        (parsed.completeness ?? 0) * 0.25 +
        (parsed.clarity ?? 0) * 0.2 +
        (parsed.confidence ?? 0) * 0.2,
    );
    parsed.finalScore = recalculated;

    return parsed;
  } catch (err) {
    console.error(
      "[AI] evaluateResponseDetailed failed, using local fallback:",
      err,
    );
    const kw =
      expectedKeywords.length > 0
        ? expectedKeywords
        : extractAbstractTerms(abstract);
    return localEvaluate(question, answer, kw, responseTimeMs);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SATISFACTION EVALUATOR — drives the conversational follow-up system
// ─────────────────────────────────────────────────────────────────────────────

export interface SatisfactionResult {
  satisfaction_score: number;
  verdict: 'satisfied' | 'needs_followup' | 'evasive';
  gaps: string[];
  followup_question: string | null;
  panelist_remark: string;
}

const SAT_THRESHOLD = 65;

const STOP = new Set([
  "the","a","an","is","are","was","were","this","that","these","those","which","with","for",
  "and","or","but","not","in","on","at","to","of","has","have","been","by","as","its","be",
  "their","they","from","into","will","can","may","also","more","than","such","about","after",
  "before","between","each","both","all","some","any","when","where","while","study","research",
  "paper","work","using","used","based","system","data","results","findings","analysis","approach",
  "method","methods","our","we","it","because","therefore","however","would","should","could",
  "does","did","how","what","why","who","your","you",
]);

// How much of the answer's substantive vocabulary actually appears in the
// student's own document. Low overlap = the answer is not grounded in the file.
function documentGrounding(answer: string, sourceText: string): number {
  const src = (sourceText || "").toLowerCase();
  if (!src) return 0.5; // no document to check against — stay neutral
  const terms = [
    ...new Set(
      (answer.toLowerCase().match(/\b[a-z][a-z-]{3,}\b/g) || []).filter((w) => !STOP.has(w)),
    ),
  ];
  if (terms.length === 0) return 0;
  const hits = terms.filter((t) => src.includes(t.slice(0, 6))).length;
  return hits / terms.length;
}

// A firm, varying follow-up that simply restates the question the student
// dodged — more useful (and less repetitive) than a generic "go deeper".
function restateFollowup(rootQuestion: string, attempt = 0): string {
  const q = rootQuestion.replace(/\s+/g, " ").trim().slice(0, 220);
  const lead = [
    "That doesn't answer the question. Let me put it plainly:",
    "You still haven't addressed it. Once more:",
    "I need a direct answer to this:",
    "We're not moving on until this is answered:",
    "Let's try again — answer this directly:",
  ];
  return `${lead[Math.min(attempt, lead.length - 1)]} ${q}`;
}

// Offline / parse-failure satisfaction scorer. Rejects non-substantive answers
// outright, and marks down answers that are not grounded in the document.
function localSatisfaction(
  rootQuestion: string,
  latestAnswer: string,
  sourceText = "",
  followUpCount = 0,
): SatisfactionResult {
  if (
    looksLikeGibberish(latestAnswer) ||
    isNonAnswer(latestAnswer) ||
    looksOffTopic(latestAnswer, rootQuestion, sourceText)
  ) {
    return {
      satisfaction_score: 5,
      verdict: "evasive",
      gaps: ["The answer does not address the question at all."],
      followup_question: restateFollowup(rootQuestion, followUpCount),
      panelist_remark: "That is not an answer to what I asked.",
    };
  }
  const words = latestAnswer.trim().split(/\s+/).filter(Boolean);
  const qWords = rootQuestion.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const lc = latestAnswer.toLowerCase();
  const qOverlap = qWords.length
    ? qWords.filter((w) => lc.includes(w)).length / qWords.length
    : 0;
  const grounding = documentGrounding(latestAnswer, sourceText);
  const hasSpecifics =
    /\b\d/.test(latestAnswer) ||
    /for example|such as|because|method|methodology|data|result|finding|survey|respondent|sample|analysis|framework|model|algorithm|classifier|accuracy|evaluat/i.test(latestAnswer);
  const hasConnectives =
    /\b(therefore|because|however|thus|consequently|specifically|in particular|as a result|for instance)\b/i.test(latestAnswer);

  // On-topic signal: does the answer engage with the question / the paper?
  const relevance = Math.max(qOverlap, grounding);

  let score =
    14 +
    Math.min(words.length, 90) * 0.30 +
    qOverlap * 22 +
    grounding * 24 +
    (hasSpecifics ? 12 : 0) +
    (hasConnectives ? 5 : 0) +
    (words.length >= 40 ? 6 : 0);

  // Relevance gates — an answer that doesn't engage the question at all can't
  // score as "partial". These stay strict; the grounding caps below are gentle.
  if (relevance < 0.08) score = Math.min(score, 14);
  else if (relevance < 0.16) score = Math.min(score, 34);
  else if (grounding < 0.12) score = Math.min(score, 52);
  else if (grounding < 0.24) score = Math.min(score, 66);

  score = Math.round(Math.max(4, Math.min(95, score)));
  const satisfied = score >= SAT_THRESHOLD;
  const weak = grounding < 0.28;
  const fu = [
    weak
      ? "Tie that to your own study. What does your document actually report on this point?"
      : "Give a specific finding or example from your research that supports that.",
    weak
      ? "That's still not grounded in your paper. Point me to the part of your study that backs it."
      : "Be concrete — cite a number, a method, or a result from your work.",
    "You're circling it. State the direct answer in one or two sentences, using your findings.",
  ];
  return {
    satisfaction_score: score,
    verdict: satisfied ? "satisfied" : score < 20 ? "evasive" : "needs_followup",
    gaps: satisfied
      ? []
      : weak
        ? ["The answer is not clearly grounded in your document."]
        : ["The answer needs specifics from your research."],
    followup_question: satisfied ? null : fu[Math.min(followUpCount, fu.length - 1)],
    panelist_remark: satisfied
      ? "Alright, that addresses it."
      : "I need more detail from you on that, tied to your research.",
  };
}

export const evaluateSatisfaction = async (
  rootQuestion: string,
  threadHistory: Array<{ question: string; answer: string; isFollowUp: boolean }>,
  latestAnswer: string,
  abstract: string,
  panelist: Panelist,
  followUpCount: number,
  consecutiveEvasiveCount: number,
): Promise<SatisfactionResult> => {
  const MAX_FOLLOWUPS = 3;
  // Close the thread once the follow-up cap is hit, OR after the student has
  // been evasive / non-responsive twice already (this answer would be the
  // 3rd) — no point looping the same question forever.
  const forceClose = followUpCount >= MAX_FOLLOWUPS || consecutiveEvasiveCount >= 2;
  const badAnswer =
    looksLikeGibberish(latestAnswer) ||
    isNonAnswer(latestAnswer) ||
    looksOffTopic(latestAnswer, rootQuestion, abstract);

  const threadBlock = threadHistory.length > 0
    ? threadHistory
        .map((e, i) => `[${e.isFollowUp ? `Follow-up ${i}` : 'Root Q'}] ${e.question}\n[Student] ${e.answer.substring(0, 300)}`)
        .join('\n\n')
    : '(No prior exchanges — this is the first answer.)';

  const evasiveInstruction = consecutiveEvasiveCount >= 2
    ? `IMPORTANT: The student has been evasive ${consecutiveEvasiveCount} times in a row. If their latest answer is also evasive or off-topic, set verdict to "evasive" and generate a follow-up that firmly but politely rephrases the root question: "That's not quite what I asked. Let me rephrase: ${rootQuestion.substring(0, 200)}"`
    : '';

  const forceCloseInstruction = forceClose
    ? `IMPORTANT: The maximum number of follow-ups (${MAX_FOLLOWUPS}) has been reached. You MUST set verdict to "satisfied", set followup_question to null, and give a closing neutral remark like "Let's set that aside for now — I'd encourage you to strengthen that section before your actual defense."`
    : '';

  const prompt = `You are ${panelist.name}, a thesis defense panelist with this persona: "${panelist.persona}"

ROOT QUESTION ASKED:
"${rootQuestion.substring(0, 400)}"

FULL CONVERSATION THREAD SO FAR:
${threadBlock}

STUDENT'S LATEST ANSWER:
"${latestAnswer.substring(0, 600)}"

RESEARCH ABSTRACT CONTEXT:
${abstract.substring(0, 350)}

FOLLOW-UPS USED SO FAR: ${followUpCount} / ${MAX_FOLLOWUPS} maximum
${forceCloseInstruction}
${evasiveInstruction}

SATISFACTION SCORING GUIDE:
- 85–100: Answer is specific, grounded in research, fully addresses the question with evidence
- 70–84: Mostly satisfactory — minor clarification needed
- 50–69: Partially addresses the question — significant gap remains
- 0–49: Vague, evasive, off-topic, or misses the core of the question

FOLLOW-UP RULES (if verdict is needs_followup or evasive):
- If the student engaged with the topic: quote or paraphrase something they
  actually said, and push on the single most critical gap.
- If the answer was evasive, off-topic, a help/support request, or "I don't
  know": do NOT invent something they said. Firmly restate the ROOT QUESTION
  in plainer words, e.g. "That doesn't answer it. Directly: <root question>".
- One question, 1–2 sentences, in ${panelist.name}'s voice.

SCORING GUARDS:
- An answer that does not engage the question or the research is 0–15, verdict "evasive".
- An answer with no specifics grounded in the student's own study cannot exceed ~55.

Return ONLY valid JSON — no markdown, no explanation:
{
  "satisfaction_score": <integer 0-100>,
  "verdict": <"satisfied" | "needs_followup" | "evasive">,
  "gaps": [<up to 3 strings: specific things the answer failed to address>],
  "followup_question": <string | null>,
  "panelist_remark": <string: short natural 1–2 sentence reaction matching ${panelist.name}'s persona, e.g. "I see what you're saying, but you haven't addressed the validation side." Use first person.>
}`;

  try {
    const raw = await callServerAI(prompt, SYSTEM_EVALUATOR, { fast: true, maxTokens: 420, timeoutMs: 22_000 });
    const parsed = parseAIJson(raw) as SatisfactionResult;

    // Enforce force-close regardless of what AI returned
    if (forceClose) {
      parsed.verdict = 'satisfied';
      parsed.followup_question = null;
      if (!parsed.panelist_remark) {
        parsed.panelist_remark = "Let's move on. I'd encourage you to strengthen that section before your actual defense.";
      }
    }

    // Clamp score
    parsed.satisfaction_score = Math.min(100, Math.max(0, Math.round(parsed.satisfaction_score ?? 50)));

    // Hard floor: key-mashing, "I don't know", help requests, and answers that
    // never touch the question or the research are never "partial".
    if (badAnswer) {
      parsed.satisfaction_score = Math.min(parsed.satisfaction_score, 8);
      parsed.verdict = 'evasive';
      parsed.gaps = ["The answer does not address the question."];
      if (!forceClose) {
        parsed.followup_question = restateFollowup(rootQuestion, followUpCount);
      }
    }

    // Document-grounding clamp: only bite when the answer barely touches the
    // paper at all. A solid answer that discusses the study's framework or
    // rationale in its own words should not be capped into follow-up hell.
    if (!forceClose && !badAnswer && abstract && abstract.trim().length > 40) {
      const grounding = documentGrounding(latestAnswer, abstract);
      if (grounding < 0.1) {
        parsed.satisfaction_score = Math.min(parsed.satisfaction_score, 40);
        if (parsed.verdict === 'satisfied') parsed.verdict = 'needs_followup';
        if (!parsed.followup_question) {
          parsed.followup_question =
            "Tie that to your own study — what does your document actually report on this?";
        }
        if (!parsed.gaps || parsed.gaps.length === 0) {
          parsed.gaps = ["The answer is not clearly grounded in your document."];
        }
      } else if (grounding < 0.22) {
        parsed.satisfaction_score = Math.min(parsed.satisfaction_score, 66);
        if (parsed.verdict === 'satisfied' && parsed.satisfaction_score < SAT_THRESHOLD) {
          parsed.verdict = 'needs_followup';
        }
      }
    }

    // Ensure verdict matches score if AI was inconsistent
    if (!forceClose && parsed.satisfaction_score >= SAT_THRESHOLD && parsed.verdict !== 'satisfied') {
      parsed.verdict = 'satisfied';
      parsed.followup_question = null;
    }
    if (!forceClose && parsed.satisfaction_score < SAT_THRESHOLD && parsed.verdict === 'satisfied') {
      parsed.verdict = 'needs_followup';
    }

    return parsed;
  } catch {
    const local = localSatisfaction(rootQuestion, latestAnswer, abstract, followUpCount);
    if (forceClose) {
      return {
        ...local,
        verdict: local.satisfaction_score >= SAT_THRESHOLD ? 'satisfied' : 'evasive',
        followup_question: null,
        panelist_remark:
          "Let's move on — strengthen this part of your study before your actual defense.",
      };
    }
    return local;
  }
};
