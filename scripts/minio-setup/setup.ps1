# MinIO/S3 Setup Script (PowerShell)
# Automates Python venv creation and MinIO setup

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $ScriptDir "venv"

Write-Host "🚀 Basalt MinIO/S3 Setup Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check Python installation
try {
    $PythonVersion = (python --version 2>&1).ToString()
    Write-Host "✓ Found $PythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python is not installed" -ForegroundColor Red
    Write-Host "Please install Python 3: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Create virtual environment if it doesn't exist
if (-Not (Test-Path $VenvDir)) {
    Write-Host "📦 Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
    Write-Host "✓ Virtual environment created" -ForegroundColor Green
} else {
    Write-Host "✓ Virtual environment already exists" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "🔌 Activating virtual environment..." -ForegroundColor Yellow
$ActivateScript = Join-Path $VenvDir "Scripts\Activate.ps1"

# Check if we can run scripts
$ExecutionPolicy = Get-ExecutionPolicy
if ($ExecutionPolicy -eq "Restricted") {
    Write-Host "⚠ PowerShell execution policy is Restricted" -ForegroundColor Yellow
    Write-Host "Run this command as Administrator to fix:" -ForegroundColor Yellow
    Write-Host "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or run the venv activation manually:" -ForegroundColor Yellow
    Write-Host "  $ActivateScript" -ForegroundColor Cyan
    Write-Host ""
}

# Try to activate
try {
    & $ActivateScript
    Write-Host "✓ Virtual environment activated" -ForegroundColor Green
} catch {
    Write-Host "⚠ Could not activate automatically, continuing..." -ForegroundColor Yellow
}

# Get pip path
$PipPath = Join-Path $VenvDir "Scripts\pip.exe"
$PythonPath = Join-Path $VenvDir "Scripts\python.exe"

# Upgrade pip
Write-Host "⬆️ Upgrading pip..." -ForegroundColor Yellow
& $PipPath install --upgrade pip --quiet

# Install requirements
$RequirementsPath = Join-Path $ScriptDir "requirements.txt"
Write-Host "📥 Installing Python dependencies..." -ForegroundColor Yellow
& $PipPath install -r $RequirementsPath --quiet
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Path to Python script
$SetupScript = Join-Path $ScriptDir "setup_minio.py"

# Show usage
Write-Host ""
Write-Host "✅ Setup complete! Virtual environment ready." -ForegroundColor Green
Write-Host ""
Write-Host "📖 Usage:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Local MinIO (Docker):" -ForegroundColor White
Write-Host "    $PythonPath $SetupScript local" -ForegroundColor Gray
Write-Host "    $PythonPath $SetupScript local --bucket my-bucket" -ForegroundColor Gray
Write-Host ""
Write-Host "  Cloud S3:" -ForegroundColor White
Write-Host "    `$env:AWS_ACCESS_KEY_ID='your_key'" -ForegroundColor Gray
Write-Host "    `$env:AWS_SECRET_ACCESS_KEY='your_secret'" -ForegroundColor Gray
Write-Host "    $PythonPath $SetupScript cloud --endpoint s3.amazonaws.com --bucket my-bucket" -ForegroundColor Gray
Write-Host ""
Write-Host "  List buckets:" -ForegroundColor White
Write-Host "    $PythonPath $SetupScript list" -ForegroundColor Gray
Write-Host ""
Write-Host "  Stop local MinIO:" -ForegroundColor White
Write-Host "    $PythonPath $SetupScript stop" -ForegroundColor Gray
Write-Host ""
Write-Host "  Get help:" -ForegroundColor White
Write-Host "    $PythonPath $SetupScript --help" -ForegroundColor Gray
Write-Host ""

# Ask if user wants to run setup now
$Response = Read-Host "🤔 Run local MinIO setup now? (y/N)"
if ($Response -match "^[Yy]$") {
    & $PythonPath $SetupScript local
}

Write-Host ""
Write-Host "💡 Tip: You can also run commands directly after activating the venv:" -ForegroundColor Yellow
Write-Host "  $ActivateScript" -ForegroundColor Cyan
Write-Host "  python $SetupScript local" -ForegroundColor Cyan
