#!/bin/bash

# setup-docker-local.sh
# A script to automate the setup and running of the local development Docker stack for Silengkap.

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Copying .env.example..."
    cp .env.example .env
fi

# Stop any conflicting running container
echo "Stopping silengkap_local_app if running..."
docker stop silengkap_local_app 2>/dev/null || true
docker rm silengkap_local_app 2>/dev/null || true

# Build and start services using docker-compose
echo "Building and starting local development services..."
docker compose up -d --build

# Wait for database to be ready
echo "Waiting for database to be healthy..."
MAX_RETRIES=30
COUNT=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' silengkap_dev_db 2>/dev/null)" == "healthy" ] || [ $COUNT -eq $MAX_RETRIES ]; do
    sleep 2
    COUNT=$((COUNT + 1))
    echo "Checking database status... ($COUNT/$MAX_RETRIES)"
done

if [ "$(docker inspect -f '{{.State.Health.Status}}' silengkap_dev_db 2>/dev/null)" != "healthy" ]; then
    echo "Warning: Database health check timed out. Checking logs..."
    docker logs silengkap_dev_db --tail 20
fi

echo "--------------------------------------------------"
echo "Services are running in development mode (with hot-reload)!"
echo "App URL: http://localhost:3005"
echo "Database Port: 3309 (External)"
echo ""
echo "To view app logs: docker compose logs -f app"
echo "To view db logs:  docker compose logs -f db"
echo "To stop services: docker compose down"
echo "--------------------------------------------------"
