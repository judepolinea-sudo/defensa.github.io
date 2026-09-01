import React, { useState } from "react";
import {
  LogIn,
  Mail,
  Lock,
  Mic,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ChevronLeft,
  ShieldCheck,
  FileText,
  Gauge,
  Quote,
  UploadCloud,
  MessagesSquare,
  Award,
} from "lucide-react";
import { UserRole } from "../../types";
import { loginUser, loginWithGoogle } from "../../services/authService";

interface Props {
  onLogin: (userData: any) => void;
  onGoToRegister: () => void;
  onBack: () => void;
  initialRole?: UserRole;
}

const LoginView: React.FC<Props> = ({ onLogin, onGoToRegister, onBack }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkPanel, setIsDarkPanel] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address, for example name@nu-clark.edu.ph.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const userData = await loginUser(trimmedEmail, password);
      onLogin(userData);
    } catch (err: any) {
      console.error("Login error:", err);
      if (
        err.code === "auth/invalid-email" ||
        err.code === "auth/missing-email"
      ) {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/missing-password") {
        setError("Please enter your password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Wait a few minutes and try again, or reset your password.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setError("Invalid email or password.");
      } else if (err.code === "ACCOUNT_DEACTIVATED") {
        setError(
          "This account has been deactivated. Please contact your administrator.",
        );
      } else if (err.code === "PENDING_APPROVAL") {
        setError(
          "Your account is awaiting admin approval. Please check back later.",
        );
      } else if (err.code === "REGISTRATION_REJECTED") {
        setError(
          "Your registration was not approved. Contact your administrator.",
        );
      } else {
        const raw = String(err?.message || "");
        const clean = raw.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/i, "");
        setError(clean || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const userData = await loginWithGoogle();
      onLogin(userData);
    } catch (err: any) {
      console.error("Google login error:", err);
      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        // User dismissed the popup — not an error worth surfacing.
      } else if (err.code === "ACCOUNT_DEACTIVATED") {
        setError(
          "This account has been deactivated. Please contact your administrator.",
        );
      } else {
        setError(err.message || "Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

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
        {/* LEFT — branding panel */}
        <div className="bg-gradient-to-br from-[#5b6ef5] to-[#1d4ed8] p-8 sm:p-10 flex flex-col justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Mic className="w-5 h-5 text-white" />
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
              Upload your thesis or capstone paper and practice with an AI panel
              that generates real defense questions.
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
                  <p className="text-xs text-white/60 leading-relaxed">
                    {step.desc}
                  </p>
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

        {/* RIGHT — sign-in form */}
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
            Welcome back
          </h2>
          <p
            className={`text-sm mb-8 ${isDarkPanel ? "text-slate-400" : "text-slate-500"}`}
          >
            Sign in to continue to DEFENSA
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
              <label
                htmlFor="login-email"
                className={`block text-xs font-semibold mb-1.5 ${isDarkPanel ? "text-slate-300" : "text-slate-600"}`}
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkPanel ? "text-slate-500" : "text-slate-400"}`}
                />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl outline-none transition-all text-sm focus:ring-2 focus:ring-[#5b6ef5] ${
                    isDarkPanel
                      ? "bg-[#1c2130] border border-white/10 text-white placeholder:text-slate-500"
                      : "bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400"
                  }`}
                  placeholder="name@nu-clark.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className={`block text-xs font-semibold mb-1.5 ${isDarkPanel ? "text-slate-300" : "text-slate-600"}`}
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkPanel ? "text-slate-500" : "text-slate-400"}`}
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className={`w-full pl-10 pr-11 py-3 rounded-xl outline-none transition-all text-sm focus:ring-2 focus:ring-[#5b6ef5] ${
                    isDarkPanel
                      ? "bg-[#1c2130] border border-white/10 text-white placeholder:text-slate-500"
                      : "bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400"
                  }`}
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

            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded text-[#5b6ef5] focus:ring-[#5b6ef5]"
                />
                <span
                  className={`text-sm ${isDarkPanel ? "text-slate-400" : "text-slate-600"}`}
                >
                  Remember me
                </span>
              </label>
              <button
                type="button"
                className="text-sm font-semibold text-[#5b6ef5] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-3.5 bg-[#5b6ef5] hover:bg-[#4c5eea] disabled:opacity-60 text-white font-bold rounded-xl shadow-lg shadow-[#5b6ef5]/25 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign in
                </>
              )}
            </button>

            <div className="flex items-center gap-3 py-1">
              <div
                className={`flex-1 h-px ${isDarkPanel ? "bg-white/10" : "bg-slate-200"}`}
              />
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${isDarkPanel ? "text-slate-500" : "text-slate-400"}`}
              >
                or
              </span>
              <div
                className={`flex-1 h-px ${isDarkPanel ? "bg-white/10" : "bg-slate-200"}`}
              />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className={`w-full py-3 disabled:opacity-60 font-semibold rounded-xl border transition-colors flex items-center justify-center gap-3 text-sm ${
                isDarkPanel
                  ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
              }`}
            >
              {googleLoading ? (
                <div
                  className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${isDarkPanel ? "border-slate-400" : "border-slate-400"}`}
                />
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="#4285F4"
                      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.58-5.17 3.58-8.82Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A12 12 0 0 0 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.61H1.26A12 12 0 0 0 0 12c0 1.93.47 3.76 1.26 5.39l4.01-3.11Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.6 4.6 1.8l3.44-3.44A11.94 11.94 0 0 0 12 0 12 12 0 0 0 1.26 6.61l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </form>

          <p
            className={`mt-8 text-center text-sm ${isDarkPanel ? "text-slate-500" : "text-slate-500"}`}
          >
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={onGoToRegister}
              className="font-semibold text-[#5b6ef5] hover:underline"
            >
              Sign up
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

export default LoginView;
