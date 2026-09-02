import React, { useState, useEffect } from "react";
import LandingView from "./views/Landing/LandingView";
import LoginView from "./views/Auth/LoginView";
import RegisterView from "./views/Auth/RegisterView";
import VerificationView from "./views/Auth/VerificationView";
import DashboardView from "./views/Dashboard/DashboardView";
import AdminDashboardView from "./views/Dashboard/AdminDashboardView";
import ProjectSetupView from "./views/Project/ProjectSetupView";
import AbstractUploadView from "./views/Project/AbstractUploadView";
import SessionConfigView from "./views/Session/SessionConfigView";
import PracticeSessionView from "./views/Session/PracticeSessionView";
import SessionSummaryView from "./views/Session/SessionSummaryView";
import ReadinessDashboardView from "./views/Dashboard/ReadinessDashboardView";
import { ProjectProfile, SessionResult, User, UserRole } from "./types";
import {
  subscribeToAuthChanges,
  logoutUser,
  getSessionToken,
  checkGoogleRedirectResult,
  applyEmailActionCode,
} from "./services/authService";
import { startPresence, stopPresence } from "./services/presenceService";

// Handles the ?mode=verifyEmail&oobCode=... link Firebase puts in the
// verification email, landing the user in a branded Defensa page.
const EmailActionView: React.FC<{ oobCode: string; onDone: () => void }> = ({
  oobCode,
  onDone,
}) => {
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  useEffect(() => {
    applyEmailActionCode(oobCode)
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [oobCode]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-3xl p-10 shadow-xl text-center">
        {state === "working" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Verifying your email…</h2>
          </>
        )}
        {state === "ok" && (
          <>
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Email verified</h2>
            <p className="text-slate-500 mb-8">Your Defensa account is confirmed.</p>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Continue to Defensa
            </button>
          </>
        )}
        {state === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
              !
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Link expired</h2>
            <p className="text-slate-500 mb-8">
              This verification link is invalid or already used. Sign in and use the
              banner on your dashboard to send a fresh one.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Go to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
};

async function fetchGroupProject(
  token: string,
): Promise<ProjectProfile | null> {
  try {
    const res = await fetch("/api/projects/my", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

enum ViewState {
  LOADING,
  LANDING,
  LOGIN,
  REGISTER,
  VERIFICATION_PENDING,
  EMAIL_VERIFIED,
  STUDENT_DASHBOARD,
  ADMIN_DASHBOARD,
  PROJECT_SETUP,
  EDIT_PROJECT,
  ABSTRACT_UPLOAD,
  SESSION_CONFIG,
  PRACTICE_SESSION,
  SESSION_SUMMARY,
  READINESS_DASHBOARD,
}

function getRoleView(role: UserRole): ViewState {
  switch (role) {
    case UserRole.STUDENT:
      return ViewState.STUDENT_DASHBOARD;
    case UserRole.ADMIN:
      return ViewState.ADMIN_DASHBOARD;
    default:
      return ViewState.LANDING;
  }
}

const App: React.FC = () => {
  // A Firebase account-action link (email verification) landed us here.
  const [emailActionCode, setEmailActionCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("mode") === "verifyEmail" ? p.get("oobCode") : null;
  });

  const [currentView, setCurrentView] = useState<ViewState>(ViewState.LOADING);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectProfile | null>(null);
  const [lastSession, setLastSession] = useState<SessionResult | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionResult[]>([]);
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [dashboardTab, setDashboardTab] = useState<
    "home" | "projects" | "analytics" | "settings"
  >("home");

  // Open the student dashboard on a specific tab (used by other screens' nav
  // bars so the top navigation works from anywhere, not just the dashboard).
  const openStudentDashboard = (
    tab: "home" | "projects" | "analytics" | "settings" = "home",
  ) => {
    setDashboardTab(tab);
    setCurrentView(ViewState.STUDENT_DASHBOARD);
  };

  useEffect(() => {
    // Picks up the result of a signInWithRedirect() Google login (the popup
    // fallback in loginWithGoogle). onAuthStateChanged below handles routing
    // a successful sign-in the same way it does every other login method —
    // this only surfaces genuine Firebase/Google-level redirect failures.
    checkGoogleRedirectResult().catch((err: any) => {
      console.error("Google redirect login failed:", err);
      alert(err.message || "Google sign-in failed. Please try again.");
    });
  }, []);

  useEffect(() => {
    // Fail-safe: If auth doesn't respond in 8 seconds, revert to landing
    const timeout = setTimeout(() => {
      if (currentView === ViewState.LOADING) {
        console.warn("Auth timed out. Reverting to landing.");
        setCurrentView(ViewState.LANDING);
      }
    }, 8000);

    const unsubscribe = subscribeToAuthChanges(async (currentUser) => {
      clearTimeout(timeout);
      if (currentUser) {
        setUser(currentUser);
        const t = await getSessionToken();
        setToken(t);
        setCurrentView(getRoleView(currentUser.role));
        startPresence();

        if (currentUser.role === UserRole.STUDENT) {
          // Load group project and session history in parallel from the backend API
          const [loadedProject, loadedSessions] = await Promise.all([
            fetchGroupProject(t!),
            (async (): Promise<SessionResult[]> => {
              try {
                const res = await fetch("/api/sessions/my", {
                  headers: { Authorization: `Bearer ${t}` },
                });
                if (res.ok) return await res.json();
              } catch {
                /* non-fatal — session history defaults to empty */
              }
              return [];
            })(),
          ]);
          setProject(loadedProject);
          setSessionHistory(loadedSessions);
        }
      } else {
        setUser(null);
        stopPresence();
        // Don't yank the user off an auth screen when a sign-in attempt is
        // rejected server-side (e.g. a deleted/deactivated account): the
        // backend returns no profile, which lands here. Staying on LOGIN /
        // REGISTER lets those views show their own error notification.
        setCurrentView((prev) =>
          prev === ViewState.LOGIN ||
          prev === ViewState.REGISTER ||
          prev === ViewState.EMAIL_VERIFIED
            ? prev
            : ViewState.LANDING,
        );
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (userData: User) => {
    setUser(userData);
    const t = await getSessionToken();
    setToken(t);
    setCurrentView(getRoleView(userData.role));
    startPresence();
  };

  // Remove the current project (and its abstract) so the student can set up a
  // new one. Past session history is preserved server-side.
  const handleDeleteProject = async () => {
    if (!project?.id) {
      setProject(null);
      return;
    }
    const freshToken = (await getSessionToken()) ?? token;
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || "Failed to remove the project. Please try again.");
    }
    setProject(null);
    setLastSession(null);
    openStudentDashboard("projects");
  };

  const handleSessionComplete = async (result: SessionResult) => {
    setLastSession(result);
    setSessionHistory([result, ...sessionHistory]);

    // Always get a fresh token — the stored state token can expire after 1 hour
    const freshToken = await getSessionToken();
    if (freshToken) {
      try {
        const saveRes = await fetch("/api/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({
            projectTitle: project?.title,
            overallScore: result.overallScore,
            accuracyScore: Math.round(result.categoryScores["Accuracy"] ?? 0),
            completenessScore: Math.round(result.categoryScores["Completeness"] ?? 0),
            clarityScore: Math.round(result.categoryScores["Clarity"] ?? 0),
            confidenceScore: Math.round(result.categoryScores["Confidence"] ?? 0),
            duration: result.duration,
            questionsAnswered: result.questionsAnswered,
            history: result.history,
            weakestCategory: (result as any).weakestCategory,
          }),
        });
        if (saveRes.ok) {
          const body = await saveRes.json().catch(() => ({}));
          if (body?.sessionId) setLastSessionId(body.sessionId);
        } else {
          const body = await saveRes.text().catch(() => "");
          console.error(`[Session save] Server returned ${saveRes.status}:`, body);
        }
      } catch (error) {
        console.error("[Session save] Network error:", error);
      }
    } else {
      console.error("[Session save] Could not obtain auth token — session not saved.");
    }

    setCurrentView(ViewState.SESSION_SUMMARY);
  };

  const handleLogout = async () => {
    try {
      stopPresence();
      await logoutUser();
      setUser(null);
      setProject(null);
      setLastSession(null);
      setSessionHistory([]);
      setCurrentView(ViewState.LANDING);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (emailActionCode) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
        <EmailActionView
          oobCode={emailActionCode}
          onDone={() => {
            window.history.replaceState(null, "", window.location.pathname);
            setEmailActionCode(null);
            setCurrentView(user ? getRoleView(user.role) : ViewState.LOGIN);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {currentView === ViewState.LOADING && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      )}

      {currentView === ViewState.LANDING && (
        <LandingView onLogin={() => setCurrentView(ViewState.LOGIN)} />
      )}

      {currentView === ViewState.LOGIN && (
        <LoginView
          onLogin={handleLogin}
          onGoToRegister={() => setCurrentView(ViewState.REGISTER)}
          onBack={() => setCurrentView(ViewState.LANDING)}
        />
      )}

      {currentView === ViewState.REGISTER && (
        <RegisterView
          onGoToLogin={() => setCurrentView(ViewState.LOGIN)}
          onBack={() => setCurrentView(ViewState.LOGIN)}
        />
      )}

      {currentView === ViewState.EMAIL_VERIFIED && (
        <VerificationView
          status="verified"
          onGoToLogin={() => setCurrentView(ViewState.LOGIN)}
        />
      )}

      {currentView === ViewState.STUDENT_DASHBOARD && (
        <DashboardView
          key={dashboardTab}
          initialTab={dashboardTab}
          user={user}
          token={token}
          project={project}
          sessionHistory={sessionHistory}
          onEditProject={() => setCurrentView(ViewState.EDIT_PROJECT)}
          onDeleteProject={handleDeleteProject}
          onUploadAbstract={() => setCurrentView(ViewState.ABSTRACT_UPLOAD)}
          onStartPractice={() => {
            if (!project?.abstractText) {
              alert(
                "Your group must upload a research abstract before starting a practice session. Go to Projects → Upload Abstract.",
              );
              return;
            }
            setCurrentView(ViewState.SESSION_CONFIG);
          }}
          onUserUpdate={(u) => setUser(u)}
          onLogout={handleLogout}
        />
      )}

      {currentView === ViewState.ADMIN_DASHBOARD && (
        <AdminDashboardView
          user={user!}
          token={token}
          onLogout={handleLogout}
        />
      )}

      {(currentView === ViewState.PROJECT_SETUP ||
        currentView === ViewState.EDIT_PROJECT) && (
        <ProjectSetupView
          initialData={
            currentView === ViewState.EDIT_PROJECT
              ? project || undefined
              : undefined
          }
          token={token}
          onSave={async (p) => {
            const isEdit = currentView === ViewState.EDIT_PROJECT;
            try {
              let saved: ProjectProfile;
              if (isEdit && project?.id) {
                const res = await fetch(`/api/projects/${project.id}`, {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify(p),
                });
                if (!res.ok) {
                  const err = await res.json();
                  throw new Error(err.message);
                }
                saved = await res.json();
              } else {
                const res = await fetch("/api/projects", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify(p),
                });
                if (!res.ok) {
                  const err = await res.json();
                  throw new Error(err.message);
                }
                saved = await res.json();
              }
              setProject(saved);
              setCurrentView(
                isEdit
                  ? ViewState.STUDENT_DASHBOARD
                  : ViewState.ABSTRACT_UPLOAD,
              );
            } catch (err: any) {
              alert(err.message || "Failed to save project.");
            }
          }}
          onCancel={() => openStudentDashboard("home")}
        />
      )}

      {currentView === ViewState.ABSTRACT_UPLOAD && (
        <AbstractUploadView
          project={project}
          user={user}
          onBack={() => openStudentDashboard("home")}
          onNavigate={openStudentDashboard}
          onLogout={handleLogout}
          onComplete={async (p) => {
            try {
              const isCreate = !project?.id;
              const res = await fetch(
                isCreate ? "/api/projects" : `/api/projects/${project!.id}`,
                {
                  method: isCreate ? "POST" : "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify(
                    isCreate
                      ? {
                          title: p.title,
                          department: user?.program ?? null,
                          abstractText: p.abstractText,
                          analysisResults: p.analysisResults,
                        }
                      : {
                          abstractText: p.abstractText,
                          analysisResults: p.analysisResults,
                        },
                  ),
                },
              );
              if (res.ok) {
                const saved = await res.json();
                setProject(saved);
                openStudentDashboard("projects");
                return;
              }
              const rawBody = await res.text();
              console.error(`[Project save] HTTP ${res.status}:`, rawBody);
              let message = "";
              try {
                message = JSON.parse(rawBody).message ?? "";
              } catch {
                /* body wasn't JSON — already logged above */
              }
              alert(message || `Failed to save your project (HTTP ${res.status}). Check the console for details.`);
            } catch (err: any) {
              console.error("[Project save] Network/JS error:", err);
              alert("Something went wrong saving your project. Please try again.");
            }
          }}
        />
      )}

      {currentView === ViewState.SESSION_CONFIG && (
        <SessionConfigView
          project={project}
          onStart={(config) => {
            setSessionConfig(config);
            setCurrentView(ViewState.PRACTICE_SESSION);
          }}
          onBack={() => openStudentDashboard("home")}
        />
      )}

      {currentView === ViewState.PRACTICE_SESSION && project && (
        <PracticeSessionView
          project={project}
          config={sessionConfig}
          onComplete={handleSessionComplete}
          onExit={() => openStudentDashboard("home")}
        />
      )}

      {currentView === ViewState.SESSION_SUMMARY && lastSession && (
        <SessionSummaryView
          result={lastSession}
          sessionId={lastSessionId}
          token={token}
          onGoDashboard={() => openStudentDashboard("home")}
          onViewDetailed={() => setCurrentView(ViewState.READINESS_DASHBOARD)}
        />
      )}

      {currentView === ViewState.READINESS_DASHBOARD && (
        <ReadinessDashboardView
          history={sessionHistory}
          onBack={() => openStudentDashboard("home")}
          onNewSession={() => setCurrentView(ViewState.SESSION_CONFIG)}
        />
      )}
    </div>
  );
};

export default App;
