import React, { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ShieldCheck,
  Play,
  ArrowRight,
  Zap,
  Users,
  BarChart3,
  Mail,
  CheckCircle,
  Star,
  MessageSquare,
  ChevronDown,
  Bot,
  Mic,
  Upload,
} from "lucide-react";
import PricingSection from "@/components/ui/pricing-section-4";
import { GradientCard } from "@/components/ui/gradient-card";

import { UserRole } from "../../types";

interface Props {
  onLogin: () => void;
}

const NAV_LINKS = [
  { id: "home", label: "Home" },
  { id: "how-to", label: "How To" },
  { id: "pricing", label: "Pricing" },
] as const;

// Exact background colours of the landing sections, so a WavySeam can paint
// each side up to the wave and blend seamlessly into the real section bg.
const SEAM_LIGHT = "#eff6ff"; // Tailwind blue-50  (hero, workflow, FAQ)
const SEAM_DARK = "#020617"; // Tailwind slate-950 (benefits, CTA)
const SEAM_DARK_ALT = "#0f172a"; // Tailwind slate-900 (pricing)

const SEAM_WAVE = `M0 60 q 120 -80 240 0 ${"t 240 0 ".repeat(4)}`;

/**
 * Static wavy divider that replaces a straight seam between two stacked
 * sections. Sits centred on the boundary and paints each section's own
 * background colour up to a shared wave edge, turning the colour change into
 * a wave. Each fill is crisp at the wave and fades to transparent toward the
 * SVG's outer edge, so any subpixel/overlay mismatch there blends away
 * instead of showing as a hairline. Decorative only — no stroke, no animation.
 *
 * Host it inside whichever adjacent section is `relative` and NOT
 * `overflow-hidden`; use `edge="bottom"` when hosting it in the upper section.
 */
const WavySeam: React.FC<{
  topColor: string;
  bottomColor: string;
  edge?: "top" | "bottom";
}> = ({ topColor, bottomColor, edge = "top" }) => {
  const id = "seam" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 z-40 w-full h-28 md:h-40 ${
        edge === "top" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
      }`}
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient
          id={`${id}-top`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2="120"
        >
          <stop offset="0" stopColor={topColor} stopOpacity="0" />
          <stop offset="0.3" stopColor={topColor} stopOpacity="1" />
          <stop offset="1" stopColor={topColor} stopOpacity="1" />
        </linearGradient>
        <linearGradient
          id={`${id}-bottom`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2="120"
        >
          <stop offset="0" stopColor={bottomColor} stopOpacity="1" />
          <stop offset="0.7" stopColor={bottomColor} stopOpacity="1" />
          <stop offset="1" stopColor={bottomColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${SEAM_WAVE} L1200 120 L0 120 Z`} fill={`url(#${id}-bottom)`} />
      <path d={`${SEAM_WAVE} L1200 0 L0 0 Z`} fill={`url(#${id}-top)`} />
    </svg>
  );
};

const LandingView: React.FC<Props> = ({ onLogin }) => {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] =
    useState<(typeof NAV_LINKS)[number]["id"]>("home");
  // While true, scroll-spy updates from the IntersectionObserver are ignored — set on nav-link
  // click so the pill jumps straight to the target instead of lighting up sections it scrolls past.
  const suppressSpyRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      if (suppressSpyRef.current) {
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => {
          suppressSpyRef.current = false;
        }, 120);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const handleNavClick = (id: (typeof NAV_LINKS)[number]["id"]) => {
    setActiveSection(id);
    suppressSpyRef.current = true;
    // Safety-net timeout in case the browser hasn't started firing scroll events yet —
    // once scrolling actually begins, onScroll's own debounce takes over and extends this.
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      suppressSpyRef.current = false;
    }, 600);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressSpyRef.current) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(
              entry.target.id as (typeof NAV_LINKS)[number]["id"],
            );
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    NAV_LINKS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bg-slate-950 text-white selection:bg-blue-500 font-sans">
      {/* Navigation */}
      <nav
        className={`fixed top-4 left-4 right-4 z-50 px-6 rounded-2xl flex items-center justify-between border backdrop-blur-xl transition-all duration-300 ${
          scrolled
            ? "py-3 bg-slate-950/95 border-white/10 shadow-xl shadow-black/40"
            : "py-4 bg-slate-950/80 border-white/10 shadow-lg shadow-black/20"
        }`}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-8 h-8 text-blue-500" />
          <span className="text-xl font-black tracking-tight uppercase">
            Defensa
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={() => handleNavClick(link.id)}
                className={`relative px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors ${
                  activeSection === link.id
                    ? "text-slate-950"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {activeSection === link.id && (
                  <motion.span
                    layoutId="landing-nav-pill"
                    className="absolute inset-0 bg-white rounded-xl shadow-lg shadow-black/20"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={onLogin}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-blue-600/20 uppercase tracking-widest"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        id="home"
        className="relative pt-48 pb-32 px-6 overflow-hidden bg-blue-50 scroll-mt-28"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/10 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-600 text-xs font-black uppercase tracking-widest mb-10 animate-pulse">
            <Zap className="w-4 h-4" /> Trusted Viva Intelligence
          </div>

          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter mb-8 leading-[0.85] text-slate-900">
            Master your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-700">
              Defense.
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mb-12 leading-relaxed font-medium">
            Defensa is a restricted access simulation environment for NU Clark
            students. Connect with AI panels and prove your research readiness.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 mb-20">
            <button
              type="button"
              onClick={onLogin}
              className="px-16 py-6 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-3xl text-xl shadow-2xl shadow-blue-500/30 flex items-center justify-center gap-3 transition-all hover:translate-y-[-2px]"
            >
              Access Portal <ArrowRight className="w-6 h-6" />
            </button>
            <button
              type="button"
              className="px-12 py-6 bg-white hover:bg-blue-100/50 text-slate-900 font-black rounded-3xl text-xl border border-blue-100 shadow-sm flex items-center justify-center gap-3 transition-all"
            >
              <Play className="w-6 h-6 fill-current" /> Institutional Demo
            </button>
          </div>

          {/* Social Proof / Logos */}
          <div className="w-full pt-10 border-t border-blue-100">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-8 text-slate-500">
              Trusted by students from
            </p>
            <div className="flex flex-wrap justify-center gap-10 md:gap-20 transition-all duration-700">
              <span className="text-2xl font-black tracking-tighter text-slate-800">
                NU CLARK IT
              </span>
              <span className="text-2xl font-black tracking-tighter text-slate-800">
                COM-SOC
              </span>
              <span className="text-2xl font-black tracking-tighter text-slate-800">
                NU SEAT
              </span>
              <span className="text-2xl font-black tracking-tighter text-slate-800">
                IT-SOC
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits / Features Grid */}
      <section className="py-32 px-6 border-b border-white/5 bg-slate-950 relative">
        {/* hero (light) → benefits (dark) */}
        <WavySeam topColor={SEAM_LIGHT} bottomColor={SEAM_DARK} />

        <div className="max-w-6xl mx-auto">
          <div className="mb-24 text-center">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-6 leading-tight">
              Membership <br />
              <span className="text-blue-500">benefits</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-xl mx-auto">
              Defensa replaces manual rehearsals with high-fidelity AI feedback,
              delivered instantly to your dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <GradientCard
              gradient="blue"
              icon={Bot}
              title="Virtual Panelists"
              description="Choose from expert personas like Technical Expert, Ethics Reviewer, or Industry Practitioner with unique questioning styles."
              imageUrl="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-3aN9LlNelb6amMF9yEHw66AgOP7e9s.png&w=320&q=75"
            />
            <GradientCard
              gradient="sky"
              icon={BarChart3}
              title="Instant Analysis"
              description="Receive real-time scores on semantic relevance, keyword accuracy, and confidence indicators using Google Gemini 3."
              imageUrl="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-Tyvqm5GotnxBr9yKc9S6tlThyYxfV3.png&w=320&q=75"
            />
            <GradientCard
              gradient="violet"
              icon={Users}
              title="Faculty Ready"
              description="Exclusive for NU Clark students with faculty monitoring and aggregated reporting for thesis advisers."
              imageUrl="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-5WJZLkaCfLUnCYpgNz89tPx5C4KYgJ.png&w=320&q=75"
            />
            <GradientCard
              gradient="slate"
              icon={Upload}
              title="Context Aware"
              description="Our engine parses your uploaded abstract to generate questions specific to your unique research methodology."
              imageUrl="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-zGyBqZLV8MGRs1NxccwHoHjQc5XtsK.png&w=320&q=75"
            />
            <GradientCard
              gradient="emerald"
              icon={Mic}
              title="Voice & Hybrid"
              description="Practice through text, or go full simulation with Voice-to-Text and AI speech responses for a realistic feel."
              imageUrl="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-KX0Z7pVafk4lcRdERs1cXpiEaqShgP.png&w=320&q=75"
            />
            <GradientCard
              gradient="amber"
              icon={CheckCircle}
              title="Mock Defense"
              description="Structured 15-45 minute sessions that mimic the actual oral defense flow of National University SEAT."
              imageUrl="https://www.thiings.co/_next/image?url=https%3A%2F%2Flftz25oez4aqbxpq.public.blob.vercel-storage.com%2Fimage-5i9EDsbgEZk9k7NBeKt3ImNXkx0F66.png&w=320&q=75"
            />
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="how-to" className="relative py-32 px-6 bg-blue-50 scroll-mt-28">
        {/* benefits (dark) → workflow (light) */}
        <WavySeam topColor={SEAM_DARK} bottomColor={SEAM_LIGHT} />
        {/* workflow (light) → pricing (dark) — hosted here since pricing is overflow-hidden */}
        <WavySeam topColor={SEAM_LIGHT} bottomColor={SEAM_DARK_ALT} edge="bottom" />

        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-7xl font-black tracking-tighter mb-4 text-slate-900">
              How it works
            </h2>
            <p className="text-slate-600 text-xl font-medium uppercase tracking-widest">
              Prepare in minutes, not months.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 relative">
            {/* Connecting lines for desktop */}
            <div className="hidden md:block absolute top-24 left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

            <div className="flex flex-col items-center text-center group">
              <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-3xl mb-8 shadow-2xl shadow-blue-600/20 group-hover:scale-110 transition-transform">
                1
              </div>
              <h4 className="text-2xl font-black mb-4 uppercase tracking-tighter text-slate-900">
                Upload Abstract
              </h4>
              <p className="text-slate-600 leading-relaxed font-medium">
                Simply drag and drop your PDF or DOCX abstract. Our AI analyzes
                your methodology instantly.
              </p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-3xl mb-8 shadow-2xl shadow-blue-600/20 group-hover:scale-110 transition-transform">
                2
              </div>
              <h4 className="text-2xl font-black mb-4 uppercase tracking-tighter text-slate-900">
                Simulate Defense
              </h4>
              <p className="text-slate-600 leading-relaxed font-medium">
                Engage in high-pressure Q&A sessions with virtual panelists
                tailored to your research focus.
              </p>
            </div>

            <div className="flex flex-col items-center text-center group">
              <div className="w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-3xl mb-8 shadow-2xl shadow-blue-600/20 group-hover:scale-110 transition-transform">
                3
              </div>
              <h4 className="text-2xl font-black mb-4 uppercase tracking-tighter text-slate-900">
                Master Content
              </h4>
              <p className="text-slate-600 leading-relaxed font-medium">
                Review your readiness score, category breakdowns, and
                AI-suggested improvements after every session.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Access Section */}
      <PricingSection />

      {/* FAQ Section */}
      <section className="relative py-32 px-6 bg-blue-50">
        {/* pricing (dark) → FAQ (light) */}
        <WavySeam topColor={SEAM_DARK_ALT} bottomColor={SEAM_LIGHT} />
        {/* FAQ (light) → CTA (dark) — hosted here since the CTA is overflow-hidden */}
        <WavySeam topColor={SEAM_LIGHT} bottomColor={SEAM_DARK} edge="bottom" />

        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-16 text-center text-slate-900">
            Frequently Asked
          </h2>

          <div className="space-y-6">
            {[
              {
                q: "Is the AI feedback accurate?",
                a: "Defensa uses Google Gemini 3 Pro with custom prompts engineered specifically for academic viva voce scenarios. While it provides high-quality guidance, students should always consult with their research advisers for final approval.",
              },
              {
                q: "Can I use it for Qualitative research?",
                a: "Yes. During project setup, you can select between Quantitative, Qualitative, Mixed-Methods, or Experimental. The AI adjusts its questioning style based on this choice.",
              },
              {
                q: "Is my abstract data secure?",
                a: "Absolutely. Abstracts are processed in real-time and are only accessible to you and your assigned faculty adviser via the institutional dashboard.",
              },
              {
                q: "Which browsers are supported?",
                a: "Defensa is optimized for modern browsers including Chrome, Edge, and Safari. Voice features require microphone permissions which are best supported on Chrome.",
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="p-8 rounded-[32px] bg-white border border-blue-100 shadow-sm group hover:bg-blue-100/50 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h4 className="text-xl font-black uppercase tracking-tighter text-blue-600">
                    {faq.q}
                  </h4>
                  <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-slate-900 transition-colors" />
                </div>
                <p className="text-slate-600 font-medium leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action Footer */}
      <section className="py-32 px-6 bg-slate-950 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-32 -mt-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="max-w-6xl mx-auto flex flex-col items-center text-center relative z-10">
          <h2 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter mb-12 text-white">
            Ready for your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-500">
              Oral Defense?
            </span>
          </h2>
          <button
            type="button"
            onClick={onLogin}
            className="px-16 py-8 bg-white text-slate-950 font-black rounded-[40px] text-2xl md:text-3xl hover:scale-105 transition-transform flex items-center gap-4 shadow-2xl"
          >
            Access Defense Portal <ArrowRight className="w-8 h-8" />
          </button>

          <div className="mt-40 w-full pt-12 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 text-white/50 text-sm font-black uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6" />
              <span>Defensa © 2026</span>
            </div>
            <div className="flex gap-8">
              <button
                type="button"
                className="hover:text-white transition-colors"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                className="hover:text-white transition-colors"
              >
                Terms of Service
              </button>
            </div>
            <div className="flex items-center gap-4">
              <Mail className="w-5 h-5" />
              <span>support@defensa.edu.ph</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingView;
