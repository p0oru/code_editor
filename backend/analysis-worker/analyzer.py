# ============================================
# Code Analyzer Module
# ============================================
# Static code analysis for Python and JavaScript
# Uses AST for Python and regex patterns for JS
# ============================================

import ast
import re
from typing import List, Dict, Any
from dataclasses import dataclass, field, asdict
from enum import Enum


class RiskLevel(str, Enum):
    """Risk severity levels for code analysis"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Risk:
    """Represents a security or code quality risk"""
    type: str
    message: str
    level: RiskLevel
    line: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "message": self.message,
            "level": self.level.value,
            "line": self.line
        }


@dataclass
class AnalysisReport:
    """Complete analysis report for a code submission"""
    score: int = 100  # 0-100, higher is better
    complexity: str = "Low"  # Low, Medium, High
    language: str = ""
    metrics: Dict[str, int] = field(default_factory=dict)
    risks: List[Risk] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "complexity": self.complexity,
            "language": self.language,
            "metrics": self.metrics,
            "risks": [r.to_dict() for r in self.risks],
            "suggestions": self.suggestions
        }


# ============================================
# Python Analyzer
# ============================================

class PythonAnalyzer(ast.NodeVisitor):
    """
    Analyzes Python code using the AST module.
    Counts functions, loops, and identifies security risks.
    """
    
    # Dangerous functions/patterns in Python
    DANGEROUS_FUNCTIONS = {
        'eval': (RiskLevel.CRITICAL, "eval() can execute arbitrary code"),
        'exec': (RiskLevel.CRITICAL, "exec() can execute arbitrary code"),
        'compile': (RiskLevel.HIGH, "compile() can be used to execute dynamic code"),
        '__import__': (RiskLevel.HIGH, "Dynamic imports can be dangerous"),
        'input': (RiskLevel.LOW, "input() blocks execution"),
    }
    
    DANGEROUS_MODULES = {
        'os': ['system', 'popen', 'spawn', 'exec', 'remove', 'rmdir', 'unlink'],
        'subprocess': ['call', 'run', 'Popen', 'check_output', 'check_call'],
        'socket': ['socket', 'connect', 'bind', 'listen'],
        'requests': ['get', 'post', 'put', 'delete'],
        'urllib': ['urlopen', 'urlretrieve'],
        'shutil': ['rmtree', 'move', 'copy'],
        'pickle': ['load', 'loads'],
    }
    
    def __init__(self, code: str):
        self.code = code
        self.lines = code.split('\n')
        self.metrics = {
            'functions': 0,
            'classes': 0,
            'loops': 0,
            'conditionals': 0,
            'imports': 0,
            'try_blocks': 0,
            'lines_of_code': len([l for l in self.lines if l.strip() and not l.strip().startswith('#')]),
        }
        self.risks: List[Risk] = []
        self.imported_modules: Dict[str, str] = {}  # alias -> module name
        
    def analyze(self) -> AnalysisReport:
        """Perform complete analysis of the Python code"""
        try:
            tree = ast.parse(self.code)
            self.visit(tree)
        except SyntaxError as e:
            return AnalysisReport(
                score=0,
                complexity="Error",
                language="python",
                metrics={"syntax_error": 1},
                risks=[Risk(
                    type="syntax_error",
                    message=f"Syntax error: {str(e)}",
                    level=RiskLevel.CRITICAL,
                    line=e.lineno or 0
                )]
            )
        
        # Calculate complexity based on metrics
        complexity = self._calculate_complexity()
        
        # Calculate score based on risks
        score = self._calculate_score()
        
        # Generate suggestions
        suggestions = self._generate_suggestions()
        
        return AnalysisReport(
            score=score,
            complexity=complexity,
            language="python",
            metrics=self.metrics,
            risks=self.risks,
            suggestions=suggestions
        )
    
    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.metrics['functions'] += 1
        self.generic_visit(node)
    
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self.metrics['functions'] += 1
        self.generic_visit(node)
    
    def visit_ClassDef(self, node: ast.ClassDef):
        self.metrics['classes'] += 1
        self.generic_visit(node)
    
    def visit_For(self, node: ast.For):
        self.metrics['loops'] += 1
        self.generic_visit(node)
    
    def visit_While(self, node: ast.While):
        self.metrics['loops'] += 1
        # Check for infinite loop risk
        if isinstance(node.test, ast.Constant) and node.test.value is True:
            self.risks.append(Risk(
                type="infinite_loop",
                message="Potential infinite loop detected (while True)",
                level=RiskLevel.MEDIUM,
                line=node.lineno
            ))
        self.generic_visit(node)
    
    def visit_If(self, node: ast.If):
        self.metrics['conditionals'] += 1
        self.generic_visit(node)
    
    def visit_Try(self, node: ast.Try):
        self.metrics['try_blocks'] += 1
        # Check for bare except
        for handler in node.handlers:
            if handler.type is None:
                self.risks.append(Risk(
                    type="bare_except",
                    message="Bare except clause catches all exceptions",
                    level=RiskLevel.LOW,
                    line=handler.lineno
                ))
        self.generic_visit(node)
    
    def visit_Import(self, node: ast.Import):
        self.metrics['imports'] += 1
        for alias in node.names:
            module_name = alias.name.split('.')[0]
            self.imported_modules[alias.asname or alias.name] = module_name
            self._check_dangerous_import(module_name, node.lineno)
        self.generic_visit(node)
    
    def visit_ImportFrom(self, node: ast.ImportFrom):
        self.metrics['imports'] += 1
        if node.module:
            module_name = node.module.split('.')[0]
            for alias in node.names:
                self.imported_modules[alias.asname or alias.name] = module_name
            self._check_dangerous_import(module_name, node.lineno, 
                                         [a.name for a in node.names])
        self.generic_visit(node)
    
    def visit_Call(self, node: ast.Call):
        # Check for dangerous function calls
        func_name = self._get_call_name(node)
        
        # Check direct dangerous function calls
        if func_name in self.DANGEROUS_FUNCTIONS:
            level, msg = self.DANGEROUS_FUNCTIONS[func_name]
            self.risks.append(Risk(
                type="dangerous_function",
                message=f"Dangerous function call: {func_name}() - {msg}",
                level=level,
                line=node.lineno
            ))
        
        # Check for dangerous module.function calls
        if '.' in func_name:
            module, method = func_name.rsplit('.', 1)
            actual_module = self.imported_modules.get(module, module)
            if actual_module in self.DANGEROUS_MODULES:
                if method in self.DANGEROUS_MODULES[actual_module]:
                    self.risks.append(Risk(
                        type="dangerous_call",
                        message=f"Potentially dangerous call: {func_name}()",
                        level=RiskLevel.HIGH,
                        line=node.lineno
                    ))
        
        self.generic_visit(node)
    
    def _get_call_name(self, node: ast.Call) -> str:
        """Extract the full name of a function call"""
        if isinstance(node.func, ast.Name):
            return node.func.id
        elif isinstance(node.func, ast.Attribute):
            parts = []
            current = node.func
            while isinstance(current, ast.Attribute):
                parts.append(current.attr)
                current = current.value
            if isinstance(current, ast.Name):
                parts.append(current.id)
            return '.'.join(reversed(parts))
        return ""
    
    def _check_dangerous_import(self, module: str, line: int, 
                                 functions: List[str] = None):
        """Check if imported module/functions are potentially dangerous"""
        if module in self.DANGEROUS_MODULES:
            if functions:
                dangerous = [f for f in functions 
                            if f in self.DANGEROUS_MODULES[module] or f == '*']
                if dangerous:
                    self.risks.append(Risk(
                        type="dangerous_import",
                        message=f"Potentially dangerous import from {module}: {', '.join(dangerous)}",
                        level=RiskLevel.MEDIUM,
                        line=line
                    ))
            else:
                self.risks.append(Risk(
                    type="dangerous_import",
                    message=f"Import of potentially dangerous module: {module}",
                    level=RiskLevel.LOW,
                    line=line
                ))
    
    def _calculate_complexity(self) -> str:
        """Calculate code complexity based on metrics"""
        # Cyclomatic complexity approximation
        complexity_score = (
            self.metrics['conditionals'] +
            self.metrics['loops'] +
            self.metrics['try_blocks']
        )
        
        if complexity_score < 5:
            return "Low"
        elif complexity_score < 10:
            return "Medium"
        else:
            return "High"
    
    def _calculate_score(self) -> int:
        """Calculate security/quality score (0-100)"""
        score = 100
        
        for risk in self.risks:
            if risk.level == RiskLevel.CRITICAL:
                score -= 30
            elif risk.level == RiskLevel.HIGH:
                score -= 20
            elif risk.level == RiskLevel.MEDIUM:
                score -= 10
            elif risk.level == RiskLevel.LOW:
                score -= 5
        
        return max(0, score)
    
    def _generate_suggestions(self) -> List[str]:
        """Generate improvement suggestions based on analysis"""
        suggestions = []
        
        if self.metrics['try_blocks'] == 0 and self.metrics['lines_of_code'] > 10:
            suggestions.append("Consider adding error handling with try/except blocks")
        
        if self.metrics['functions'] == 0 and self.metrics['lines_of_code'] > 15:
            suggestions.append("Consider organizing code into functions for better readability")
        
        critical_risks = [r for r in self.risks if r.level == RiskLevel.CRITICAL]
        if critical_risks:
            suggestions.append("⚠️ CRITICAL: Remove dangerous functions like eval() or exec()")
        
        return suggestions


# ============================================
# JavaScript Analyzer
# ============================================

class JavaScriptAnalyzer:
    """
    Analyzes JavaScript code using regex patterns.
    For more advanced analysis, consider using esprima.
    """
    
    # Dangerous patterns in JavaScript
    DANGEROUS_PATTERNS = [
        (r'\beval\s*\(', RiskLevel.CRITICAL, "eval() can execute arbitrary code"),
        (r'\bFunction\s*\(', RiskLevel.CRITICAL, "Function constructor can execute arbitrary code"),
        (r'\bsetTimeout\s*\([^,]+,\s*["\']', RiskLevel.MEDIUM, "setTimeout with string argument can execute code"),
        (r'\bsetInterval\s*\([^,]+,\s*["\']', RiskLevel.MEDIUM, "setInterval with string argument can execute code"),
        (r'innerHTML\s*=', RiskLevel.MEDIUM, "innerHTML can lead to XSS vulnerabilities"),
        (r'document\.write\s*\(', RiskLevel.MEDIUM, "document.write can be a security risk"),
        (r'\brequire\s*\(\s*["\']child_process', RiskLevel.CRITICAL, "child_process module can execute system commands"),
        (r'\brequire\s*\(\s*["\']fs', RiskLevel.HIGH, "fs module can access the file system"),
        (r'process\.exit', RiskLevel.HIGH, "process.exit can terminate the process"),
        (r'__dirname|__filename', RiskLevel.LOW, "File path exposure"),
    ]
    
    # Patterns for metrics
    FUNCTION_PATTERN = r'(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))'
    LOOP_PATTERN = r'\b(?:for|while|do)\s*\('
    CONDITIONAL_PATTERN = r'\b(?:if|else\s+if|switch)\s*\('
    CLASS_PATTERN = r'\bclass\s+\w+'
    
    def __init__(self, code: str):
        self.code = code
        self.lines = code.split('\n')
        self.metrics = {
            'functions': 0,
            'classes': 0,
            'loops': 0,
            'conditionals': 0,
            'lines_of_code': len([l for l in self.lines if l.strip() and not l.strip().startswith('//')]),
        }
        self.risks: List[Risk] = []
    
    def analyze(self) -> AnalysisReport:
        """Perform complete analysis of the JavaScript code"""
        
        # Count metrics
        self.metrics['functions'] = len(re.findall(self.FUNCTION_PATTERN, self.code))
        self.metrics['loops'] = len(re.findall(self.LOOP_PATTERN, self.code))
        self.metrics['conditionals'] = len(re.findall(self.CONDITIONAL_PATTERN, self.code))
        self.metrics['classes'] = len(re.findall(self.CLASS_PATTERN, self.code))
        
        # Check for dangerous patterns
        for pattern, level, message in self.DANGEROUS_PATTERNS:
            matches = list(re.finditer(pattern, self.code))
            for match in matches:
                line_num = self.code[:match.start()].count('\n') + 1
                self.risks.append(Risk(
                    type="dangerous_pattern",
                    message=message,
                    level=level,
                    line=line_num
                ))
        
        # Check for infinite loops
        if re.search(r'while\s*\(\s*true\s*\)', self.code):
            self.risks.append(Risk(
                type="infinite_loop",
                message="Potential infinite loop detected (while(true))",
                level=RiskLevel.MEDIUM,
                line=0
            ))
        
        # Calculate complexity and score
        complexity = self._calculate_complexity()
        score = self._calculate_score()
        suggestions = self._generate_suggestions()
        
        return AnalysisReport(
            score=score,
            complexity=complexity,
            language="javascript",
            metrics=self.metrics,
            risks=self.risks,
            suggestions=suggestions
        )
    
    def _calculate_complexity(self) -> str:
        """Calculate code complexity based on metrics"""
        complexity_score = self.metrics['conditionals'] + self.metrics['loops']
        
        if complexity_score < 5:
            return "Low"
        elif complexity_score < 10:
            return "Medium"
        else:
            return "High"
    
    def _calculate_score(self) -> int:
        """Calculate security/quality score (0-100)"""
        score = 100
        
        for risk in self.risks:
            if risk.level == RiskLevel.CRITICAL:
                score -= 30
            elif risk.level == RiskLevel.HIGH:
                score -= 20
            elif risk.level == RiskLevel.MEDIUM:
                score -= 10
            elif risk.level == RiskLevel.LOW:
                score -= 5
        
        return max(0, score)
    
    def _generate_suggestions(self) -> List[str]:
        """Generate improvement suggestions"""
        suggestions = []
        
        if self.metrics['functions'] == 0 and self.metrics['lines_of_code'] > 10:
            suggestions.append("Consider organizing code into functions")
        
        critical_risks = [r for r in self.risks if r.level == RiskLevel.CRITICAL]
        if critical_risks:
            suggestions.append("⚠️ CRITICAL: Remove dangerous functions like eval()")
        
        return suggestions


# ============================================
# Main Analysis Function
# ============================================

def analyze_code(language: str, code: str) -> Dict[str, Any]:
    """
    Main entry point for code analysis.
    
    Args:
        language: Programming language ('python' or 'javascript')
        code: Source code to analyze
    
    Returns:
        Dictionary containing the analysis report
    """
    if language.lower() == 'python':
        analyzer = PythonAnalyzer(code)
    elif language.lower() in ('javascript', 'js'):
        analyzer = JavaScriptAnalyzer(code)
    else:
        return AnalysisReport(
            score=100,
            complexity="Unknown",
            language=language,
            metrics={},
            risks=[],
            suggestions=[f"Analysis not supported for language: {language}"]
        ).to_dict()
    
    report = analyzer.analyze()
    return report.to_dict()


# ============================================
# Test the analyzer
# ============================================

if __name__ == "__main__":
    # Test Python analysis
    python_code = """
import os
import subprocess

def dangerous_function():
    eval(input("Enter code: "))
    os.system("rm -rf /")
    
while True:
    print("infinite loop")
"""
    
    print("=" * 50)
    print("Python Analysis Test")
    print("=" * 50)
    result = analyze_code("python", python_code)
    import json
    print(json.dumps(result, indent=2))
    
    # Test JavaScript analysis
    js_code = """
const express = require('express');
const { exec } = require('child_process');

function handleRequest(req) {
    eval(req.body.code);
    document.innerHTML = req.body.html;
    
    while(true) {
        console.log("loop");
    }
}
"""
    
    print("\n" + "=" * 50)
    print("JavaScript Analysis Test")
    print("=" * 50)
    result = analyze_code("javascript", js_code)
    print(json.dumps(result, indent=2))

