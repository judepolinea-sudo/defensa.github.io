
import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Loader2, Info, AlertCircle, X, FolderOpen, Sparkles, BookOpen, ChevronLeft, Home, BarChart3, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { ProjectProfile } from '../../types';
import { analyzeAbstract } from '../../services/geminiService';

type DashTab = 'home' | 'projects' | 'analytics' | 'settings';

interface Props {
  project: ProjectProfile | null;
  user?: any;
  onComplete: (project: Partial<ProjectProfile>) => void;
  onBack?: () => void;
  onNavigate?: (tab: DashTab) => void;
  onLogout?: () => void;
}

const NAV_ITEMS: { id: DashTab; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'home', icon: Home, label: 'Dashboard' },
  { id: 'projects', icon: BookOpen, label: 'Projects' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const MAX_SIZE_BYTES = 30 * 1024 * 1024;

const AbstractUploadView: React.FC<Props> = ({ project, user, onComplete, onBack, onNavigate, onLogout }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'result'>('upload');
  const [uploadMode, setUploadMode] = useState<'single' | 'folder'>('single');
  const [progress, setProgress] = useState(0);
  const [abstractText, setAbstractText] = useState('');
  const [results, setResults] = useState<any>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiIndexed, setAiIndexed] = useState(false);
  const [folderResults, setFolderResults] = useState<{ file: string; status: string }[]>([]);
  const [projectTitle, setProjectTitle] = useState(project?.title ?? '');
  const [titleError, setTitleError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${file.name}" is not a supported file type. Only PDF (.pdf) and Word (.docx) files are accepted.`;
    }
    if (file.size === 0) {
      return 'The file you selected is empty. Please upload a file with content.';
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File exceeds the 30 MB limit. Please upload a smaller file.';
    }
    return null;
  };

  const processFile = async (file: File) => {
    setStep('processing');
    setProgress(0);

    // Animate progress up to 80 while waiting for server
    const interval = setInterval(() => {
      setProgress(prev => (prev < 80 ? prev + 5 : prev));
    }, 150);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/upload/abstract', {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setProgress(90);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.error === 'INVALID_TYPE') {
          setFileError('Only PDF (.pdf) and Word (.docx) files are accepted. Please convert your file to one of these formats.');
        } else if (data.error === 'EMPTY_FILE') {
          setFileError('No readable text was found in this file. Make sure the document contains actual typed text — scanned image PDFs are not supported.');
        } else if (data.error === 'GIBBERISH_CONTENT') {
          setFileError('The file contains unreadable or gibberish content. Please upload a document with valid research text.');
        } else if (data.error === 'PDF_PARSE_FAILED') {
          setFileError('Could not read this PDF. The file may be password-protected, corrupted, or a scanned image. Try saving it again from Word using "Save as PDF".');
        } else if (data.error === 'FILE_TOO_LARGE') {
          setFileError('File exceeds the 30 MB limit. Please upload a smaller file.');
        } else {
          setFileError(data.error || 'Failed to extract text. Please try again.');
        }
        setStep('upload');
        return;
      }

      const { text } = await resp.json();
      setAbstractText(text);
      setProgress(90);

      const accurateWordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const analysis = await analyzeAbstract(text);
      setProgress(97);

      // Index in own-ai (best-effort, does not block if own-ai is offline)
      try {
        await fetch('/api/ai/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, source: file.name }),
        });
        setAiIndexed(true);
      } catch {
        // own-ai offline — silent
      }

      setProgress(100);
      setResults({ ...analysis, wordCount: accurateWordCount });
      if (!projectTitle) setProjectTitle(file.name.replace(/\.[^.]+$/, ''));
      setStep('result');
    } catch (err: any) {
      clearInterval(interval);
      setFileError('Something went wrong while processing your file. Please try again.');
      setStep('upload');
    }
  };

  const processFolderFiles = async (files: FileList) => {
    setStep('processing');
    setProgress(10);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));

    try {
      const resp = await fetch('/api/upload/folder', { method: 'POST', body: formData });
      setProgress(70);
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setFileError(d.error || 'Folder upload failed.');
        setStep('upload');
        return;
      }
      const data = await resp.json();
      setFolderResults(data.results ?? []);
      setAiIndexed(data.filesIndexed > 0);

      // Use combined text as abstract text if no abstract is set yet
      if (data.combinedText && !abstractText) {
        setAbstractText(data.combinedText);
        const analysis = await analyzeAbstract(data.combinedText).catch(() => null);
        const wordCount = data.combinedText.trim().split(/\s+/).filter(Boolean).length;
        setResults(analysis ? { ...analysis, wordCount } : { wordCount, keyTopics: [], technicalTermsCount: 0, summary: '', methodologyDetails: '' });
      }
      setProgress(100);
      setStep('result');
    } catch {
      setFileError('Something went wrong uploading the folder. Please try again.');
      setStep('upload');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const error = validateFile(file);
    if (error) {
      setFileError(error);
      setSelectedFile(null);
      return;
    }

    setFileError(null);
    setSelectedFile(file);
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      setFileError(error);
      setSelectedFile(null);
      return;
    }

    setFileError(null);
    setSelectedFile(file);
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {onNavigate && (
        <header className="mx-4 md:mx-6 mt-4 md:mt-6 bg-slate-950 text-white px-4 md:px-6 py-4 rounded-2xl border border-white/10 shadow-lg shadow-black/20 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight uppercase block leading-none">Defensa</span>
              <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Student Hub</span>
            </div>
          </div>

          <nav className="flex items-center justify-center gap-2 flex-wrap flex-grow">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-colors text-slate-400 dark:text-slate-500 hover:text-white"
              >
                <item.icon className="w-5 h-5" /> {item.label}
              </button>
            ))}
          </nav>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2.5 text-slate-400 dark:text-slate-500 hover:text-white transition-colors font-bold text-sm shrink-0"
            >
              <LogOut className="w-5 h-5" /> Logout
            </button>
          )}
        </header>
      )}

      <div className="max-w-3xl mx-auto w-full p-4 md:p-10">

        {onBack && step !== 'processing' && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors font-bold text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        )}

        {step === 'upload' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 shadow-sm border border-slate-200 dark:border-slate-800 text-center">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">Upload Your Documents</h1>
              <p className="text-slate-500 dark:text-slate-400">
                {project
                  ? <>Project: <span className="font-bold text-slate-800 dark:text-slate-100">{project.title}</span></>
                  : 'Upload your manuscript or thesis to set up your project profile automatically.'}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2 justify-center mb-8">
              {(['single', 'folder'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setUploadMode(mode); setFileError(null); }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    uploadMode === mode
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {mode === 'single' ? <FileText className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                  {mode === 'single' ? 'Manuscript File' : 'Thesis Folder'}
                </button>
              ))}
            </div>

            {fileError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-2xl text-left text-red-700 dark:text-red-300 text-sm mb-6">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
                <p className="flex-1">{fileError}</p>
                <button
                  type="button"
                  onClick={() => setFileError(null)}
                  className="text-red-400 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Dismiss error"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div
              className={`border-2 border-dashed rounded-3xl p-16 transition-all cursor-pointer group ${
                fileError
                  ? 'border-red-300 bg-red-50 dark:bg-red-500/10 hover:border-red-400'
                  : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'
              }`}
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={inputRef}
                type="file"
                id="abstract-file-upload"
                aria-label="Upload manuscript file (PDF or DOCX)"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 transition-all ${
                fileError ? 'bg-red-100 dark:bg-red-500/20 text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 group-hover:text-blue-600'
              }`}>
                {fileError ? <AlertCircle className="w-10 h-10" /> : <Upload className="w-10 h-10" />}
              </div>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Drag & drop your manuscript here</p>
              <p className="text-slate-500 dark:text-slate-400 mb-6">or <span className="text-blue-600 font-bold underline">Browse Files</span></p>

              <div className="flex flex-wrap justify-center gap-4 text-xs font-semibold text-slate-400 dark:text-slate-500">
                <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> PDF only
                </span>
                <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" /> DOCX only
                </span>
                <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">MAX 30 MB</span>
              </div>
            </div>

            {/* Folder upload area — shown when folder mode is active */}
            {uploadMode === 'folder' && (
              <div className="mt-6">
                <input
                  ref={folderInputRef}
                  type="file"
                  id="folder-upload"
                  aria-label="Upload thesis folder"
                  className="hidden"
                  multiple
                  // @ts-ignore — webkitdirectory is non-standard but widely supported
                  webkitdirectory=""
                  accept=".pdf,.docx"
                  onChange={e => {
                    if (e.target.files?.length) processFolderFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <div
                  className="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-3xl p-14 cursor-pointer transition-all bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-center"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderOpen className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Select your thesis folder</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">All PDF and DOCX files inside will be indexed by Defensa AI</p>
                  <span className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl">Browse Folder</span>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">This uploads your entire thesis — chapters, methodology, results — so the AI can ask precise questions from any section.</p>
              </div>
            )}

            <div className="mt-8 flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-left text-blue-800 dark:text-blue-200 text-sm">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
              {uploadMode === 'single'
                ? <p>Upload your manuscript as a <strong>PDF</strong> or <strong>Word (.docx)</strong> file. Other formats like TXT, images, or scanned PDFs are not supported.</p>
                : <p>Select a folder containing your thesis chapters. The AI will index all PDF and DOCX files it finds and use them to generate questions during your session.</p>
              }
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 shadow-sm border border-slate-200 dark:border-slate-800 text-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Processing Your Manuscript...</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10">Extracting and analyzing key research components</p>

            <div className="space-y-4 text-left mb-10 max-w-md mx-auto">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-slate-700 dark:text-slate-300">File validated and uploaded</span>
              </div>
              <div className="flex items-center gap-3">
                {progress > 40 ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                <span className={progress > 40 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>Extracting text content</span>
              </div>
              <div className="flex items-center gap-3">
                {progress > 70 ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                <span className={progress > 70 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>Identifying research methodology</span>
              </div>
              <div className="flex items-center gap-3">
                {progress > 95 ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                <span className={progress > 95 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>Analyzing technical keywords</span>
              </div>
              <div className="flex items-center gap-3">
                {progress >= 100 ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                <span className={progress >= 100 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>
                  Indexing in <span className="font-bold text-blue-600">Defensa AI</span>
                </span>
              </div>
            </div>

            <div className="relative max-w-md mx-auto">
              <div className="flex mb-2 items-center justify-between">
                <span className="text-xs font-semibold py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-100 dark:bg-blue-500/20">Analysis Progress</span>
                <span className="text-xs font-semibold text-blue-600">{progress}%</span>
              </div>
              <div className="overflow-hidden h-2 rounded bg-blue-100 dark:bg-blue-500/20">
                <div
                  className={`h-full bg-blue-600 transition-all duration-300 ${
                    progress >= 100 ? 'w-full' :
                    progress >= 95  ? 'w-[95%]' :
                    progress >= 90  ? 'w-[90%]' :
                    progress >= 80  ? 'w-[80%]' :
                    progress >= 70  ? 'w-[70%]' :
                    progress >= 60  ? 'w-[60%]' :
                    progress >= 50  ? 'w-[50%]' :
                    progress >= 40  ? 'w-[40%]' :
                    progress >= 30  ? 'w-[30%]' :
                    progress >= 20  ? 'w-[20%]' :
                    progress >= 10  ? 'w-[10%]' : 'w-[5%]'
                  }`}
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">This usually takes 15–30 seconds</p>
            </div>
          </div>
        )}

        {step === 'result' && results && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                {folderResults.length > 0 ? 'Thesis Indexed!' : 'Manuscript Analyzed!'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">We've extracted the following details from your research.</p>

              {/* Own-AI status badge */}
              <div className={`inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full text-sm font-bold ${
                aiIndexed
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800'
              }`}>
                <Sparkles className="w-4 h-4" />
                {aiIndexed ? 'Defensa AI — document indexed' : 'Defensa AI — offline (using cloud AI)'}
              </div>

              {/* Folder results summary */}
              {folderResults.length > 0 && (
                <div className="mt-4 text-left max-w-md mx-auto space-y-1">
                  {folderResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg ${
                      r.status === 'indexed' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500'
                    }`}>
                      {r.status === 'indexed' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      <span className="truncate">{r.file}</span>
                      <span className="ml-auto shrink-0">{r.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-8">
              <label htmlFor="project-name-input" className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Name Your Project *</label>
              <div className="relative">
                <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input
                  id="project-name-input"
                  type="text"
                  className={`w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-950 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold ${titleError ? 'border-red-400' : 'border-slate-200 dark:border-slate-800'}`}
                  placeholder="e.g. AI-Powered Viva Simulator"
                  value={projectTitle}
                  onChange={(e) => { setProjectTitle(e.target.value); if (titleError) setTitleError(null); }}
                />
              </div>
              {titleError && <p className="mt-1 text-xs text-red-500 font-semibold">{titleError}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Word Count</p>
                {results.wordCount > 0 ? (
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{results.wordCount} words</p>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-sm">Not available</p>
                )}
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Technical Terms</p>
                {results.technicalTermsCount > 0 ? (
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{results.technicalTermsCount} identified</p>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-sm">None detected</p>
                )}
              </div>

              <div className="md:col-span-2 p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Key Topics Identified</p>
                {results.keyTopics && results.keyTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {results.keyTopics.map((topic: string, i: number) => (
                      <span key={i} className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500 text-sm">No topics could be identified from this manuscript.</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!projectTitle.trim()) {
                  setTitleError('Please name your project before continuing.');
                  return;
                }
                onComplete({
                  ...(project ?? {}),
                  title: projectTitle.trim(),
                  abstractText,
                  analysisResults: results,
                });
              }}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition-all"
            >
              Finish Setup & Start Practice
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AbstractUploadView;
