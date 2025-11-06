const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from root directory

// Test Supabase connection
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error && !error.message.includes('does not exist')) {
      console.log('❌ Supabase Connection Test Failed:', error.message);
      return false;
    }
    console.log('✅ Supabase Connection Successful');
    return true;
  } catch (error) {
    console.log('❌ Supabase Connection Error:', error.message);
    return false;
  }
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = await testSupabaseConnection();
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running', 
    database: dbStatus ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'AIOne.html'));
});

app.get('/AIOne.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'AIOne.html'));
});

app.get('/AIOne-NEW.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'AIOne-NEW.html'));
});

app.get('/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 AIOne Aircraft Tracker Server Starting...`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Port: ${PORT}`);
  
  // Test database connection on startup
  await testSupabaseConnection();
  console.log(`🎉 SERVER RUNNING on port ${PORT}`);
  console.log(`📁 Serving HTML files from root directory`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
});
