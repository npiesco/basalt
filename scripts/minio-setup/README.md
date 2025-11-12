# MinIO/S3 Setup Scripts

Automated scripts to set up MinIO/S3 storage for Basalt, supporting both local Docker and cloud deployments.

## Features

- 🐳 **Local MinIO** - Spin up MinIO in Docker for local development
- ☁️ **Cloud S3** - Connect to AWS S3, DigitalOcean Spaces, or any S3-compatible service
- 🔄 **Versioning** - Enable object versioning for backups
- 🔐 **Bucket Policies** - Configure public/private access
- 🐍 **Python venv** - Automatic virtual environment setup
- 🎯 **Cross-platform** - Bash (Unix/Linux/macOS) and PowerShell (Windows) scripts

## Quick Start

### Option 1: Bash (Unix/Linux/macOS)

```bash
cd scripts/minio-setup
./setup.sh
```

### Option 2: PowerShell (Windows)

```powershell
cd scripts\minio-setup
.\setup.ps1
```

Both scripts will:
1. Check for Python 3
2. Create a virtual environment
3. Install dependencies
4. Prompt to run local MinIO setup

## Manual Usage

After running the setup script, you can use the Python script directly:

### Local MinIO (Docker)

```bash
# Basic local setup (creates basalt-vault bucket)
./venv/bin/python setup_minio.py local

# Custom bucket name
./venv/bin/python setup_minio.py local --bucket my-custom-bucket

# With versioning disabled
./venv/bin/python setup_minio.py local --bucket my-bucket --no-versioning

# Public read access
./venv/bin/python setup_minio.py local --bucket public-bucket --policy public-read
```

**Access MinIO Console:** http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin`

**API Endpoint:** http://localhost:9000

### Cloud S3 (AWS, DigitalOcean, etc.)

```bash
# Set credentials
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key

# AWS S3
./venv/bin/python setup_minio.py cloud \
  --endpoint s3.amazonaws.com \
  --bucket my-bucket \
  --region us-east-1

# DigitalOcean Spaces
./venv/bin/python setup_minio.py cloud \
  --endpoint nyc3.digitaloceanspaces.com \
  --bucket my-bucket \
  --region us-east-1

# Any S3-compatible service
./venv/bin/python setup_minio.py cloud \
  --endpoint s3.example.com \
  --bucket my-bucket \
  --access-key YOUR_KEY \
  --secret-key YOUR_SECRET
```

### Utility Commands

```bash
# List all buckets
./venv/bin/python setup_minio.py list

# List buckets on cloud endpoint
./venv/bin/python setup_minio.py list \
  --endpoint s3.amazonaws.com \
  --access-key YOUR_KEY \
  --secret-key YOUR_SECRET \
  --secure

# Stop local MinIO Docker container
./venv/bin/python setup_minio.py stop

# Get help
./venv/bin/python setup_minio.py --help
./venv/bin/python setup_minio.py local --help
./venv/bin/python setup_minio.py cloud --help
```

## Requirements

- **Python 3.8+**
- **Docker** (for local MinIO only)
- **Internet connection** (for downloading dependencies and Docker images)

## Environment Variables

The scripts support the following environment variables:

- `AWS_ACCESS_KEY_ID` - S3 access key
- `AWS_SECRET_ACCESS_KEY` - S3 secret key

You can also create a `.env` file in the `minio-setup/` directory:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Architecture

```
scripts/minio-setup/
├── setup.sh              # Bash setup script (Unix/Linux/macOS)
├── setup.ps1             # PowerShell setup script (Windows)
├── setup_minio.py        # Main Python CLI tool
├── requirements.txt      # Python dependencies
├── README.md             # This file
└── venv/                 # Virtual environment (created by setup scripts)
```

## Dependencies

The Python script uses:
- **boto3** - AWS SDK for Python (S3 operations)
- **minio** - MinIO Python client
- **python-dotenv** - Environment variable management
- **click** - CLI framework

## Troubleshooting

### Docker not found

**Error:** `Docker is not installed or not running`

**Solution:** Install Docker Desktop:
- macOS/Windows: https://www.docker.com/products/docker-desktop
- Linux: https://docs.docker.com/engine/install/

### PowerShell execution policy

**Error:** `script is not digitally signed`

**Solution:** Run as Administrator:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Python not found

**Error:** `Python 3 is not installed`

**Solution:** Install Python 3.8+: https://www.python.org/downloads/

### Port already in use

**Error:** `Bind for 0.0.0.0:9000 failed: port is already allocated`

**Solution:** Stop the conflicting service or change MinIO ports:
```bash
docker stop basalt-minio
docker rm basalt-minio
```

## Integration with Basalt

Once MinIO is set up, configure Basalt to use it for:

- **Attachments** - Store note attachments
- **Backups** - Database snapshots
- **Exports** - Exported notes and vaults
- **Sync** - Cross-device synchronization

Add to your Basalt configuration:

```javascript
{
  "storage": {
    "type": "s3",
    "endpoint": "localhost:9000",
    "bucket": "basalt-vault",
    "accessKey": "minioadmin",
    "secretKey": "minioadmin",
    "secure": false
  }
}
```

## Advanced Usage

### Custom Docker Configuration

```bash
# Run MinIO with custom ports and persistent volume
docker run -d \
  --name basalt-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /path/to/data:/data \
  -e "MINIO_ROOT_USER=custom_admin" \
  -e "MINIO_ROOT_PASSWORD=custom_password" \
  minio/minio \
  server /data --console-address ":9001"
```

### Programmatic Access

```python
from minio import Minio

client = Minio(
    "localhost:9000",
    access_key="minioadmin",
    secret_key="minioadmin",
    secure=False
)

# Upload file
client.fput_object("basalt-vault", "backup.db", "/path/to/backup.db")

# Download file
client.fget_object("basalt-vault", "backup.db", "/path/to/restore.db")

# List objects
objects = client.list_objects("basalt-vault")
for obj in objects:
    print(obj.object_name, obj.size)
```

## Security Notes

- 🔒 **Change default credentials** in production
- 🔐 **Use HTTPS** for cloud deployments
- 🚫 **Never commit credentials** to version control
- ✅ **Use environment variables** or secure secret management
- 🔑 **Enable versioning** for data recovery
- 📝 **Set appropriate bucket policies** (private by default)

## License

Part of the Basalt project.
