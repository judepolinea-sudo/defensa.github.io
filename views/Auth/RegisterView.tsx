import React, { useState } from "react";
import {
  UserPlus,
  Mail,
  Lock,
  User as UserIcon,
  ChevronLeft,
  Clock,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ShieldCheck,
  FileText,
  Gauge,
  Quote,
  UploadCloud,
  MessagesSquare,
  Award,
  Building2,
} from "lucide-react";
import { registerUser } from "../../services/authService";
import { SCHOOLS, DEFAULT_SCHOOL, joinName } from "../../types";

interface Props {
  onGoToLogin: () => void;
  onBack: () => void;
}

const YEAR_LEVELS = ["3rd Year", "4th Year"];

const steps = [
  {
    number: 1,
    icon: UploadCloud,
    iconBg: "bg-sky-400/20",
    iconColor: "text-sky-200",
    title: "Upload Abstract",
    desc: "Simply drag and drop your PDF or DOCX abstract. Our AI analyzes your methodology instantly.",
  },
  {
    number: 2,
    icon: MessagesSquare,
    iconBg: "bg-amber-400/20",
    iconColor: "text-amber-200",
    title: "Simulate Defense",
    desc: "Engage in high-pressure Q&A sessions with virtual panelists tailored to your research focus.",
  },
  {
    number: 3,
    icon: Award,
    iconBg: "bg-emerald-400/20",
    iconColor: "text-emerald-200",
    title: "Master Content",
    desc: "Review your readiness score, category breakdowns, and AI-suggested improvements after every session.",
  },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Secure & Private",
    desc: "Your data is safe with us.",
  },
  {
    icon: FileText,
    title: "Document-Grounded AI",
    desc: "Questions from your actual paper.",
  },
  {
    icon: Gauge,
    title: "Readiness Score",
    desc: "Know exactly where you stand.",
  },
];

const BrandPanel: React.FC = () => (
  <div className="bg-gradient-to-br from-[#5b6ef5] to-[#1d4ed8] p-8 sm:p-10 flex flex-col justify-between gap-8">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
        <ShieldCheck className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-lg font-extrabold text-white tracking-tight leading-none">
          DEFENSA
        </div>
        <div className="text-[10px] font-semibold text-white/70 uppercase tracking-widest mt-1">
          Viva Simulator &amp; Readiness Platform
        </div>
      </div>
    </div>

    <div>
      <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
        <span className="text-white">Prepare your defense</span>
        <br />
        <span className="text-white/80">like a champion.</span>
      </h1>
      <p className="text-sm text-white/70 leading-relaxed max-w-sm">
        Upload your thesis or capstone paper and practice with an AI panel that
        generates real defense questions.
      </p>
    </div>

    {/* Glassmorphic preview card */}
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5">
      {steps.map((step, i) => (
        <div key={step.number} className="flex gap-4">
          <div className="flex flex-col items-center shrink-0">
            <div
              className={`w-10 h-10 rounded-xl ${step.iconBg} border border-white/20 flex items-center justify-center relative`}
            >
              <step.icon className={`w-4 h-4 ${step.iconColor}`} />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-[10px] font-bold text-[#1d4ed8] flex items-center justify-center">
                {step.number}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-px flex-1 min-h-[16px] bg-white/15 my-1.5" />
            )}
          </div>
          <div className={i < steps.length - 1 ? "pb-5" : ""}>
            <div className="text-sm font-semibold text-white leading-none mb-1.5">
              {step.title}
            </div>
            <p className="text-xs text-white/60 leading-relaxed">{step.desc}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="flex items-start gap-2">
      <Quote className="w-5 h-5 text-white/30 shrink-0 mt-0.5" />
      <p className="text-xs text-white/60 leading-relaxed">
        A well-prepared student answers with confidence, not with luck.
      </p>
    </div>
  </div>
);

const RegisterView: React.FC<Props> = ({ onGoToLogin, onBack }) => {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [program, setProgram] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isDarkPanel, setIsDarkPanel] = useState(true);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!email.trim().toLowerCase().endsWith("@nu-clark.edu.ph")) {
      setError("Only @nu-clark.edu.ph email accounts can sign up.");
      return;
    }
    if (!school) {
      setError("Please select your school.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        email,
        password,
        fullName: joinName(firstName, middleName, lastName),
        program: program || undefined,
        yearLevel: yearLevel || undefined,
        school,
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error("Registration error:", err);
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (extra = "") =>
    `w-full py-3 rounded-xl outline-none transition-all text-sm focus:ring-2 focus:ring-[#5b6ef5] ${extra} ${
      isDarkPanel
        ? "bg-[#1c2130] border border-white/10 text-white placeholder:text-slate-500"
        : "bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400"
    }`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${isDarkPanel ? "text-slate-300" : "text-slate-600"}`;
  const iconClass = `absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkPanel ? "text-slate-500" : "text-slate-400"}`;

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-5xl mx-auto rounded-[2rem] overflow-hidden shadow-[0_30px_70px_-20px_rgba(15,23,42,0.35)] grid grid-cols-1 md:grid-cols-2">
          <BrandPanel />
          <div className="relative p-8 sm:p-10 flex flex-col items-center justify-center text-center bg-[#141824]">
            <div className="w-14 h-14 rounded-2xl bg-[#5b6ef5]/15 flex items-center justify-center mb-6">
              <Clock className="w-7 h-7 text-[#5b6ef5]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Registration Submitted
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-8 max-w-sm">
              Your account is waiting for admin approval. Once approved, we&apos;ll
              email you a verification link — open it, then you can sign in.
            </p>
            <button
              type="button"
              onClick={onGoToLogin}
              className="w-full py-3.5 bg-[#5b6ef5] hover:bg-[#4c5eea] text-white font-bold rounded-xl shadow-lg shadow-[#5b6ef5]/25 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
      <button
        type="button"
        onClick={onBack}
        className="self-start ml-1 mb-6 sm:mb-8 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors w-full max-w-5xl mx-auto sm:ml-auto"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      <div className="w-full max-w-5xl mx-auto rounded-[2rem] overflow-hidden shadow-[0_30px_70px_-20px_rgba(15,23,42,0.35)] grid grid-cols-1 md:grid-cols-2">
        <BrandPanel />

        {/* RIGHT — registration form */}
        <div
          className={`relative p-8 sm:p-10 flex flex-col justify-center transition-colors ${
            isDarkPanel ? "bg-[#141824]" : "bg-white"
          }`}
        >
          <button
            type="button"
            onClick={() => setIsDarkPanel((v) => !v)}
            aria-label={
              isDarkPanel ? "Switch to light mode" : "Switch to dark mode"
            }
            className={`absolute top-6 right-6 sm:top-8 sm:right-8 w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${
              isDarkPanel
                ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            }`}
          >
            {isDarkPanel ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          <h2
            className={`text-2xl sm:text-3xl font-bold mb-1 ${isDarkPanel ? "text-white" : "text-slate-900"}`}
          >
            Create your account
          </h2>
          <p
            className={`text-sm mb-8 ${isDarkPanel ? "text-slate-400" : "text-slate-500"}`}
          >
            Register to start practicing with DEFENSA
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div
                className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl text-center"
                role="alert"
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="reg-first" className={labelClass}>
                First Name
              </label>
              <div className="relative">
                <UserIcon className={iconClass} />
                <input
                  id="reg-first"
                  type="text"
                  required
                  autoComplete="given-name"
                  className={fieldClass("pl-10 pr-4")}
                  placeholder="Juan"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-middle" className={labelClass}>
                  Middle Name
                </label>
                <input
                  id="reg-middle"
                  type="text"
                  autoComplete="additional-name"
                  className={fieldClass("px-3")}
                  placeholder="Optional"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="reg-last" className={labelClass}>
                  Last Name
                </label>
                <input
                  id="reg-last"
                  type="text"
                  required
                  autoComplete="family-name"
                  className={fieldClass("px-3")}
                  placeholder="Dela Cruz"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-school" className={labelClass}>
                School
              </label>
              <div className="relative">
                <Building2 className={iconClass} />
                <select
                  id="reg-school"
                  className={fieldClass("pl-10 pr-4")}
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                >
                  {SCHOOLS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="reg-email" className={labelClass}>
                Email address
              </label>
              <div className="relative">
                <Mail className={iconClass} />
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  className={fieldClass("pl-10 pr-4")}
                  placeholder="juan.delacruz@nu-clark.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Use your @nu-clark.edu.ph school email.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-program" className={labelClass}>
                  Program
                </label>
                <input
                  id="reg-program"
                  type="text"
                  className={fieldClass("px-3")}
                  placeholder="Ex. BSIT"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="reg-year" className={labelClass}>
                  Year Level
                </label>
                <select
                  id="reg-year"
                  className={fieldClass("px-3")}
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value)}
                >
                  <option value="">Select</option>
                  {YEAR_LEVELS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="reg-password" className={labelClass}>
                Password
              </label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={fieldClass("pl-10 pr-11")}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${isDarkPanel ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-confirm-password" className={labelClass}>
                Confirm Password
              </label>
              <div className="relative">
                <Lock className={iconClass} />
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={fieldClass("pl-10 pr-11")}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${isDarkPanel ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#5b6ef5] hover:bg-[#4c5eea] disabled:opacity-60 text-white font-bold rounded-xl shadow-lg shadow-[#5b6ef5]/25 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Register
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onGoToLogin}
              className="font-semibold text-[#5b6ef5] hover:underline"
            >
              Log in
            </button>
          </p>
        </div>
      </div>

      {/* Bottom feature bar */}
      <div className="w-full max-w-5xl mx-auto mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 px-2">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#5b6ef5]/15 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-[#5b6ef5]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 leading-none mb-1">
                {title}
              </div>
              <div className="text-xs text-slate-500">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegisterView;
