const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

const LOG_DIR = path.join(__dirname, '../logs');
const MAX_AGE_DAYS = 30;

async function cleanupLogs() {
  try {
    const files = await readdir(LOG_DIR);
    const now = Date.now();
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const fileStat = await stat(filePath);
      const fileAge = (now - fileStat.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (fileAge > MAX_AGE_DAYS) {
        await unlink(filePath);
        deletedCount++;
        console.log(`Deleted old log: ${file}`);
      }
    }
    
    console.log(`Cleaned up ${deletedCount} old log files`);
  } catch (error) {
    console.error('Error cleaning up logs:', error);
  }
}

cleanupLogs();
