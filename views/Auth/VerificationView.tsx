
import React, { useState } from 'react';
import { Mail, CheckCircle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  status: 'pending' | 'verified';
  email?: string;
  onResend?: () => Promise<void>;
  onCancel?: () => void;
  onGoToLogin?: () => void;
}

const VerificationView: React.FC<Props> = ({ status, email, onResend, onCancel, onGoToLogin }) => {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (!onResend) return;
    setResending(true);
    try {
      await onResend();
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-10 shadow-xl text-center">
        {status === 'pending' ? (
          <>
            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
              <Loader2 className="w-10 h-10 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Confirm Your Account</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">We've sent a confirmation link to your email — click it to finish creating your account.</p>

            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl p-6 text-left mb-8">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-2"><Mail className="w-4 h-4" /> Sent to:</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 break-all">{email}</p>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              This page will update automatically once you confirm — no need to refresh.
            </p>

            <button
              onClick={handleResend}
              disabled={resending || !onResend}
              className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mb-3"
            >
              {resending ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {resent ? 'Email sent!' : 'Resend confirmation email'}
            </button>

            {onCancel && (
              <button onClick={onCancel} className="w-full py-2 text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 transition-colors">
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Email Verified!</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8">Your account is now active. You can now log in to Defensa.</p>
            
            <button 
              onClick={onGoToLogin}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
            >
              Go to Login Page <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerificationView;
