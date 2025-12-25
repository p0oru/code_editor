# ============================================
# Analysis Worker - Python Data Service
# ============================================
# Stage 4: Static Code Analysis Pipeline
# 
# This service:
# 1. Listens to Redis 'analysis_queue' for completed executions
# 2. Performs static code analysis using AST (Python) and regex (JS)
# 3. Updates MongoDB with analysis reports
# 4. Exposes a FastAPI health endpoint
# ============================================

import asyncio
import json
import logging
import os
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import redis.asyncio as redis
import uvicorn
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from pydantic_settings import BaseSettings

from analyzer import analyze_code

# ============================================
# Configuration
# ============================================

class Settings(BaseSettings):
    """Application settings from environment variables"""
    service_name: str = "analysis-worker"
    version: str = "1.0.0"
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    analysis_queue: str = "analysis_queue"
    
    # MongoDB
    mongo_url: str = "mongodb://localhost:27017/rce-engine"
    mongo_db: str = "rce-engine"
    
    # FastAPI
    host: str = "0.0.0.0"
    port: int = 8000
    
    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()

# ============================================
# Logging Setup
# ============================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(settings.service_name)

# ============================================
# Global State
# ============================================

class AppState:
    """Application state container"""
    redis_client: Optional[redis.Redis] = None
    mongo_client: Optional[AsyncIOMotorClient] = None
    mongo_db = None
    pubsub = None
    running: bool = True
    jobs_processed: int = 0
    last_analysis_time: Optional[datetime] = None


state = AppState()

# ============================================
# Models
# ============================================

class HealthResponse(BaseModel):
    """Health check response model"""
    status: str
    service: str
    version: str
    timestamp: str
    jobs_processed: int
    connections: dict


class AnalysisJob(BaseModel):
    """Job message from Redis queue"""
    jobId: str
    language: str
    code: str


# ============================================
# Database Operations
# ============================================

async def update_analysis_report(job_id: str, report: dict) -> bool:
    """Update MongoDB document with analysis report"""
    try:
        collection = state.mongo_db.submissions
        
        result = await collection.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "analysisReport": report,
                    "analyzedAt": datetime.utcnow().isoformat() + "Z"
                }
            }
        )
        
        return result.modified_count > 0
    except Exception as e:
        logger.error(f"Failed to update analysis report for {job_id}: {e}")
        return False


# ============================================
# Analysis Worker Loop
# ============================================

async def process_analysis_job(message: dict):
    """Process a single analysis job"""
    try:
        job_id = message.get("jobId")
        language = message.get("language")
        code = message.get("code")
        
        if not all([job_id, language, code]):
            logger.warning(f"Invalid job message: {message}")
            return
        
        logger.info(f"📊 Analyzing job [{job_id}] - Language: {language}")
        
        # Perform static analysis
        start_time = datetime.utcnow()
        report = analyze_code(language, code)
        analysis_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # Add timing to report
        report["analysisTimeMs"] = round(analysis_time, 2)
        
        logger.info(f"✅ Analysis complete for [{job_id}]:")
        logger.info(f"   Score: {report['score']}/100")
        logger.info(f"   Complexity: {report['complexity']}")
        logger.info(f"   Risks found: {len(report['risks'])}")
        logger.info(f"   Analysis time: {analysis_time:.2f}ms")
        
        # Update MongoDB
        success = await update_analysis_report(job_id, report)
        
        if success:
            logger.info(f"💾 Analysis report saved for [{job_id}]")
            state.jobs_processed += 1
            state.last_analysis_time = datetime.utcnow()
        else:
            logger.warning(f"⚠️ Failed to save analysis for [{job_id}] - document not found")
            
    except Exception as e:
        logger.error(f"❌ Error processing analysis job: {e}", exc_info=True)


async def analysis_worker_loop():
    """
    Main worker loop - subscribes to Redis channel and processes jobs.
    Uses Redis Pub/Sub for real-time notifications.
    """
    logger.info(f"👂 Analysis worker listening on channel: {settings.analysis_queue}")
    logger.info("━" * 50)
    
    # Subscribe to the analysis queue channel
    state.pubsub = state.redis_client.pubsub()
    await state.pubsub.subscribe(settings.analysis_queue)
    
    try:
        while state.running:
            try:
                # Get message with timeout
                message = await state.pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0
                )
                
                if message is not None and message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await process_analysis_job(data)
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse message: {e}")
                
                # Small sleep to prevent tight loop
                await asyncio.sleep(0.01)
                
            except asyncio.CancelledError:
                logger.info("Worker loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in worker loop: {e}")
                await asyncio.sleep(1)
                
    finally:
        if state.pubsub:
            await state.pubsub.unsubscribe(settings.analysis_queue)
            await state.pubsub.close()


# ============================================
# Connection Management
# ============================================

async def init_connections():
    """Initialize Redis and MongoDB connections"""
    logger.info(f"🚀 {settings.service_name} v{settings.version} starting...")
    logger.info("━" * 50)
    
    # Redis connection
    logger.info(f"📡 Connecting to Redis at {settings.redis_url}")
    state.redis_client = redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True
    )
    
    # Test Redis
    await state.redis_client.ping()
    logger.info("✅ Redis connected")
    
    # MongoDB connection
    logger.info(f"📡 Connecting to MongoDB at {settings.mongo_url}")
    state.mongo_client = AsyncIOMotorClient(settings.mongo_url)
    state.mongo_db = state.mongo_client[settings.mongo_db]
    
    # Test MongoDB
    await state.mongo_client.admin.command('ping')
    logger.info("✅ MongoDB connected")


async def close_connections():
    """Close all connections gracefully"""
    logger.info("🧹 Cleaning up connections...")
    
    state.running = False
    
    if state.pubsub:
        await state.pubsub.close()
    
    if state.redis_client:
        await state.redis_client.close()
    
    if state.mongo_client:
        state.mongo_client.close()
    
    logger.info("👋 Cleanup complete")


# ============================================
# FastAPI Application
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    await init_connections()
    
    # Start the analysis worker in background
    worker_task = asyncio.create_task(analysis_worker_loop())
    
    yield
    
    # Shutdown
    state.running = False
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    
    await close_connections()


app = FastAPI(
    title="RCE Analysis Worker",
    description="Static code analysis service for the RCE Engine",
    version=settings.version,
    lifespan=lifespan
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint for Docker orchestration.
    Returns service status and connection states.
    """
    redis_status = "disconnected"
    mongo_status = "disconnected"
    
    try:
        if state.redis_client:
            await state.redis_client.ping()
            redis_status = "connected"
    except Exception:
        redis_status = "error"
    
    try:
        if state.mongo_client:
            await state.mongo_client.admin.command('ping')
            mongo_status = "connected"
    except Exception:
        mongo_status = "error"
    
    return HealthResponse(
        status="healthy" if redis_status == "connected" and mongo_status == "connected" else "degraded",
        service=settings.service_name,
        version=settings.version,
        timestamp=datetime.utcnow().isoformat() + "Z",
        jobs_processed=state.jobs_processed,
        connections={
            "redis": redis_status,
            "mongo": mongo_status
        }
    )


@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": settings.service_name,
        "version": settings.version,
        "description": "Static code analysis worker for RCE Engine",
        "endpoints": {
            "health": "GET /health",
            "docs": "GET /docs"
        }
    }


# ============================================
# Main Entry Point
# ============================================

def handle_signals():
    """Set up signal handlers for graceful shutdown"""
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, initiating shutdown...")
        state.running = False
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


if __name__ == "__main__":
    handle_signals()
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
        reload=False
    )

