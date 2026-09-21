> **Historisk dokument:** Dette dokument beskriver tidligere udgaver af løsningen. Brug [SHIELD README](README.md) til den aktuelle arbejdsgang og lokale opstart. Versions-, port- og driftsoplysninger nedenfor kan være forældede.

# Docker Deployment Guide - Judge Dredd AI Compliance Platform

## 🚀 Hurtig Start

### Prerequisites
- Docker (version 20.10+)
- Docker Compose (version 2.0+)
- `.env` fil med nødvendige API nøgler

### Start systemet

```bash
# Build og start alle services
docker-compose up -d

# Se logs
docker-compose logs -f

# Stop alle services
docker-compose down
```

Applikationen vil være tilgængelig på:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:8000
- **API Dokumentation**: http://localhost:8000/docs

## 📋 Detaljeret Setup

### 1. Opret .env fil

Opret en `.env` fil i root directory med følgende variabler:

```env
# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here

# Tavily Search API (optional)
TAVILY_API_KEY=your_tavily_api_key_here

# Application Settings
API_HOST=0.0.0.0
API_PORT=8000
PYTHONUNBUFFERED=1

# Logging
LOG_LEVEL=INFO
```

### 2. Build Docker Images

```bash
# Build backend image
docker build -f Dockerfile.backend -t judge-dredd-backend .

# Build frontend image
docker build -f Dockerfile.frontend -t judge-dredd-frontend .

# Eller build begge med docker-compose
docker-compose build
```

### 3. Start Services

```bash
# Start i detached mode
docker-compose up -d

# Start og se logs
docker-compose up

# Start kun backend
docker-compose up backend

# Start kun frontend
docker-compose up frontend
```

### 4. Verificer Installation

```bash
# Check service status
docker-compose ps

# Check backend health
curl http://localhost:8000/api/version

# Check frontend health
curl http://localhost/
```

## 🔧 Docker Kommandoer

### Service Management

```bash
# Se kørende containers
docker-compose ps

# Stop alle services
docker-compose down

# Stop og fjern volumes
docker-compose down -v

# Restart en service
docker-compose restart backend
docker-compose restart frontend

# Se logs for specifik service
docker-compose logs -f backend
docker-compose logs -f frontend

# Se de sidste 100 log linjer
docker-compose logs --tail=100 backend
```

### Rebuild & Update

```bash
# Rebuild efter kode ændringer
docker-compose build --no-cache

# Rebuild og restart
docker-compose up -d --build

# Rebuild kun backend
docker-compose build backend
docker-compose up -d backend

# Rebuild kun frontend
docker-compose build frontend
docker-compose up -d frontend
```

### Debugging

```bash
# Exec ind i backend container
docker-compose exec backend bash

# Exec ind i frontend container (nginx alpine)
docker-compose exec frontend sh

# Se container resource usage
docker stats

# Inspect en service
docker-compose config
```

## 📁 Arkitektur

### Backend (FastAPI)
- **Image**: Python 3.11-slim multi-stage build
- **Port**: 8000
- **Health Check**: GET /api/version
- **Volumes**:
  - `./data:/app/data` - Persistent data storage
  - `./compliance.db:/app/compliance.db` - SQLite database

### Frontend (React + Nginx)
- **Image**: Node 18 builder + Nginx alpine production
- **Port**: 80
- **Health Check**: wget http://localhost/
- **Reverse Proxy**: `/api/*` → `http://backend:8000/api/*`

### Network
- **Network Name**: `judge-dredd-network`
- **Driver**: bridge
- **Services**: backend, frontend

## 🛠️ Troubleshooting

### Backend ikke tilgængelig

```bash
# Check logs
docker-compose logs backend

# Restart backend
docker-compose restart backend

# Rebuild backend
docker-compose build backend
docker-compose up -d backend
```

### Frontend viser tom side

```bash
# Check nginx logs
docker-compose logs frontend

# Verify build assets
docker-compose exec frontend ls -la /usr/share/nginx/html

# Rebuild frontend
docker-compose build --no-cache frontend
docker-compose up -d frontend
```

### Database problemer

```bash
# Check hvis compliance.db eksisterer
ls -la compliance.db

# Check database permissions
docker-compose exec backend ls -la /app/compliance.db

# Restart backend med ny database
docker-compose down
rm compliance.db
docker-compose up -d backend
```

### Port konflikter

Hvis port 80 eller 8000 allerede er i brug:

```bash
# Rediger docker-compose.yml og ændr ports:
# Frontend: "8080:80" i stedet for "80:80"
# Backend: "8001:8000" i stedet for "8000:8000"

# Eller stop konfliktende services
sudo lsof -ti:80 | xargs kill -9
sudo lsof -ti:8000 | xargs kill -9
```

### API health check fejler

```bash
# Check backend er startet
docker-compose ps backend

# Test API manuelt
docker-compose exec backend curl http://localhost:8000/api/version

# Se detaljerede logs
docker-compose logs --tail=50 backend
```

## 🔐 Sikkerhed

### Production Deployment

For production deployment, opdater følgende:

1. **Environment Variables**:
   ```env
   # Tilføj til .env
   NODE_ENV=production
   ALLOWED_ORIGINS=https://yourdomain.com
   ```

2. **Nginx SSL** (tilføj til nginx.conf):
   ```nginx
   server {
       listen 443 ssl http2;
       ssl_certificate /etc/ssl/certs/cert.pem;
       ssl_certificate_key /etc/ssl/private/key.pem;
       # ... rest af config
   }
   ```

3. **Docker Compose** (production settings):
   ```yaml
   services:
     backend:
       restart: always
       logging:
         driver: "json-file"
         options:
           max-size: "10m"
           max-file: "3"
   ```

## 📊 Monitoring

### Health Checks

Backend health check kører hvert 30. sekund:
```bash
# Se health status
docker inspect --format='{{json .State.Health}}' judge-dredd-backend | jq
```

### Logs

```bash
# Realtime logs for alle services
docker-compose logs -f

# Export logs til fil
docker-compose logs > docker-logs.txt

# Filter logs
docker-compose logs backend | grep ERROR
```

### Resource Monitoring

```bash
# Se CPU og memory usage
docker stats

# Detaljeret container info
docker inspect judge-dredd-backend
docker inspect judge-dredd-frontend
```

## 🚢 Deployment til Cloud

### Build for production

```bash
# Build optimized images
docker-compose -f docker-compose.yml build --no-cache

# Tag images for registry
docker tag judge-dredd-backend:latest your-registry/judge-dredd-backend:v1.0
docker tag judge-dredd-frontend:latest your-registry/judge-dredd-frontend:v1.0

# Push til registry
docker push your-registry/judge-dredd-backend:v1.0
docker push your-registry/judge-dredd-frontend:v1.0
```

### Deploy til Cloud Provider

Eksempel med AWS ECS, Google Cloud Run, eller Azure Container Instances:

```bash
# AWS ECS
aws ecs create-service --service-name judge-dredd ...

# Google Cloud Run
gcloud run deploy judge-dredd --image gcr.io/project/judge-dredd-frontend

# Azure Container Instances
az container create --resource-group myResourceGroup --name judge-dredd ...
```

## 💡 Tips

1. **Development vs Production**: Brug volume mounts til development, men kopier filer direkte til image i production
2. **Database Backup**: Backup `compliance.db` regelmæssigt
3. **Log Rotation**: Konfigurer log rotation for at undgå disk space problemer
4. **Health Checks**: Monitorér health check status for at opdage problemer tidligt
5. **Network Isolation**: Brug separate networks for forskellige miljøer

## 📚 Yderligere Ressourcer

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Docker Documentation](https://hub.docker.com/_/nginx)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
