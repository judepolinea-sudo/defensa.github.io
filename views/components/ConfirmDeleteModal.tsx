import React from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { USER_ROLE_LABELS, UserRole } from '../../types';

interface Props {
  isOpen: boolean;
  userName: string;
  userRole: UserRole;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmDeleteModal: React.FC<Props> = ({
  isOpen,
  userName,
  userRole,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 relative animate-in zoom-in-95 duration-200">
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>

        <h2 className="text-xl font-black text-slate-800 mb-1 uppercase tracking-tighter">
          Delete User Account
        </h2>
        <p className="text-slate-500 text-sm mb-6">This action will deactivate the account. It can be restored later by a Superadmin.</p>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-8 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</span>
            <span className="text-sm font-black text-slate-800">{userName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</span>
            <span className="text-xs font-black text-slate-600 uppercase px-2 py-0.5 bg-slate-200 rounded-md">
              {USER_ROLE_LABELS[userRole] ?? userRole}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl transition-all uppercase tracking-tight text-xs disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl transition-all uppercase tracking-tight text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-200 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
