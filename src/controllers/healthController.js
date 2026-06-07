const mongoose = require('mongoose');
const os = require('os');
const { cache } = require('../config/redis');
const { logger } = require('../utils/logger');

// Get system health
const getHealth = async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: require('../../package.json').version,
      services: {
        database: {
          status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          name: mongoose.connection.name,
          host: mongoose.connection.host
        },
        redis: {
          status: cache.client?.status === 'ready' ? 'connected' : 'disconnected'
        }
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%'
        },
        loadAverage: os.loadavg()
      },
      memory: {
        rss: process.memoryUsage().rss,
        heapTotal: process.memoryUsage().heapTotal,
        heapUsed: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external
      }
    };
    
    // Determine overall status
    if (health.services.database.status !== 'connected' || 
        health.services.redis.status !== 'connected') {
      health.status = 'degraded';
    }
    
    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Readiness probe
const getReadiness = async (req, res) => {
  try {
    const dbReady = mongoose.connection.readyState === 1;
    const redisReady = cache.client?.status === 'ready';
    
    if (dbReady && redisReady) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ 
        status: 'not ready',
        database: dbReady ? 'ready' : 'not ready',
        redis: redisReady ? 'ready' : 'not ready'
      });
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
};

// Liveness probe
const getLiveness = async (req, res) => {
  res.status(200).json({ status: 'alive' });
};

// Metrics endpoint for Prometheus
const getMetrics = async (req, res) => {
  try {
    const metrics = [];
    
    // Basic metrics
    metrics.push(`# HELP nodejs_uptime_seconds Uptime of the Node.js process`);
    metrics.push(`# TYPE nodejs_uptime_seconds gauge`);
    metrics.push(`nodejs_uptime_seconds ${process.uptime()}`);
    
    metrics.push(`# HELP nodejs_memory_usage_bytes Memory usage of the Node.js process`);
    metrics.push(`# TYPE nodejs_memory_usage_bytes gauge`);
    metrics.push(`nodejs_memory_usage_bytes{type="rss"} ${process.memoryUsage().rss}`);
    metrics.push(`nodejs_memory_usage_bytes{type="heap_used"} ${process.memoryUsage().heapUsed}`);
    metrics.push(`nodejs_memory_usage_bytes{type="heap_total"} ${process.memoryUsage().heapTotal}`);
    
    // Database metrics
    const dbStats = await mongoose.connection.db.stats();
    metrics.push(`# HELP mongodb_collection_count Number of collections in database`);
    metrics.push(`# TYPE mongodb_collection_count gauge`);
    metrics.push(`mongodb_collection_count ${dbStats.collections}`);
    
    metrics.push(`# HELP mongodb_object_count Number of objects in database`);
    metrics.push(`# TYPE mongodb_object_count gauge`);
    metrics.push(`mongodb_object_count ${dbStats.objects}`);
    
    // Active connections
    metrics.push(`# HELP nodejs_active_handles Number of active handles`);
    metrics.push(`# TYPE nodejs_active_handles gauge`);
    metrics.push(`nodejs_active_handles ${process._getActiveHandles().length}`);
    
    metrics.push(`# HELP nodejs_active_requests Number of active requests`);
    metrics.push(`# TYPE nodejs_active_requests gauge`);
    metrics.push(`nodejs_active_requests ${process._getActiveRequests().length}`);
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  } catch (error) {
    logger.error('Metrics error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getHealth,
  getReadiness,
  getLiveness,
  getMetrics
};
