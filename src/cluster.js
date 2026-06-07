const cluster = require('cluster');
const os = require('os');
const { logger } = require('./utils/logger');

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  logger.info(`Master ${process.pid} is running`);
  logger.info(`Starting ${numCPUs} workers...`);
  
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  // Handle worker exit
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Code: ${code}, Signal: ${signal}`);
    logger.info('Starting a new worker...');
    cluster.fork();
  });
  
  // Handle worker online
  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });
} else {
  require('./app');
  logger.info(`Worker ${process.pid} started`);
       }
