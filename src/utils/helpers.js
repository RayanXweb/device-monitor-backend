const crypto = require('crypto');

// Generate random ID
const generateId = (length = 16) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate random PIN
const generatePIN = (length = 6) => {
  return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
};

// Sleep function
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Format date
const formatDate = (date, format = 'ISO') => {
  const d = new Date(date);
  if (format === 'ISO') return d.toISOString();
  if (format === 'locale') return d.toLocaleString();
  return d.toString();
};

// Calculate pagination
const getPagination = (page, limit, total) => {
  const currentPage = parseInt(page) || 1;
  const perPage = parseInt(limit) || 20;
  const totalPages = Math.ceil(total / perPage);
  const offset = (currentPage - 1) * perPage;
  
  return {
    currentPage,
    perPage,
    totalPages,
    offset,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1
  };
};

// Mask sensitive data
const maskSensitiveData = (data, fields = ['password', 'token', 'pin']) => {
  if (!data) return data;
  
  const masked = { ...data };
  for (const field of fields) {
    if (masked[field]) {
      masked[field] = '[REDACTED]';
    }
  }
  return masked;
};

// Validate email format
const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Validate phone number
const isValidPhone = (phone) => {
  const re = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}$/;
  return re.test(phone);
};

// Parse user agent
const parseUserAgent = (userAgent) => {
  const result = {
    browser: 'Unknown',
    os: 'Unknown',
    device: 'Unknown'
  };
  
  if (!userAgent) return result;
  
  // Browser detection
  if (userAgent.includes('Chrome')) result.browser = 'Chrome';
  else if (userAgent.includes('Firefox')) result.browser = 'Firefox';
  else if (userAgent.includes('Safari')) result.browser = 'Safari';
  else if (userAgent.includes('Edge')) result.browser = 'Edge';
  
  // OS detection
  if (userAgent.includes('Windows')) result.os = 'Windows';
  else if (userAgent.includes('Mac')) result.os = 'macOS';
  else if (userAgent.includes('Linux')) result.os = 'Linux';
  else if (userAgent.includes('Android')) result.os = 'Android';
  else if (userAgent.includes('iOS')) result.os = 'iOS';
  
  // Device detection
  if (userAgent.includes('Mobile')) result.device = 'Mobile';
  else result.device = 'Desktop';
  
  return result;
};

module.exports = {
  generateId,
  generatePIN,
  sleep,
  formatDate,
  getPagination,
  maskSensitiveData,
  isValidEmail,
  isValidPhone,
  parseUserAgent
};
