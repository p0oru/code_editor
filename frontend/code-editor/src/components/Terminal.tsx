// ============================================
// Terminal Component - Output Display
// ============================================

import { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { JobStatus } from '../types/api';

interface TerminalProps {
  output: string;
  status: JobStatus | null;
  executionTime: number;
  error: string;
  isPolling: boolean;
}

export function Terminal({ output, status, executionTime, error, isPolling }: TerminalProps) {
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  // Get status configuration
  const getStatusConfig = () => {
    switch (status) {
      case 'queued':
        return {
          icon: <Clock className="w-4 h-4" />,
          text: 'Queued',
          color: 'text-accent-warning',
          bgColor: 'bg-accent-warning/10',
        };
      case 'processing':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Running',
          color: 'text-accent-primary',
          bgColor: 'bg-accent-primary/10',
        };
      case 'completed':
        return {
          icon: <CheckCircle className="w-4 h-4" />,
          text: 'Completed',
          color: 'text-accent-success',
          bgColor: 'bg-accent-success/10',
        };
      case 'failed':
        return {
          icon: <XCircle className="w-4 h-4" />,
          text: 'Failed',
          color: 'text-accent-error',
          bgColor: 'bg-accent-error/10',
        };
      case 'timeout':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          text: 'Timeout',
          color: 'text-accent-warning',
          bgColor: 'bg-accent-warning/10',
        };
      default:
        return {
          icon: <TerminalIcon className="w-4 h-4" />,
          text: 'Ready',
          color: 'text-text-secondary',
          bgColor: 'bg-bg-tertiary',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const hasOutput = output || error;
  const isError = status === 'failed' || status === 'timeout';

  // Format execution time
  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary rounded-lg border border-border-color overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border-color">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Output</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Execution Time */}
          {executionTime > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTime(executionTime)}</span>
            </div>
          )}
          
          {/* Status Badge */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bgColor}`}>
            {statusConfig.icon}
            <span>{statusConfig.text}</span>
          </div>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-hidden">
        <pre
          ref={outputRef}
          className={`terminal-output h-full overflow-auto p-4 font-mono text-sm leading-relaxed ${
            isError ? 'text-accent-error' : 'text-text-primary'
          }`}
        >
          {/* Show polling indicator */}
          {isPolling && !hasOutput && (
            <div className="flex items-center gap-2 text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Waiting for execution...</span>
            </div>
          )}

          {/* Show placeholder when empty */}
          {!isPolling && !hasOutput && (
            <div className="text-text-muted">
              <span className="text-accent-success">$</span> Output will appear here after you run your code...
            </div>
          )}

          {/* Show output */}
          {output && (
            <code className="whitespace-pre-wrap break-words">{output}</code>
          )}

          {/* Show error */}
          {error && (
            <>
              {output && <div className="my-2 border-t border-border-color" />}
              <div className="text-accent-error">
                <span className="font-semibold">Error: </span>
                <code className="whitespace-pre-wrap break-words">{error}</code>
              </div>
            </>
          )}

          {/* Blinking cursor when idle */}
          {!isPolling && !hasOutput && (
            <span className="inline-block w-2 h-4 bg-accent-success ml-1 animate-pulse" />
          )}
        </pre>
      </div>
    </div>
  );
}

