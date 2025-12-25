// ============================================
// AnalysisPanel Component - Code Analysis Display
// ============================================

import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle, Clock, Code, Repeat, GitBranch, FileCode } from 'lucide-react';
import type { AnalysisReport, RiskLevel } from '../types/api';

interface AnalysisPanelProps {
  report: AnalysisReport | null | undefined;
  isLoading: boolean;
}

export function AnalysisPanel({ report, isLoading }: AnalysisPanelProps) {
  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-bg-secondary rounded-lg border border-border-color overflow-hidden">
        <PanelHeader score={null} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Analyzing code...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="h-full flex flex-col bg-bg-secondary rounded-lg border border-border-color overflow-hidden">
        <PanelHeader score={null} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-text-muted">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Analysis report will appear here</p>
            <p className="text-xs mt-1">after code execution</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-secondary rounded-lg border border-border-color overflow-hidden">
      <PanelHeader score={report.score} complexity={report.complexity} />
      
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Score Card */}
        <ScoreCard score={report.score} complexity={report.complexity} />
        
        {/* Metrics */}
        {report.metrics && Object.keys(report.metrics).length > 0 && (
          <MetricsCard metrics={report.metrics} />
        )}
        
        {/* Risks */}
        {report.risks && report.risks.length > 0 && (
          <RisksCard risks={report.risks} />
        )}
        
        {/* Suggestions */}
        {report.suggestions && report.suggestions.length > 0 && (
          <SuggestionsCard suggestions={report.suggestions} />
        )}
        
        {/* Analysis Time */}
        {report.analysisTimeMs && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Clock className="w-3 h-3" />
            <span>Analyzed in {report.analysisTimeMs.toFixed(1)}ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHeader({ score, complexity }: { score: number | null; complexity?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border-color">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-accent-purple" />
        <span className="text-sm font-medium text-text-primary">Analysis</span>
      </div>
      {score !== null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{complexity}</span>
          <ScoreBadge score={score} />
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = () => {
    if (score >= 80) return 'bg-accent-success/20 text-accent-success';
    if (score >= 60) return 'bg-accent-warning/20 text-accent-warning';
    return 'bg-accent-error/20 text-accent-error';
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getScoreColor()}`}>
      {score}/100
    </span>
  );
}

function ScoreCard({ score, complexity }: { score: number; complexity: string }) {
  const getScoreGradient = () => {
    if (score >= 80) return 'from-accent-success/20 to-accent-success/5';
    if (score >= 60) return 'from-accent-warning/20 to-accent-warning/5';
    return 'from-accent-error/20 to-accent-error/5';
  };

  const getScoreIcon = () => {
    if (score >= 80) return <CheckCircle className="w-5 h-5 text-accent-success" />;
    if (score >= 60) return <AlertTriangle className="w-5 h-5 text-accent-warning" />;
    return <AlertCircle className="w-5 h-5 text-accent-error" />;
  };

  return (
    <div className={`rounded-lg p-3 bg-gradient-to-r ${getScoreGradient()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getScoreIcon()}
          <div>
            <div className="text-2xl font-bold text-text-primary">{score}</div>
            <div className="text-xs text-text-secondary">Security Score</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-text-primary">{complexity}</div>
          <div className="text-xs text-text-secondary">Complexity</div>
        </div>
      </div>
    </div>
  );
}

function MetricsCard({ metrics }: { metrics: Record<string, number> }) {
  const metricIcons: Record<string, React.ReactNode> = {
    functions: <Code className="w-3.5 h-3.5" />,
    classes: <FileCode className="w-3.5 h-3.5" />,
    loops: <Repeat className="w-3.5 h-3.5" />,
    conditionals: <GitBranch className="w-3.5 h-3.5" />,
    lines_of_code: <FileCode className="w-3.5 h-3.5" />,
  };

  const metricLabels: Record<string, string> = {
    functions: 'Functions',
    classes: 'Classes',
    loops: 'Loops',
    conditionals: 'Conditionals',
    imports: 'Imports',
    try_blocks: 'Try Blocks',
    lines_of_code: 'Lines',
  };

  return (
    <div className="rounded-lg bg-bg-tertiary p-3">
      <h4 className="text-xs font-medium text-text-secondary mb-2">Code Metrics</h4>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-text-muted">
              {metricIcons[key] || <Code className="w-3.5 h-3.5" />}
            </span>
            <span className="text-xs text-text-secondary">{metricLabels[key] || key}:</span>
            <span className="text-xs font-medium text-text-primary">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RisksCard({ risks }: { risks: Array<{ type: string; message: string; level: RiskLevel; line: number }> }) {
  const getRiskIcon = (level: RiskLevel) => {
    switch (level) {
      case 'critical':
        return <AlertCircle className="w-3.5 h-3.5 text-accent-error" />;
      case 'high':
        return <AlertTriangle className="w-3.5 h-3.5 text-accent-error" />;
      case 'medium':
        return <AlertTriangle className="w-3.5 h-3.5 text-accent-warning" />;
      case 'low':
        return <Info className="w-3.5 h-3.5 text-accent-primary" />;
      default:
        return <Info className="w-3.5 h-3.5 text-text-muted" />;
    }
  };

  const getRiskColor = (level: RiskLevel) => {
    switch (level) {
      case 'critical':
      case 'high':
        return 'border-l-accent-error bg-accent-error/5';
      case 'medium':
        return 'border-l-accent-warning bg-accent-warning/5';
      case 'low':
        return 'border-l-accent-primary bg-accent-primary/5';
      default:
        return 'border-l-text-muted bg-bg-tertiary';
    }
  };

  return (
    <div className="rounded-lg bg-bg-tertiary p-3">
      <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-accent-warning" />
        Risks Found ({risks.length})
      </h4>
      <div className="space-y-2 max-h-40 overflow-auto">
        {risks.map((risk, index) => (
          <div
            key={index}
            className={`border-l-2 pl-2 py-1 rounded-r ${getRiskColor(risk.level)}`}
          >
            <div className="flex items-start gap-1.5">
              {getRiskIcon(risk.level)}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-primary break-words">{risk.message}</div>
                {risk.line > 0 && (
                  <div className="text-xs text-text-muted mt-0.5">Line {risk.line}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuggestionsCard({ suggestions }: { suggestions: string[] }) {
  return (
    <div className="rounded-lg bg-bg-tertiary p-3">
      <h4 className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-accent-primary" />
        Suggestions
      </h4>
      <ul className="space-y-1.5">
        {suggestions.map((suggestion, index) => (
          <li key={index} className="text-xs text-text-secondary flex items-start gap-1.5">
            <span className="text-accent-primary mt-0.5">•</span>
            <span>{suggestion}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

