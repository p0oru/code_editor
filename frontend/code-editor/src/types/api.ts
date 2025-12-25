// ============================================
// API Types - Shared interfaces for frontend
// ============================================

export type Language = 'python' | 'javascript';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'timeout';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

// Risk item in analysis report
export interface AnalysisRisk {
  type: string;
  message: string;
  level: RiskLevel;
  line: number;
}

// Static code analysis report
export interface AnalysisReport {
  score: number; // 0-100
  complexity: string; // Low, Medium, High
  language: string;
  metrics: {
    functions?: number;
    classes?: number;
    loops?: number;
    conditionals?: number;
    imports?: number;
    lines_of_code?: number;
  };
  risks: AnalysisRisk[];
  suggestions: string[];
  analysisTimeMs?: number;
}

// Response from POST /submit
export interface SubmitResponse {
  success: boolean;
  message: string;
  jobId: string;
  status: JobStatus;
  submittedAt: string;
}

// Response from GET /status/:jobId
export interface StatusResponse {
  success: boolean;
  jobId: string;
  language: Language;
  status: JobStatus;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  output: string;
  executionTime: number; // in milliseconds
  exitCode?: number;
  error: string;
  analysisReport?: AnalysisReport;
  analyzedAt?: string;
}

// Health check response
export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
  connections: {
    redis: string;
    mongo: string;
  };
}

// Language configuration for the editor
export interface LanguageConfig {
  id: Language;
  name: string;
  icon: string;
  defaultCode: string;
  monacoLanguage: string;
}

// Available language configurations
export const LANGUAGES: LanguageConfig[] = [
  {
    id: 'python',
    name: 'Python',
    icon: '🐍',
    monacoLanguage: 'python',
    defaultCode: `# Python 3.9
# Write your code here

def main():
    result = sum(range(1, 101))
    print(f"Sum of 1-100: {result}")

if __name__ == "__main__":
    main()
`,
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    icon: '⚡',
    monacoLanguage: 'javascript',
    defaultCode: `// Node.js 18
// Write your code here

function main() {
    const numbers = Array.from({ length: 100 }, (_, i) => i + 1);
    const sum = numbers.reduce((a, b) => a + b, 0);
    console.log(\`Sum of 1-100: \${sum}\`);
}

main();
`,
  },
];

