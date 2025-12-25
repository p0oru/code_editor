// ============================================
// Header Component - Navigation & Controls
// ============================================

import { Play, Loader2, ChevronDown, Zap } from 'lucide-react';
import type { Language } from '../types/api';
import { LANGUAGES } from '../types/api';

interface HeaderProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onRun: () => void;
  isSubmitting: boolean;
  isConnected: boolean;
}

export function Header({ language, onLanguageChange, onRun, isSubmitting, isConnected }: HeaderProps) {
  const currentLang = LANGUAGES.find((l) => l.id === language);

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border-color">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-purple flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary">RCE Engine</h1>
            <p className="text-xs text-text-muted hidden sm:block">Remote Code Execution</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Connection Status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-tertiary">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-success' : 'bg-accent-error'}`} />
          <span className="text-xs text-text-secondary">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Language Selector */}
        <div className="relative group">
          <button
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary border border-border-color hover:border-accent-primary transition-colors"
            disabled={isSubmitting}
          >
            <span className="text-lg">{currentLang?.icon}</span>
            <span className="text-sm font-medium text-text-primary hidden sm:inline">
              {currentLang?.name}
            </span>
            <ChevronDown className="w-4 h-4 text-text-secondary" />
          </button>
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-bg-tertiary border border-border-color rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => onLanguageChange(lang.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-card transition-colors ${
                  lang.id === language ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-primary'
                }`}
              >
                <span className="text-lg">{lang.icon}</span>
                <span className="text-sm font-medium">{lang.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <button
          onClick={onRun}
          disabled={isSubmitting}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            isSubmitting
              ? 'bg-accent-primary/50 text-white/70 cursor-not-allowed'
              : 'bg-accent-success hover:bg-accent-success/90 text-white shadow-lg shadow-accent-success/25 hover:shadow-accent-success/40'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Running...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Run Code</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}

