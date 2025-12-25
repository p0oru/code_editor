// ============================================
// CodeEditor Component - Monaco Editor Wrapper
// ============================================

import Editor, { OnMount } from '@monaco-editor/react';
import type { Language } from '../types/api';
import { LANGUAGES } from '../types/api';

interface CodeEditorProps {
  language: Language;
  code: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeEditor({ language, code, onChange, disabled = false }: CodeEditorProps) {
  // Find the Monaco language identifier for the selected language
  const langConfig = LANGUAGES.find((l) => l.id === language);
  const monacoLanguage = langConfig?.monacoLanguage || 'plaintext';

  // Handle editor mount for additional configuration
  const handleEditorMount: OnMount = (editor, monaco) => {
    // Focus the editor
    editor.focus();

    // Add custom keybindings
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Prevent default save behavior
      console.log('Save command intercepted');
    });

    // Configure editor settings for optimal code editing
    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
      fontLigatures: true,
      lineHeight: 1.6,
      letterSpacing: 0.5,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      padding: { top: 16, bottom: 16 },
    });
  };

  return (
    <div className="h-full w-full bg-[#1e1e1e] rounded-lg overflow-hidden">
      <Editor
        height="100%"
        language={monacoLanguage}
        value={code}
        onChange={(value) => onChange(value || '')}
        theme="vs-dark"
        options={{
          // Appearance
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 3,
          
          // Behavior
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 4,
          insertSpaces: true,
          
          // Read-only when disabled
          readOnly: disabled,
          
          // UI
          renderLineHighlight: 'all',
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          
          // Suggest
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          
          // Accessibility
          accessibilitySupport: 'auto',
        }}
        onMount={handleEditorMount}
        loading={
          <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-text-secondary text-sm">Loading editor...</span>
            </div>
          </div>
        }
      />
    </div>
  );
}

