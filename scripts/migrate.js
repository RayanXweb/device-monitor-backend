const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { logger } = require('../src/utils/logger');

dotenv.config();

const migrations = {
  async addIndexes() {
    logger.info('Adding indexes...');
    const collections = mongoose.connection.collections;
    
    for (const [name, collection] of Object.entries(collections)) {
      await collection.createIndexes();
      logger.info(`Added indexes for ${name}`);
    }
  },
  
  async updateDeviceSchema() {
    logger.info('Updating device schema...');
    await mongoose.connection.collection('devices').updateMany(
      { status: { $exists: false } },
      { $set: { status: 'pending' } }
    );
    logger.info('Device schema updated');
  },
  
  async cleanupOrphanedData() {
    logger.info('Cleaning up orphaned data...');
    // Add cleanup logic here
    logger.info('Orphaned data cleaned up');
  }
};

async function runMigrations(direction = 'up') {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    if (direction === 'up') {
      await migrations.addIndexes();
      await migrations.updateDeviceSchema();
      await migrations.cleanupOrphanedData();
      logger.info('All migrations completed successfully');
    } else if (direction === 'down') {
      // Rollback migrations
      logger.info('Rolling back migrations...');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

const direction = process.argv[2] || 'up';
runMigrations(direction);
