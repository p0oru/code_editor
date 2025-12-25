# ============================================
# RCE Engine - Test Runner Script (PowerShell)
# ============================================
# Stage 3: Docker-based Code Execution Tests
#
# Usage:
#   .\run-tests.ps1 python     - Test Python execution
#   .\run-tests.ps1 javascript - Test JavaScript execution  
#   .\run-tests.ps1 timeout    - Test timeout handling
#   .\run-tests.ps1 error      - Test error handling
#   .\run-tests.ps1 all        - Run all tests
#   .\run-tests.ps1 results    - Check MongoDB results
# ============================================

param(
    [Parameter(Position=0)]
    [string]$TestType = "help"
)

$ApiUrl = "http://localhost:3000/submit"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}

function Submit-Job {
    param([string]$JsonFile)
    
    $FilePath = Join-Path $ScriptDir $JsonFile
    if (-not (Test-Path $FilePath)) {
        Write-Host "Error: File not found: $FilePath" -ForegroundColor Red
        return
    }
    
    $Body = Get-Content $FilePath -Raw
    
    try {
        $Response = Invoke-RestMethod -Uri "$ApiUrl" -Method POST -ContentType "application/json" -Body $Body
        Write-Host "Job submitted successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Job ID: $($Response.jobId)" -ForegroundColor Yellow
        Write-Host "Status: $($Response.status)"
        Write-Host "Language: $($Response.language)"
        Write-Host ""
        Write-Host "Check results with: .\run-tests.ps1 results"
        Write-Host "Or view worker logs: docker compose logs -f execution-worker"
        return $Response.jobId
    }
    catch {
        Write-Host "Error submitting job: $_" -ForegroundColor Red
    }
}

function Get-Results {
    Write-Header "Latest Submission Results from MongoDB"
    
    try {
        $Command = 'db.submissions.find().sort({submittedAt:-1}).limit(3).forEach(doc => printjson(doc))'
        docker exec rce-mongo mongosh --quiet rce-engine --eval $Command
    }
    catch {
        Write-Host "Error fetching results: $_" -ForegroundColor Red
        Write-Host "Make sure MongoDB is running: docker compose up -d mongo"
    }
}

function Pull-Images {
    Write-Header "Pulling Execution Container Images"
    Write-Host "This may take a few minutes on first run..."
    Write-Host ""
    
    docker pull python:3.9-alpine
    docker pull node:18-alpine
    
    Write-Host ""
    Write-Host "Images pulled successfully!" -ForegroundColor Green
}

function Show-Help {
    Write-Host @"

RCE Engine - Test Runner Script
================================

Usage: .\run-tests.ps1 <command>

Commands:
  python      Submit Python test job (sum of 1-100)
  javascript  Submit JavaScript test job (factorial)
  timeout     Submit infinite loop (tests 5s timeout)
  error       Submit code with runtime error
  all         Run all test cases sequentially
  results     Show latest results from MongoDB
  pull        Pre-pull Docker images
  help        Show this help message

Prerequisites:
  1. Start services: docker compose up -d
  2. Pull images:    .\run-tests.ps1 pull
  3. Run tests:      .\run-tests.ps1 python

"@ -ForegroundColor White
}

# Main switch
switch ($TestType.ToLower()) {
    "python" {
        Write-Header "Testing Python Execution"
        Submit-Job "test-python.json"
    }
    "javascript" {
        Write-Header "Testing JavaScript Execution"
        Submit-Job "test-javascript.json"
    }
    "js" {
        Write-Header "Testing JavaScript Execution"
        Submit-Job "test-javascript.json"
    }
    "timeout" {
        Write-Header "Testing Timeout Handling (5 seconds)"
        Write-Host "This job will run an infinite loop and should timeout..." -ForegroundColor Yellow
        Submit-Job "test-timeout.json"
    }
    "error" {
        Write-Header "Testing Error Handling"
        Write-Host "This job will cause a ZeroDivisionError..." -ForegroundColor Yellow
        Submit-Job "test-error.json"
    }
    "all" {
        Write-Header "Running All Tests"
        
        Write-Host "`n[1/4] Python Test" -ForegroundColor Yellow
        Submit-Job "test-python.json"
        Start-Sleep -Seconds 3
        
        Write-Host "`n[2/4] JavaScript Test" -ForegroundColor Yellow
        Submit-Job "test-javascript.json"
        Start-Sleep -Seconds 3
        
        Write-Host "`n[3/4] Error Test" -ForegroundColor Yellow
        Submit-Job "test-error.json"
        Start-Sleep -Seconds 3
        
        Write-Host "`n[4/4] Timeout Test (will take ~5 seconds)" -ForegroundColor Yellow
        Submit-Job "test-timeout.json"
        
        Write-Host "`nAll tests submitted! Wait a few seconds then run:" -ForegroundColor Green
        Write-Host "  .\run-tests.ps1 results"
    }
    "results" {
        Get-Results
    }
    "pull" {
        Pull-Images
    }
    default {
        Show-Help
    }
}

