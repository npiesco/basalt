#!/usr/bin/env python3
"""
MinIO/S3 Setup Script
Creates and configures MinIO buckets locally or on cloud S3-compatible services.
"""

import os
import sys
import subprocess
from pathlib import Path
import click
from dotenv import load_dotenv
from minio import Minio
from minio.error import S3Error
import boto3
from botocore.exceptions import ClientError

# Load environment variables
load_dotenv()


class MinIOSetup:
    """MinIO/S3 setup and configuration manager"""

    def __init__(self, endpoint, access_key, secret_key, secure=True):
        self.endpoint = endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.secure = secure

        # Initialize MinIO client
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )

        click.echo(f"✓ Connected to {endpoint}")

    def create_bucket(self, bucket_name, versioning=False):
        """Create a bucket if it doesn't exist"""
        try:
            if self.client.bucket_exists(bucket_name):
                click.echo(f"⚠ Bucket '{bucket_name}' already exists")
                return True

            self.client.make_bucket(bucket_name)
            click.echo(f"✓ Created bucket '{bucket_name}'")

            if versioning:
                self.enable_versioning(bucket_name)

            return True

        except S3Error as err:
            click.echo(f"✗ Error creating bucket: {err}", err=True)
            return False

    def enable_versioning(self, bucket_name):
        """Enable versioning on a bucket"""
        try:
            from minio.commonconfig import ENABLED
            from minio.versioningconfig import VersioningConfig

            config = VersioningConfig(ENABLED)
            self.client.set_bucket_versioning(bucket_name, config)
            click.echo(f"✓ Enabled versioning on '{bucket_name}'")
            return True

        except S3Error as err:
            click.echo(f"✗ Error enabling versioning: {err}", err=True)
            return False

    def set_bucket_policy(self, bucket_name, policy_type="private"):
        """Set bucket policy (private, public-read, public-read-write)"""
        policies = {
            "private": None,  # Default - no public access
            "public-read": {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "*"},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{bucket_name}/*"]
                    }
                ]
            },
            "public-read-write": {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "*"},
                        "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
                        "Resource": [f"arn:aws:s3:::{bucket_name}/*"]
                    }
                ]
            }
        }

        try:
            policy = policies.get(policy_type)
            if policy:
                import json
                self.client.set_bucket_policy(bucket_name, json.dumps(policy))
                click.echo(f"✓ Set '{policy_type}' policy on '{bucket_name}'")
            else:
                click.echo(f"✓ Bucket '{bucket_name}' is private")
            return True

        except S3Error as err:
            click.echo(f"✗ Error setting policy: {err}", err=True)
            return False

    def list_buckets(self):
        """List all buckets"""
        try:
            buckets = self.client.list_buckets()
            if buckets:
                click.echo("\n📦 Available buckets:")
                for bucket in buckets:
                    click.echo(f"  • {bucket.name} (created: {bucket.creation_date})")
            else:
                click.echo("No buckets found")
            return True

        except S3Error as err:
            click.echo(f"✗ Error listing buckets: {err}", err=True)
            return False

    def upload_file(self, bucket_name, file_path, object_name=None):
        """Upload a file to a bucket"""
        if not object_name:
            object_name = Path(file_path).name

        try:
            self.client.fput_object(bucket_name, object_name, file_path)
            click.echo(f"✓ Uploaded '{file_path}' as '{object_name}' to '{bucket_name}'")
            return True

        except S3Error as err:
            click.echo(f"✗ Error uploading file: {err}", err=True)
            return False


def check_docker():
    """Check if Docker is installed and running"""
    try:
        result = subprocess.run(
            ["docker", "ps"],
            capture_output=True,
            text=True,
            check=False
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def start_local_minio():
    """Start a local MinIO server using Docker"""
    if not check_docker():
        click.echo("✗ Docker is not installed or not running", err=True)
        click.echo("Please install Docker: https://docs.docker.com/get-docker/")
        return False

    click.echo("🐳 Starting local MinIO server with Docker...")

    # Check if container already exists
    check_cmd = ["docker", "ps", "-a", "--filter", "name=basalt-minio", "--format", "{{.Names}}"]
    result = subprocess.run(check_cmd, capture_output=True, text=True)

    if "basalt-minio" in result.stdout:
        click.echo("⚠ Container 'basalt-minio' already exists, starting it...")
        subprocess.run(["docker", "start", "basalt-minio"], check=True)
    else:
        # Create new container
        docker_cmd = [
            "docker", "run", "-d",
            "--name", "basalt-minio",
            "-p", "9000:9000",
            "-p", "9001:9001",
            "-e", "MINIO_ROOT_USER=minioadmin",
            "-e", "MINIO_ROOT_PASSWORD=minioadmin",
            "minio/minio",
            "server", "/data", "--console-address", ":9001"
        ]

        try:
            subprocess.run(docker_cmd, check=True, capture_output=True)
            click.echo("✓ MinIO server started successfully")
            click.echo("📊 Console: http://localhost:9001 (minioadmin/minioadmin)")
            click.echo("🔌 API: http://localhost:9000")
        except subprocess.CalledProcessError as e:
            click.echo(f"✗ Failed to start MinIO: {e}", err=True)
            return False

    import time
    click.echo("⏳ Waiting for MinIO to be ready...")
    time.sleep(3)

    return True


@click.group()
def cli():
    """MinIO/S3 Setup Tool for Basalt"""
    pass


@cli.command()
@click.option('--endpoint', default='localhost:9000', help='MinIO/S3 endpoint')
@click.option('--access-key', default='minioadmin', help='Access key')
@click.option('--secret-key', default='minioadmin', help='Secret key')
@click.option('--secure/--no-secure', default=False, help='Use HTTPS')
@click.option('--bucket', default='basalt-vault', help='Bucket name to create')
@click.option('--versioning/--no-versioning', default=True, help='Enable versioning')
@click.option('--policy', type=click.Choice(['private', 'public-read', 'public-read-write']), default='private')
def local(endpoint, access_key, secret_key, secure, bucket, versioning, policy):
    """Set up local MinIO server and create buckets"""
    click.echo("🚀 Setting up local MinIO...")

    # Start MinIO if not running
    if endpoint == 'localhost:9000':
        if not start_local_minio():
            sys.exit(1)

    # Connect and create bucket
    try:
        minio = MinIOSetup(endpoint, access_key, secret_key, secure)
        minio.create_bucket(bucket, versioning=versioning)
        minio.set_bucket_policy(bucket, policy)
        minio.list_buckets()

        click.echo("\n✅ Local MinIO setup complete!")
        click.echo(f"\n🔑 Connection details:")
        click.echo(f"   Endpoint: {endpoint}")
        click.echo(f"   Access Key: {access_key}")
        click.echo(f"   Secret Key: {secret_key}")
        click.echo(f"   Secure: {secure}")
        click.echo(f"   Bucket: {bucket}")

    except Exception as e:
        click.echo(f"✗ Setup failed: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--endpoint', required=True, help='S3 endpoint (e.g., s3.amazonaws.com)')
@click.option('--access-key', envvar='AWS_ACCESS_KEY_ID', help='AWS access key')
@click.option('--secret-key', envvar='AWS_SECRET_ACCESS_KEY', help='AWS secret key')
@click.option('--region', default='us-east-1', help='AWS region')
@click.option('--bucket', required=True, help='Bucket name to create')
@click.option('--versioning/--no-versioning', default=True, help='Enable versioning')
def cloud(endpoint, access_key, secret_key, region, bucket, versioning):
    """Set up cloud S3-compatible storage (AWS, DigitalOcean, etc.)"""
    click.echo("☁️ Setting up cloud S3 storage...")

    if not access_key or not secret_key:
        click.echo("✗ Access key and secret key required", err=True)
        click.echo("Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars")
        sys.exit(1)

    try:
        # Use boto3 for AWS S3
        s3_client = boto3.client(
            's3',
            endpoint_url=f"https://{endpoint}",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )

        # Create bucket
        try:
            if region == 'us-east-1':
                s3_client.create_bucket(Bucket=bucket)
            else:
                s3_client.create_bucket(
                    Bucket=bucket,
                    CreateBucketConfiguration={'LocationConstraint': region}
                )
            click.echo(f"✓ Created bucket '{bucket}'")

        except ClientError as e:
            if e.response['Error']['Code'] == 'BucketAlreadyOwnedByYou':
                click.echo(f"⚠ Bucket '{bucket}' already exists")
            else:
                raise

        # Enable versioning
        if versioning:
            s3_client.put_bucket_versioning(
                Bucket=bucket,
                VersioningConfiguration={'Status': 'Enabled'}
            )
            click.echo(f"✓ Enabled versioning on '{bucket}'")

        click.echo("\n✅ Cloud S3 setup complete!")
        click.echo(f"\n🔑 Connection details:")
        click.echo(f"   Endpoint: {endpoint}")
        click.echo(f"   Region: {region}")
        click.echo(f"   Bucket: {bucket}")

    except Exception as e:
        click.echo(f"✗ Setup failed: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--endpoint', default='localhost:9000', help='MinIO/S3 endpoint')
@click.option('--access-key', default='minioadmin', help='Access key')
@click.option('--secret-key', default='minioadmin', help='Secret key')
@click.option('--secure/--no-secure', default=False, help='Use HTTPS')
def list(endpoint, access_key, secret_key, secure):
    """List all buckets"""
    try:
        minio = MinIOSetup(endpoint, access_key, secret_key, secure)
        minio.list_buckets()
    except Exception as e:
        click.echo(f"✗ Failed: {e}", err=True)
        sys.exit(1)


@cli.command()
def stop():
    """Stop local MinIO Docker container"""
    try:
        subprocess.run(["docker", "stop", "basalt-minio"], check=True, capture_output=True)
        click.echo("✓ MinIO server stopped")
    except subprocess.CalledProcessError:
        click.echo("✗ Failed to stop MinIO (container may not be running)", err=True)
    except FileNotFoundError:
        click.echo("✗ Docker not found", err=True)


if __name__ == '__main__':
    cli()
