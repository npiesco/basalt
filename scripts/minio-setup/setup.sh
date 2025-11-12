#!/bin/bash

# MinIO/S3 Setup Script (Bash)
# Automates Python venv creation and MinIO setup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "🚀 Basalt MinIO/S3 Setup Script"
echo "================================"

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo "✗ Python 3 is not installed"
    echo "Please install Python 3: https://www.python.org/downloads/"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo "✓ Found Python $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo "⬆️ Upgrading pip..."
pip install --upgrade pip --quiet

# Install requirements
echo "📥 Installing Python dependencies..."
pip install -r "$SCRIPT_DIR/requirements.txt" --quiet
echo "✓ Dependencies installed"

# Make Python script executable
chmod +x "$SCRIPT_DIR/setup_minio.py"

# Show usage
echo ""
echo "✅ Setup complete! Virtual environment ready."
echo ""
echo "📖 Usage:"
echo ""
echo "  Local MinIO (Docker):"
echo "    $VENV_DIR/bin/python $SCRIPT_DIR/setup_minio.py local"
echo "    $VENV_DIR/bin/python $SCRIPT_DIR/setup_minio.py local --bucket my-bucket"
echo ""
echo "  Cloud S3:"
echo "    export AWS_ACCESS_KEY_ID=your_key"
echo "    export AWS_SECRET_ACCESS_KEY=your_secret"
echo "    $VENV_DIR/bin/python $SCRIPT_DIR/setup_minio.py cloud --endpoint s3.amazonaws.com --bucket my-bucket"
echo ""
echo "  List buckets:"
echo "    $VENV_DIR/bin/python $SCRIPT_DIR/setup_minio.py list"
echo ""
echo "  Stop local MinIO:"
echo "    $VENV_DIR/bin/python $SCRIPT_DIR/setup_minio.py stop"
echo ""
echo "  Get help:"
echo "    $VENV_DIR/bin/python $SCRIPT_DIR/setup_minio.py --help"
echo ""

# Ask if user wants to run setup now
read -p "🤔 Run local MinIO setup now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    "$VENV_DIR/bin/python" "$SCRIPT_DIR/setup_minio.py" local
fi
