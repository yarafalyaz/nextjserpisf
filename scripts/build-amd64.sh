#!/bin/bash

# Configuration
IMAGE_NAME="yekristanto/silengkap"
TAG="latest"

echo "============================================="
echo "Building & Pushing Docker Image for linux/amd64 (SumoPod)"
echo "============================================="

# Gunakan default builder bawaan Docker Desktop agar stabil
docker buildx use default

# Run buildx build
echo "Running Docker Buildx build for linux/amd64..."
docker buildx build \
  --builder default \
  --progress=plain \
  --platform linux/amd64 \
  -t $IMAGE_NAME:$TAG \
  --load \
  .

echo "Pushing image to Docker Hub..."
docker push $IMAGE_NAME:$TAG

echo "============================================="
echo "Build completed!"
echo "Image name: $IMAGE_NAME:$TAG (Platform: linux/amd64)"
echo "============================================="
