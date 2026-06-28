'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  Upload, 
  MessageSquare, 
  Play, 
  Pause, 
  Square, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  FileSpreadsheet, 
  RefreshCw, 
  LogOut, 
  Users, 
  Sparkles,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';

interface Contact {
  name: string;
  phone: string;
}

interface LogEntry {
  timestamp: string;
  phone: string;
  name: string;
  status: 'success' | 'failed' | 'pending' | 'info';
  message?: string;
}

interface ServerState {
  state: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'AUTHENTICATING' | 'AUTHENTICATED' | 'READY' | 'FAILURE';
  qrCode: string;
  errorMsg: string;
  delayCountdown: { seconds: number; nextContactName: string } | null;
  job: {
    status: 'idle' | 'sending' | 'paused' | 'completed' | 'stopped';
    currentIndex: number;
    totalContacts: number;
    contacts: Contact[];
    template: string;
    successCount: number;
    failedCount: number;
    logs: LogEntry[];
  };
}

export default function Home() {
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [template, setTemplate] = useState<string>("Hello {name}, your special discount code is discount10!");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);


  // Connect to SSE status stream
  useEffect(() => {
    const eventSource = new EventSource('/api/whatsapp/status');
    
    eventSource.onmessage = (event) => {
      try {
        const data: ServerState = JSON.parse(event.data);
        setServerState(data);
        
        // If a campaign was already running on the server, load the contacts & template
        if (data.job && data.job.status !== 'idle' && contacts.length === 0) {
          setContacts(data.job.contacts || []);
          if (data.job.template) {
            setTemplate(data.job.template);
          }
        }
      } catch (e) {
        console.error("Failed to parse SSE message:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, [contacts.length]);



  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsUploading(true);
    setUploadError(null);
    setSendError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/parse-contacts', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setContacts(data.contacts);
      } else {
        setUploadError(data.error || 'Failed to parse the file');
        setContacts([]);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Error occurred while uploading');
      setContacts([]);
    } finally {
      setIsUploading(false);
    }
  };

  // Actions
  const startCampaign = async () => {
    if (contacts.length === 0) {
      alert("Please upload a contact list first.");
      return;
    }
    if (!template.trim()) {
      alert("Please enter a message template.");
      return;
    }
    setSendError(null);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts, template })
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || 'Failed to start campaign');
      }
    } catch (err: any) {
      setSendError(err.message || 'An error occurred');
    }
  };

  const controlCampaign = async (action: 'pause' | 'resume' | 'stop' | 'logout' | 'reconnect') => {
    setSendError(null);
    try {
      const res = await fetch('/api/whatsapp/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || `Failed to perform action: ${action}`);
      }
    } catch (err: any) {
      setSendError(err.message || 'An error occurred');
    }
  };

  // Status mapping
  const getStatusDetails = () => {
    const s = serverState?.state || 'DISCONNECTED';
    switch (s) {
      case 'READY':
        return { label: 'Linked', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
      case 'QR_READY':
        return { label: 'Scan Required', color: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
      case 'CONNECTING':
      case 'AUTHENTICATING':
        return { label: 'Connecting...', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25' };
      case 'FAILURE':
        return { label: 'Connection Error', color: 'bg-rose-500/10 text-rose-400 border-rose-500/25' };
      default:
        return { label: 'Disconnected', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
    }
  };

  const statusInfo = getStatusDetails();

  // Progress computations
  const total = serverState?.job?.totalContacts || contacts.length || 0;
  const currentIdx = serverState?.job?.currentIndex || 0;
  const successCount = serverState?.job?.successCount || 0;
  const failedCount = serverState?.job?.failedCount || 0;
  const isJobRunning = serverState?.job?.status === 'sending';
  const isJobPaused = serverState?.job?.status === 'paused';
  const isJobActive = isJobRunning || isJobPaused;
  const progressPercent = total > 0 ? Math.round((currentIdx / total) * 100) : 0;

  // Personalized preview message
  const getPreviewMessage = () => {
    if (!template) return "Write your template in the Campaign Designer...";
    const sampleName = contacts.length > 0 ? contacts[0].name : "Alice Watson";
    return template.replace(/{name}/gi, sampleName);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
              WhatsApp Broadcast Studio
            </h1>
            <p className="text-xs text-zinc-400 font-mono">Automated, anti-ban contact messaging</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${statusInfo.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${serverState?.state === 'READY' ? 'bg-emerald-400 animate-ping' : 'bg-current'}`} />
            {statusInfo.label}
          </div>
          {serverState?.state === 'READY' && (
            <button
              onClick={() => controlCampaign('logout')}
              className="text-zinc-400 hover:text-rose-400 text-xs flex items-center gap-1 transition-colors font-semibold"
              title="Log out session"
            >
              <LogOut className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          )}
          {(serverState?.state === 'DISCONNECTED' || serverState?.state === 'FAILURE') && (
            <button
              onClick={() => controlCampaign('reconnect')}
              className="text-zinc-400 hover:text-emerald-400 text-xs flex items-center gap-1 transition-colors font-semibold"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Link</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column - Configuration (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Panel 1: WhatsApp Authentication Linker */}
          <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -z-10" />
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
              <QrCode className="w-4 h-4 text-emerald-400" />
              WhatsApp Authentication
            </h2>

            {/* Connecting State */}
            {(serverState?.state === 'CONNECTING' || serverState?.state === 'AUTHENTICATING') && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
                <p className="text-sm font-medium text-zinc-300">Spinning up WhatsApp client...</p>
                <p className="text-xs text-zinc-500 mt-1 font-mono">Starting headless browser session on host</p>
              </div>
            )}

            {/* QR Code State */}
            {serverState?.state === 'QR_READY' && (
              <div className="flex flex-col items-center justify-center text-center">
                <p className="text-sm text-zinc-300 mb-4 font-medium">Scan this QR code with WhatsApp Link Device</p>
                <div className="p-3 bg-white rounded-xl shadow-lg border border-zinc-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={serverState.qrCode} 
                    alt="WhatsApp QR Code" 
                    className="w-48 h-48 block"
                  />
                </div>
                <div className="mt-4 text-xs text-zinc-500 max-w-xs space-y-1 font-mono">
                  <p>1. Open WhatsApp on your phone</p>
                  <p>2. Tap Menu or Settings &gt; Linked Devices</p>
                  <p>3. Tap Link a Device and point phone here</p>
                </div>
              </div>
            )}

            {/* Ready State */}
            {serverState?.state === 'READY' && (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-emerald-950/10 border border-emerald-500/10 rounded-xl p-5">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-zinc-200">Session Securely Linked</p>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  Your WhatsApp account is connected. Credentials are cached in your local environment.
                </p>
              </div>
            )}

            {/* Disconnected / Initial State */}
            {serverState?.state === 'DISCONNECTED' && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin mb-4" />
                <p className="text-sm font-medium text-zinc-400">Client is idle. Waking up browser...</p>
              </div>
            )}

            {/* Failure State */}
            {serverState?.state === 'FAILURE' && (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-rose-950/15 border border-rose-500/15 rounded-xl p-5">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
                  <XCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-rose-300">Connection Failed</p>
                <p className="text-xs text-rose-400/80 mt-1 break-all px-2 font-mono">
                  {serverState.errorMsg || 'Failed to start browser instance.'}
                </p>
                <button
                  onClick={() => controlCampaign('reconnect')}
                  className="mt-4 px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Restart Browser
                </button>
              </div>
            )}
          </section>

          {/* Panel 2: List Importer */}
          <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Upload className="w-4 h-4 text-emerald-400" />
                Upload Contacts
              </h2>
              <a 
                href="/contacts_demo.csv" 
                download
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold font-mono flex items-center gap-1 transition-colors"
              >
                Download Demo CSV
              </a>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border border-dashed rounded-xl p-6 transition-all text-center flex flex-col items-center justify-center gap-2 cursor-pointer ${
                dragActive 
                  ? 'border-emerald-500 bg-emerald-500/5' 
                  : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/20'
              }`}
              onClick={() => document.getElementById('file-upload-input')?.click()}
            >
              <input
                id="file-upload-input"
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="w-10 h-10 rounded-lg bg-zinc-900/50 flex items-center justify-center text-zinc-400">
                {isUploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                ) : (
                  <FileSpreadsheet className="w-5 h-5 text-zinc-300" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {file ? file.name : "Drag & drop file here"}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 font-mono">Supports CSV or XLSX spreadsheet</p>
              </div>
              <button 
                type="button" 
                className="mt-2 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-800 transition-colors"
              >
                Browse Files
              </button>
            </div>

            {uploadError && (
              <div className="mt-3 flex items-start gap-2 bg-rose-950/15 border border-rose-500/15 rounded-lg p-3 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Parsed Contacts Summary */}
            {contacts.length > 0 && (
              <div className="mt-4 border border-zinc-900 bg-zinc-950/20 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
                    <Users className="w-3.5 h-3.5 text-zinc-500" />
                    Contacts Loaded
                  </span>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono">
                    {contacts.length} rows
                  </span>
                </div>
                
                {/* Mini Preview Table */}
                <div className="max-h-24 overflow-y-auto border-t border-zinc-900 mt-2 text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-zinc-500 font-semibold border-b border-zinc-900">
                        <th className="py-1 px-2">Name</th>
                        <th className="py-1 px-2 text-right">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 font-mono text-[10px]">
                      {contacts.slice(0, 3).map((c, i) => (
                        <tr key={i} className="text-zinc-400">
                          <td className="py-1 px-2 font-sans">{c.name}</td>
                          <td className="py-1 px-2 text-right">{c.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {contacts.length > 3 && (
                    <div className="text-[10px] text-zinc-500 text-center py-1 bg-zinc-950/10 font-mono">
                      + {contacts.length - 3} more contacts
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Panel 3: Message Template & Preview */}
          <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Campaign Designer
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex justify-between font-mono">
                  <span>Template Message</span>
                  <span className="text-emerald-400/80 font-normal">Use `{"{name}"}` for variable</span>
                </label>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  disabled={isJobRunning}
                  placeholder="Hello {name}, your appointment is scheduled."
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-900 hover:border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none transition-all resize-none font-sans disabled:opacity-50"
                />
              </div>

              {/* Chat Bubble Preview */}
              <div>
                <span className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-mono">
                  Live Preview
                </span>
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.05),rgba(255,255,255,0))]">
                  <div className="max-w-[85%] bg-emerald-950/10 border border-emerald-500/10 text-zinc-200 text-xs rounded-2xl rounded-tl-none p-3 shadow-md relative leading-relaxed">
                    <span className="text-[10px] font-semibold text-emerald-400 block mb-1 font-mono">WhatsApp Chat</span>
                    {getPreviewMessage()}
                    <span className="text-[9px] text-zinc-500 block text-right mt-1.5 font-mono">12:00 PM</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column - Execution (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6 h-full">

          {/* Panel 4: Live Progress Console & Control Panel */}
          <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between flex-1 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 w-64 h-64 bg-emerald-500/3 rounded-full blur-3xl -z-10 -translate-x-1/2" />
            
            <div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Campaign Manager
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">Start, pause, and track messaging execution</p>
                </div>
                
                {/* Control Action Buttons */}
                <div className="flex items-center gap-2">
                  {!isJobActive ? (
                    <button
                      onClick={startCampaign}
                      disabled={contacts.length === 0 || serverState?.state !== 'READY'}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border-zinc-800 text-zinc-950 rounded-xl text-xs font-bold transition-all shadow-[0_4px_14px_rgba(16,185,129,0.3)] disabled:shadow-none flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start Campaign
                    </button>
                  ) : (
                    <>
                      {isJobRunning ? (
                        <button
                          onClick={() => controlCampaign('pause')}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          Pause
                        </button>
                      ) : (
                        <button
                          onClick={() => controlCampaign('resume')}
                          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Resume
                        </button>
                      )}
                      
                      <button
                        onClick={() => controlCampaign('stop')}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all border border-zinc-800 flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </div>

              {sendError && (
                <div className="mb-4 flex items-start gap-2 bg-rose-950/15 border border-rose-500/15 rounded-lg p-3 text-xs text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{sendError}</span>
                </div>
              )}

              {/* Anti-Ban Shield Alert */}
              {isJobRunning && (
                <div className="mb-4 flex items-start gap-3 bg-emerald-950/10 border border-emerald-500/10 rounded-xl p-3.5 text-xs text-emerald-300 leading-relaxed shadow-sm font-sans">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-emerald-300 font-mono">Anti-Ban Protection Engaged</span>
                    Every message runs a randomized <strong className="text-emerald-200">15 to 30 second delay</strong> to mimic human chat speed. Skipped numbers or drops are handled automatically.
                  </div>
                </div>
              )}

              {/* Progress Summary Cards */}
              <div className="grid grid-cols-4 gap-4 mb-6 font-mono">
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
                  <span className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Total</span>
                  <span className="text-lg font-bold text-zinc-200 mt-0.5 block">{total}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
                  <span className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Done</span>
                  <span className="text-lg font-bold text-zinc-200 mt-0.5 block">{currentIdx}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center bg-emerald-950/5 border-emerald-500/5">
                  <span className="block text-[10px] text-emerald-500/60 uppercase tracking-wider font-semibold">Success</span>
                  <span className="text-lg font-bold text-emerald-400 mt-0.5 block">{successCount}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center bg-rose-950/5 border-rose-500/5">
                  <span className="block text-[10px] text-rose-500/60 uppercase tracking-wider font-semibold">Failed</span>
                  <span className="text-lg font-bold text-rose-400 mt-0.5 block">{failedCount}</span>
                </div>
              </div>

              {/* Progress Bar Container */}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between items-center text-xs font-semibold text-zinc-400">
                  <span className="flex items-center gap-1.5 font-mono">
                    {serverState?.job?.status === 'sending' && (
                      <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    )}
                    Campaign Status: <span className="text-zinc-200 capitalize font-bold">{serverState?.job?.status || 'Idle'}</span>
                  </span>
                  <span className="font-mono">{progressPercent}%</span>
                </div>
                <div className="h-3 w-full bg-zinc-950 border border-zinc-900 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Active Wait Countdown */}
              {serverState?.delayCountdown && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl p-4 flex items-center justify-between mb-6 animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400 shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold font-mono">Anti-Ban Cooling Period</p>
                      <p className="text-[10px] text-amber-400/80 font-mono">Next contact: <strong className="text-amber-200">{serverState.delayCountdown.nextContactName}</strong></p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold font-mono text-amber-400">{serverState.delayCountdown.seconds}s</span>
                    <span className="block text-[9px] text-amber-500 font-semibold uppercase tracking-wider font-mono">Delay left</span>
                  </div>
                </div>
              )}
            </div>

            {/* Console Log Terminal */}
            <div className="flex flex-col flex-1 min-h-[250px] border border-zinc-900 bg-black/90 rounded-xl overflow-hidden shadow-inner">
              <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex justify-between items-center text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
                <span>Execution Logs Console</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Stream
                </span>
              </div>
              <div className="flex-1 p-4 font-mono text-xs overflow-y-auto max-h-[300px] space-y-2 select-text selection:bg-zinc-800 selection:text-white">
                {serverState?.job?.logs && serverState.job.logs.length > 0 ? (
                  serverState.job.logs.map((log, idx) => {
                    let textClass = 'text-zinc-500';
                    let statusLabel = '[INFO]';
                    if (log.status === 'success') {
                      textClass = 'text-emerald-400';
                      statusLabel = '[SUCCESS]';
                    } else if (log.status === 'failed') {
                      textClass = 'text-rose-400';
                      statusLabel = '[FAILED]';
                    } else if (log.status === 'pending') {
                      textClass = 'text-amber-400';
                      statusLabel = '[PENDING]';
                    }

                    return (
                      <div key={idx} className="flex gap-2 items-start text-[11px] leading-relaxed">
                        <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                        <span className={`${textClass} shrink-0 font-bold`}>{statusLabel}</span>
                        <span className="text-zinc-300">
                          {log.name ? `${log.name} (${log.phone}): ` : ''}
                          {log.message}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-zinc-700 text-center py-10 font-mono text-[11px]">
                    Console initialized. Logs will stream here when campaign begins.
                  </div>
                )}
              </div>
            </div>

          </section>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-4 px-6 text-center text-xs text-zinc-600 flex justify-between items-center font-mono">
        <span>© 2026 WhatsApp Automation Portal. All rights reserved.</span>
        <span className="flex items-center gap-1 text-[10px]">
          Headless Puppeteer Client | Anti-Ban Engaged
        </span>
      </footer>
    </div>
  );
}
