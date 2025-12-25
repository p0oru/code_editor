// ============================================
// Workspace Component - Main Editor Layout
// ============================================
// This component manages the state for:
// - Current code in the editor
// - Selected language
// - Execution results and status
// - Analysis reports from Python worker
// - Polling mechanism for job completion
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { CodeEditor } from './CodeEditor';
import { Terminal } from './Terminal';
import { Header } from './Header';
import { AnalysisPanel } from './AnalysisPanel';
import { submitCode, pollJobStatus, checkHealth } from '../services/api';
import type { Language, JobStatus, StatusResponse, AnalysisReport } from '../types/api';
import { LANGUAGES } from '../types/api';

export function Workspace() {
  // ============================================
  // State Management
  // ============================================
  
  // Editor state
  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState<string>(LANGUAGES[0].defaultCode);
  
  // Execution state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  
  // Result state
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [output, setOutput] = useState('');
  const [executionTime, setExecutionTime] = useState(0);
  const [error, setError] = useState('');
  
  // Analysis state
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);

  // Ref to store cleanup function for polling
  const cleanupPollingRef = useRef<(() => void) | null>(null);

  // ============================================
  // Health Check
  // ============================================
  
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await checkHealth();
        setIsConnected(true);
      } catch {
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  // ============================================
  // Language Change Handler
  // ============================================
  
  const handleLanguageChange = useCallback((newLanguage: Language) => {
    setLanguage(newLanguage);
    // Set default code for the new language
    const langConfig = LANGUAGES.find((l) => l.id === newLanguage);
    if (langConfig) {
      setCode(langConfig.defaultCode);
    }
    // Clear previous results
    setStatus(null);
    setOutput('');
    setError('');
    setExecutionTime(0);
    setAnalysisReport(null);
  }, []);

  // ============================================
  // Run Code Handler
  // ============================================
  
  const handleRun = useCallback(async () => {
    // Cleanup any existing polling
    if (cleanupPollingRef.current) {
      cleanupPollingRef.current();
      cleanupPollingRef.current = null;
    }

    // Reset state
    setIsSubmitting(true);
    setIsPolling(false);
    setStatus(null);
    setOutput('');
    setError('');
    setExecutionTime(0);
    setCurrentJobId(null);
    setAnalysisReport(null);
    setIsAnalyzing(false);

    try {
      // Submit the code
      const response = await submitCode(language, code);
      
      setCurrentJobId(response.jobId);
      setStatus(response.status);
      setIsPolling(true);

      // Start polling for results
      const cleanup = pollJobStatus(
        response.jobId,
        // On status update
        (statusResponse: StatusResponse) => {
          setStatus(statusResponse.status);
          setOutput(statusResponse.output);
          setExecutionTime(statusResponse.executionTime);
          setError(statusResponse.error);
          
          // Check for analysis report
          if (statusResponse.analysisReport) {
            setAnalysisReport(statusResponse.analysisReport);
            setIsAnalyzing(false);
          } else if (['completed', 'failed', 'timeout'].includes(statusResponse.status)) {
            // Execution done but analysis not ready yet
            setIsAnalyzing(true);
          }

          // Stop polling indicator if job is complete AND we have analysis
          if (['completed', 'failed', 'timeout'].includes(statusResponse.status)) {
            setIsPolling(false);
            setIsSubmitting(false);
            
            // If no analysis report yet, it's still being processed
            if (!statusResponse.analysisReport) {
              setIsAnalyzing(true);
            }
          }
        },
        // On error
        (err: Error) => {
          setError(err.message);
          setStatus('failed');
          setIsPolling(false);
          setIsSubmitting(false);
          setIsAnalyzing(false);
        },
        1000, // Poll every 1 second
        90    // Max 90 attempts (1.5 minutes) - extra time for analysis
      );

      cleanupPollingRef.current = cleanup;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit code');
      setStatus('failed');
      setIsSubmitting(false);
      setIsAnalyzing(false);
    }
  }, [language, code]);

  // ============================================
  // Cleanup on unmount
  // ============================================
  
  useEffect(() => {
    return () => {
      if (cleanupPollingRef.current) {
        cleanupPollingRef.current();
      }
    };
  }, []);

  // ============================================
  // Render
  // ============================================
  
  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Header with controls */}
      <Header
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        isSubmitting={isSubmitting}
        isConnected={isConnected}
      />

      {/* Main Content - Three-panel View */}
      <main className="flex-1 flex flex-col lg:flex-row gap-1 p-1 overflow-hidden">
        {/* Code Editor Panel */}
        <div className="flex-1 min-h-0 lg:min-h-full lg:w-[50%]">
          <div className="h-full flex flex-col">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border-color rounded-t-lg">
              <div className="flex items-center gap-2">
                {/* Window controls (decorative) */}
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-accent-error/80" />
                  <div className="w-3 h-3 rounded-full bg-accent-warning/80" />
                  <div className="w-3 h-3 rounded-full bg-accent-success/80" />
                </div>
                <span className="ml-2 text-sm text-text-secondary font-mono">
                  main.{language === 'python' ? 'py' : 'js'}
                </span>
              </div>
              {currentJobId && (
                <span className="text-xs text-text-muted font-mono">
                  Job: {currentJobId.slice(0, 8)}...
                </span>
              )}
            </div>
            
            {/* Monaco Editor */}
            <div className="flex-1 bg-bg-secondary rounded-b-lg overflow-hidden">
              <CodeEditor
                language={language}
                code={code}
                onChange={setCode}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Right Panel Container - Terminal + Analysis */}
        <div className="h-[400px] lg:h-full lg:w-[50%] flex flex-col lg:flex-col gap-1 min-w-0">
          {/* Terminal Panel */}
          <div className="flex-1 min-h-0 lg:h-[60%]">
            <Terminal
              output={output}
              status={status}
              executionTime={executionTime}
              error={error}
              isPolling={isPolling}
            />
          </div>
          
          {/* Analysis Panel */}
          <div className="h-[200px] lg:h-[40%] min-h-0">
            <AnalysisPanel
              report={analysisReport}
              isLoading={isAnalyzing}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 py-2 bg-bg-secondary border-t border-border-color">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span>Stage 4: Analysis Pipeline</span>
            <span>•</span>
            <span>Python 3.9 | Node.js 18</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Memory: 128MB</span>
            <span>•</span>
            <span>Timeout: 5s</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
