import React, { useState, useEffect } from 'react';
import { Save, X, BookOpen, Calendar, AlignLeft } from 'lucide-react';
import { ProjectProfile, ResearchMethodology, Department } from '../../types';

interface Props {
  initialData?: ProjectProfile;
  token?: string | null;
  onSave: (project: ProjectProfile) => void;
  onCancel: () => void;
}

const ProjectSetupView: React.FC<Props> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<ProjectProfile>({
    title: '',
    methodology: ResearchMethodology.QUANTITATIVE,
    department: Department.BSIT,
    techStack: [],
    defenseDate: '',
    description: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ProjectProfile, string>>>({});

  useEffect(() => {
    if (initialData) setFormData(initialData);
  }, [initialData]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof ProjectProfile, string>> = {};
    if (!formData.title.trim()) errs.title = 'Project title is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (validate()) onSave(formData);
  };

  const isEdit = !!initialData;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col p-4 md:p-10">
      <div className="max-w-4xl mx-auto w-full">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tighter uppercase">
              {isEdit ? 'Update Project Profile' : 'Create Group Project'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              {isEdit ? 'Modify your group research parameters.' : 'Define your group research context for accurate simulation.'}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel and go back" title="Cancel" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500 dark:text-slate-400" />
          </button>
        </header>

        <div className="bg-white dark:bg-slate-900 rounded-[40px] p-10 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Project Title */}
            <div className="md:col-span-2">
              <label htmlFor="project-title" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Project Title *</label>
              <div className="relative">
                <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input
                  id="project-title"
                  type="text"
                  className={`w-full pl-12 pr-4 py-5 bg-slate-50 dark:bg-slate-950 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold ${errors.title ? 'border-red-400' : 'border-slate-200 dark:border-slate-800'}`}
                  placeholder="e.g. AI-Powered Viva Simulator"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              {errors.title && <p className="mt-1 text-xs text-red-500 font-semibold">{errors.title}</p>}
            </div>

            {/* Defense Date */}
            <div className="md:col-span-2">
              <label htmlFor="project-date" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Expected Defense Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input
                  id="project-date"
                  type="date"
                  className="w-full pl-12 pr-4 py-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={formData.defenseDate ?? ''}
                  onChange={(e) => setFormData({ ...formData, defenseDate: e.target.value })}
                />
              </div>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label htmlFor="project-desc" className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Brief Description (Optional)</label>
              <div className="relative">
                <AlignLeft className="absolute left-4 top-5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <textarea
                  id="project-desc"
                  className="w-full pl-12 pr-4 py-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[140px] font-medium"
                  placeholder="Describe your research goal in a few sentences..."
                  value={formData.description ?? ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="mt-12 flex gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-black rounded-3xl transition-all uppercase tracking-widest text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-[2] py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-3xl shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
            >
              <Save className="w-5 h-5" /> {isEdit ? 'Commit Project Changes' : 'Save & Proceed to Abstract'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSetupView;
