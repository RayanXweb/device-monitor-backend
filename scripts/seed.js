const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../src/models/User');
const Device = require('../src/models/Device');

dotenv.config();

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Clear existing data
    await User.deleteMany({});
    await Device.deleteMany({});
    
    // Create admin user
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const admin = await User.create({
      name: process.env.ADMIN_NAME,
      email: process.env.ADMIN_EMAIL,
      password: hashedPassword,
      role: 'super_admin',
      permissions: ['manage_devices', 'execute_commands', 'view_reports', 'manage_users', 'view_logs'],
      isActive: true,
      isEmailVerified: true
    });
    
    console.log(`Admin user created: ${admin.email}`);
    
    // Create sample devices
    const sampleDevices = [
      {
        deviceId: 'device_sample_001',
        deviceName: 'Sample Device 1',
        brand: 'Samsung',
        model: 'Galaxy S21',
        androidVersion: '13',
        status: 'active',
        userId: admin._id,
        heartbeat: { lastSeen: new Date(), status: 'online' },
        battery: { level: 85, isCharging: false },
        signalInfo: { level: 75, type: '5G' }
      },
      {
        deviceId: 'device_sample_002',
        deviceName: 'Sample Device 2',
        brand: 'Xiaomi',
        model: 'Mi 11',
        androidVersion: '12',
        status: 'active',
        userId: admin._id,
        heartbeat: { lastSeen: new Date(), status: 'online' },
        battery: { level: 45, isCharging: true },
        signalInfo: { level: 60, type: '4G' }
      },
      {
        deviceId: 'device_sample_003',
        deviceName: 'Sample Device 3',
        brand: 'Google',
        model: 'Pixel 6',
        androidVersion: '13',
        status: 'pending',
        userId: admin._id,
        heartbeat: { lastSeen: new Date(Date.now() - 3600000), status: 'offline' }
      }
    ];
    
    for (const deviceData of sampleDevices) {
      const device = new Device(deviceData);
      await device.save();
      console.log(`Device created: ${device.deviceName}`);
    }
    
    console.log('✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
