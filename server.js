const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET || 'aione-tracker-secret-key-2024';

// Test Supabase connection
async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (error && error.code !== '42P01') {
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

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ==================== AUTHENTICATION ROUTES ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'viewer' } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, email, password: password_hash, role }])
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      throw error;
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: data[0].id, 
        username: data[0].username, 
        role: data[0].role 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: data[0].id,
        username: data[0].username,
        email: data[0].email,
        role: data[0].role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        user_id: user.id, 
        username: user.username, 
        role: user.role 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// ==================== AIRCRAFT DATA ROUTES ====================

// Get all aircraft for authenticated user
app.get('/api/aircraft', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('aircraft')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      message: 'Aircraft data retrieved successfully',
      data: data || []
    });

  } catch (error) {
    console.error('Get aircraft error:', error);
    res.status(500).json({ error: 'Failed to retrieve aircraft data' });
  }
});

// Create new aircraft
app.post('/api/aircraft', authenticateToken, async (req, res) => {
  try {
    const aircraftData = {
      ...req.body,
      user_id: req.user.user_id
    };

    const { data, error } = await supabase
      .from('aircraft')
      .insert([aircraftData])
      .select();

    if (error) throw error;

    res.status(201).json({
      message: 'Aircraft created successfully',
      data: data[0]
    });

  } catch (error) {
    console.error('Create aircraft error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Aircraft with this MSN already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create aircraft' });
  }
});

// Update aircraft
app.put('/api/aircraft/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const aircraftData = req.body;

    // Verify aircraft belongs to user
    const { data: existing, error: checkError } = await supabase
      .from('aircraft')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    const { data, error } = await supabase
      .from('aircraft')
      .update(aircraftData)
      .eq('id', id)
      .select();

    if (error) throw error;

    res.json({
      message: 'Aircraft updated successfully',
      data: data[0]
    });

  } catch (error) {
    console.error('Update aircraft error:', error);
    res.status(500).json({ error: 'Failed to update aircraft' });
  }
});

// Delete aircraft
app.delete('/api/aircraft/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify aircraft belongs to user
    const { data: existing, error: checkError } = await supabase
      .from('aircraft')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.user_id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    const { error } = await supabase
      .from('aircraft')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Aircraft deleted successfully' });

  } catch (error) {
    console.error('Delete aircraft error:', error);
    res.status(500).json({ error: 'Failed to delete aircraft' });
  }
});

// ==================== HTML ROUTES ====================

// Serve main application
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

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 AIOne Aircraft Tracker Server Starting...`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Port: ${PORT}`);
  console.log(`🌐 Server URL: https://aione-aircraft-tracker-1.onrender.com`);
  
  // Test database connection on startup
  await testSupabaseConnection();
  console.log(`🎉 SERVER RUNNING on port ${PORT}`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
});


