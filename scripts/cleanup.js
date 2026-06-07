const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Keylog = require('../src/models/Keylog');
const Location = require('../src/models/Location');
const Command = require('../src/models/Command');
const Notification = require('../src/models/Notification');
const AuditLog = require('../src/models/AuditLog');

dotenv.config();

const cleanup = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Delete old keylogs (30 days)
    const keylogsDeleted = await Keylog.deleteOldKeylogs(30);
    console.log(`Deleted ${keylogsDeleted} old keylogs`);
    
    // Delete old locations (30 days)
    const locationsDeleted = await Location.deleteOldLocations(30);
    console.log(`Deleted ${locationsDeleted} old locations`);
    
    // Delete old commands (90 days)
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const commandsDeleted = await Command.deleteMany({ createdAt: { $lt: cutoffDate } });
    console.log(`Deleted ${commandsDeleted.deletedCount} old commands`);
    
    // Delete old notifications (30 days)
    const notificationsDeleted = await Notification.deleteMany({ createdAt: { $lt: cutoffDate } });
    console.log(`Deleted ${notificationsDeleted.deletedCount} old notifications`);
    
    // Delete old audit logs (365 days)
    const auditCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const auditDeleted = await AuditLog.deleteMany({ timestamp: { $lt: auditCutoff } });
    console.log(`Deleted ${auditDeleted.deletedCount} old audit logs`);
    
    console.log('✅ Cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup error:', error);
    process.exit(1);
  }
};

cleanup();
