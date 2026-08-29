
// ============================================================
// VOICE SERVICE — TTS + STT for Virtual Defense Panel
// ============================================================

export interface PanelistVoiceConfig {
  pitch: number;
  rate: number;
  lang: string;
  preferredVoiceNames: string[];
}

export const PANELIST_VOICE_CONFIGS: Record<string, PanelistVoiceConfig> = {
  'Technical Architect': {
    pitch: 0.85, rate: 0.93, lang: 'en-US',
    preferredVoiceNames: ['Daniel', 'Google UK English Male', 'Alex', 'Microsoft David'],
  },
  'Technical Expert': {
    pitch: 0.85, rate: 0.93, lang: 'en-US',
    preferredVoiceNames: ['Daniel', 'Google UK English Male', 'Alex', 'Microsoft David'],
  },
  'Research Methodologist': {
    pitch: 1.08, rate: 0.82, lang: 'en-US',
    preferredVoiceNames: ['Samantha', 'Google UK English Female', 'Karen', 'Microsoft Zira'],
  },
  'Methodology Specialist': {
    pitch: 1.08, rate: 0.82, lang: 'en-US',
    preferredVoiceNames: ['Samantha', 'Google UK English Female', 'Karen', 'Microsoft Zira'],
  },
  'Adversarial Examiner': {
    pitch: 0.88, rate: 0.88, lang: 'en-US',
    preferredVoiceNames: ['Fred', 'Tom', 'Google US English', 'Microsoft Mark'],
  },
  'Ethics & Impact Reviewer': {
    pitch: 0.88, rate: 0.88, lang: 'en-US',
    preferredVoiceNames: ['Fred', 'Tom', 'Google US English', 'Microsoft Mark'],
  },
  'Industry Practitioner': {
    pitch: 1.0, rate: 1.02, lang: 'en-US',
    preferredVoiceNames: ['Moira', 'Google Australian English', 'Victoria', 'Microsoft Hazel'],
  },
};

// Title prefix → gender mapping for panelist name-based voice selection
const FEMALE_VOICE_NAMES = [
  'Samantha', 'Karen', 'Victoria', 'Moira', 'Fiona',
  'Google UK English Female', 'Microsoft Zira', 'Microsoft Hazel',
];
const MALE_VOICE_NAMES = [
  'Daniel', 'Alex', 'Fred', 'Tom', 'Lee',
  'Google UK English Male', 'Google US English', 'Microsoft David', 'Microsoft Mark',
];

function inferGenderFromTitle(name: string): 'male' | 'female' | 'neutral' {
  const prefix = name.split(/[\s.]/)[0].toLowerCase().replace(/\./g, '');
  if (prefix === 'ms' || prefix === 'mrs') return 'female';
  if (prefix === 'mr') return 'male';
  return 'neutral';
}

function selectVoiceFrom(
  voices: SpeechSynthesisVoice[],
  role: string,
  panelistName?: string,
): SpeechSynthesisVoice | null {
  const config = PANELIST_VOICE_CONFIGS[role] ?? PANELIST_VOICE_CONFIGS['Technical Architect'];
  if (!voices.length) return null;

  const gender = panelistName ? inferGenderFromTitle(panelistName) : 'neutral';

  // Every match below is restricted to English voices (v.lang startsWith 'en') so a
  // same-named or first-in-list voice from another installed language pack (e.g. a
  // Windows machine with only Spanish TTS voices available) can never get assigned —
  // that mismatch was causing panelists to randomly switch to Spanish mid-session.
  if (gender !== 'neutral') {
    const genderNames = gender === 'female' ? FEMALE_VOICE_NAMES : MALE_VOICE_NAMES;
    for (const name of genderNames) {
      const match = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes(name.toLowerCase()));
      if (match) return match;
    }
  }

  for (const name of config.preferredVoiceNames) {
    const match = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
  }

  return (
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  );
}

// Every speak/stop bumps this. In-flight async callbacks (voice loading, the
// post-cancel delay, chunk chaining) check their captured value against the
// live one and bail if superseded — this is what makes speech survive React
// StrictMode's mount/unmount/mount double-invoke instead of being silently
// cancelled before it ever starts.
let speakGeneration = 0;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let activeFinish: (() => void) | null = null;

function clearKeepAlive() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

/**
 * Call once from inside a user-gesture handler (e.g. the "Begin Defense"
 * click). Satisfies the browser autoplay/user-activation policy so the first
 * real question is allowed to speak, and kicks off async voice-list loading.
 */
export function primeSpeechSynthesis(): void {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);   // silent, finishes in ~1 frame — just unlocks the engine
    window.speechSynthesis.getVoices();
  } catch { /* ignore */ }
}

// Chrome silently truncates any single utterance longer than ~15 seconds.
// Splitting on sentence boundaries keeps every utterance well under that.
function chunkForSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean ? [clean] : [];
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)|\S[^.!?]*$/g) ?? [clean];
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    const next = (buf ? buf + ' ' : '') + s.trim();
    if (next.length > 160 && buf) { chunks.push(buf.trim()); buf = s.trim(); }
    else { buf = next; }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function getVoicesReady(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) { resolve(existing); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    // Fallback: on some platforms `voiceschanged` never fires — speak anyway
    // with whatever getVoices() returns (possibly []; the OS default is used).
    setTimeout(finish, timeoutMs);
  });
}

export function speakText(
  text: string,
  role: string,
  options: {
    rate?: number;
    volume?: number;
    onStart?: () => void;
    onEnd?: () => void;
    panelistName?: string;
  } = {},
): void {
  if (!('speechSynthesis' in window) || !text.trim()) { options.onEnd?.(); return; }

  const synth = window.speechSynthesis;
  const myGen = ++speakGeneration;
  synth.cancel();
  clearKeepAlive();

  const config = PANELIST_VOICE_CONFIGS[role] ?? { pitch: 1, rate: 1, lang: 'en-US', preferredVoiceNames: [] };
  const chunks = chunkForSpeech(text);
  let idx = 0;
  let started = false;
  let finished = false;

  // Watchdog: guarantee onEnd fires even if the engine dies mid-utterance,
  // so voice mode never gets stuck waiting to hand off to the microphone.
  const watchdog = setTimeout(() => finishAll(), Math.min(90_000, 4_000 + text.length * 90));

  function finishAll() {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    clearKeepAlive();
    if (activeFinish === finishAll) activeFinish = null;
    options.onEnd?.();
  }
  activeFinish = finishAll;

  function speakChunk(voice: SpeechSynthesisVoice | null) {
    if (myGen !== speakGeneration) return;          // superseded by a newer call
    if (idx >= chunks.length) { finishAll(); return; }
    const u = new SpeechSynthesisUtterance(chunks[idx]);
    u.pitch  = config.pitch;
    u.rate   = (options.rate ?? 1.0) * config.rate;
    u.volume = options.volume ?? 1.0;
    u.lang   = config.lang;
    if (voice) u.voice = voice;
    u.onstart = () => { if (!started) { started = true; options.onStart?.(); } };
    u.onend   = () => { idx += 1; speakChunk(voice); };
    u.onerror = (e: any) => {
      // 'interrupted'/'canceled' are the normal result of cancel() — not failures
      if (e?.error === 'interrupted' || e?.error === 'canceled') { finishAll(); return; }
      idx += 1; speakChunk(voice);
    };
    synth.speak(u);
  }

  getVoicesReady().then((voices) => {
    if (myGen !== speakGeneration) return;
    const voice = selectVoiceFrom(voices, role, options.panelistName);
    // Chrome mishandles speak() invoked in the same tick as cancel() — a short
    // delay lets the queue actually clear first.
    setTimeout(() => {
      if (myGen !== speakGeneration) return;
      synth.resume();   // clears any lingering paused state from priming / a prior pause
      speakChunk(voice);
      clearKeepAlive();
      keepAliveTimer = setInterval(() => {
        if (myGen !== speakGeneration || finished) { clearKeepAlive(); return; }
        // Resets Chrome's internal ~15s idle timer that otherwise pauses speech
        // partway through a long panel question.
        if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
      }, 8_000);
    }, 75);
  });
}

export function stopSpeaking(): void {
  const pending = activeFinish;
  activeFinish = null;
  speakGeneration++;
  clearKeepAlive();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  pending?.();   // fire the in-flight call's onEnd once so UI state unsticks
}

export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isSTTSupported(): boolean {
  return typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );
}

export async function checkMicPermission(): Promise<'denied' | 'granted' | 'prompt' | 'unknown'> {
  try {
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state as 'denied' | 'granted' | 'prompt';
    }
  } catch { /* permissions API unavailable */ }
  return 'unknown';
}

export function sttErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':        return 'Microphone permission denied. Allow access in your browser settings.';
    case 'service-not-allowed': return 'Speech recognition is not allowed. Make sure you are on localhost or HTTPS.';
    case 'audio-capture':      return 'Microphone not detected. Check that it is connected and not muted.';
    case 'network':            return 'Network error during speech recognition. Check your internet connection.';
    case 'not-supported':      return 'This browser does not support voice input. Please use Chrome or Edge.';
    case 'aborted':            return '';
    default:                   return `Voice recognition error: ${code}`;
  }
}

// Returns the best STT language code, prioritising Filipino-locale browsers
function getSttLanguage(): string {
  const lang = navigator.language || '';
  if (lang.includes('PH') || lang.toLowerCase().includes('fil')) return 'fil-PH';
  if (lang.startsWith('en')) return lang;
  return 'en-PH'; // Default for Philippine English (handles Taglish better than en-US)
}

// ── STT ──────────────────────────────────────────────────────

export interface STTSession {
  stop: () => void;
}

export function startSTT(callbacks: {
  onInterim:     (text: string) => void;
  onFinal:       (text: string) => void;
  onEnd:         () => void;
  onError:       (message: string) => void;
  shouldRestart: () => boolean;
}): STTSession {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) { callbacks.onError(sttErrorMessage('not-supported')); return { stop: () => {} }; }

  let stopped = false;
  let finalAccumulated = '';
  let activeRecognition: any = null;

  function createInstance() {
    const r = new SR();
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = getSttLanguage();
    r.maxAlternatives = 1;

    r.onresult = (event: any) => {
      let interim = '';
      let newFinal = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinal += t;
          finalAccumulated += (finalAccumulated ? ' ' : '') + t.trim();
        } else {
          interim += t;
        }
      }
      callbacks.onInterim((finalAccumulated + (interim ? ' ' + interim : '')).trim());
      if (newFinal) callbacks.onFinal(finalAccumulated);
    };

    r.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      stopped = true;
      const msg = sttErrorMessage(e.error);
      if (msg) callbacks.onError(msg);
    };

    r.onend = () => {
      if (!stopped && callbacks.shouldRestart()) {
        setTimeout(() => {
          if (!stopped && callbacks.shouldRestart()) {
            activeRecognition = createInstance();
            try { activeRecognition.start(); } catch { /* ignore */ }
          }
        }, 150);
      } else {
        callbacks.onEnd();
      }
    };

    return r;
  }

  activeRecognition = createInstance();
  try {
    activeRecognition.start();
  } catch (err: any) {
    callbacks.onError(`Could not start microphone: ${err.message}`);
  }

  return {
    stop: () => {
      stopped = true;
      try { activeRecognition?.stop(); } catch { /* ignore */ }
    },
  };
}

// ── Panelist Reactions ────────────────────────────────────────

const REACTIONS = {
  strong: [
    'Thank you. That was a comprehensive and well-articulated response.',
    'Excellent. Your explanation demonstrates strong command of the subject.',
    'Very good. That addresses the question effectively.',
    'Good. I appreciate the depth and clarity of your answer.',
  ],
  partial: [
    'Your explanation is interesting, but I have some concerns.',
    'You have covered part of the question. I need further elaboration on certain points.',
    'Thank you. Let me follow up on something from your answer.',
    'I see where you are going, but allow me to probe a bit deeper.',
  ],
  weak: [
    'I would like to challenge that assumption.',
    'This section of your response requires further justification.',
    'I am not entirely satisfied with that explanation. Let us revisit this.',
    'That response does not fully address the question. Allow me to rephrase.',
  ],
};

export function getPanelistReaction(score: number): string {
  const pool = score >= 70 ? REACTIONS.strong : score >= 45 ? REACTIONS.partial : REACTIONS.weak;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Confidence Analysis from Speech ──────────────────────────

export interface SpeechConfidenceMetrics {
  strongFillers: number;
  weakFillers:   number;
  wordCount:     number;
  confidenceScore: number;
}

export function analyzeSpeechConfidence(transcript: string): SpeechConfidenceMetrics {
  const strongFillers = (transcript.match(/\b(uh|um|erm)\b/gi) || []).length;
  const weakFillers   = (transcript.match(/\b(like|maybe|i think|i guess|perhaps|sort of|kind of|basically|i believe|not sure)\b/gi) || []).length;
  const wordCount     = transcript.trim().split(/\s+/).filter(Boolean).length;
  const confidenceScore = Math.max(28, Math.min(100, 90 - strongFillers * 12 - weakFillers * 6));
  return { strongFillers, weakFillers, wordCount, confidenceScore };
}
