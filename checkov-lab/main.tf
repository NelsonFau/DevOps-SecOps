provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "mi_bucket" {
  bucket = "checkov-lab-bucket-ejemplo"

  #checkov:skip=CKV2_AWS_62:Event notifications fuera del alcance de este laboratorio
  #checkov:skip=CKV2_AWS_61:Lifecycle fuera del alcance de este laboratorio
  #checkov:skip=CKV_AWS_18:Access logging fuera del alcance de este laboratorio
  #checkov:skip=CKV_AWS_144:Cross-region replication no es necesaria para este laboratorio
  #checkov:skip=CKV_AWS_145:KMS gestionado por el cliente fuera del alcance de este laboratorio
}

resource "aws_s3_bucket_public_access_block" "mi_bucket" {
  bucket = aws_s3_bucket.mi_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "mi_bucket" {
  bucket = aws_s3_bucket.mi_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_security_group" "app" {
  #checkov:skip=CKV2_AWS_5:Security Group aislado intencionalmente para laboratorio de Checkov

  name        = "checkov-lab-sg"
  description = "Security group para aplicacion"
  
ingress {
  description = "Permitir trafico de la aplicacion"
  from_port   = 8080
  to_port     = 8080
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}

  egress {
    description = "Permitir HTTPS saliente"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}