console.log('🚀 STARTING AIOne Aircraft Tracker - Phase 3 - SECURITY ENHANCED');

// 1. Load required packages
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

console.log('✅ All packages loaded');

// 2. Create Express app
const app = express();
console.log('✅ Express app created');

// 3. Middleware - ADD CACHE CONTROL HEADERS
app.use(cors());
app.use(express.json());

// ADD CACHE BUSTING MIDDLEWARE
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

console.log('✅ Middleware configured with cache control');

// 4. Connect to MongoDB
console.log('🔗 Connecting to MongoDB...');
// Use cloud MongoDB if available, otherwise local
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aione-tracker';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => {
  console.log('❌ MongoDB Connection Failed:', err.message);
  process.exit(1);
});

// 5. User Schema and Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'viewer'], default: 'viewer' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// 6. Aircraft Schema and Model
const aircraftSchema = new mongoose.Schema({
  tailNumber: { type: String, required: true, unique: true },
  model: { type: String, required: true },
  manufacturer: { type: String, required: true },
  year: { type: Number, required: true },
  status: { type: String, enum: ['active', 'maintenance', 'retired'], default: 'active' },
  specifications: {
    maxSpeed: Number,
    range: Number,
    capacity: Number
  },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const Aircraft = mongoose.model('Aircraft', aircraftSchema);

// 7. Presentation Schema and Model
const presentationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  scheduledDate: { type: Date, required: true },
  duration: { type: Number, required: true }, // in minutes
  aircraft: { type: mongoose.Schema.Types.ObjectId, ref: 'Aircraft', required: true },
  presenter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['scheduled', 'in-progress', 'completed', 'cancelled'], default: 'scheduled' },
  createdAt: { type: Date, default: Date.now }
});

const Presentation = mongoose.model('Presentation', presentationSchema);

console.log('✅ Database models created');

// 8. JWT Secret (in production, use environment variable)
const JWT_SECRET = 'aione-tracker-secret-key-2024';

// 9. ENHANCED Authentication Middleware with detailed logging
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth Check - Header:', authHeader ? 'Present' : 'Missing');
  console.log('🔐 Auth Check - Token:', token ? `Present (${token.substring(0, 20)}...)` : 'Missing');
  console.log('🔐 Auth Check - Path:', req.path);
  console.log('🔐 Auth Check - Method:', req.method);

  if (!token) {
    console.log('❌ Auth Failed: No token provided');
    return res.status(401).json({ error: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ Auth Failed: Invalid token', err.message);
      return res.status(403).json({ error: 'Invalid or expired token. Please log in again.' });
    }
    
    console.log('✅ Auth Success: User', user.username, 'Role:', user.role);
    req.user = user;
    next();
  });
};

// 10. HEALTH CHECK ROUTES (Public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'AIOne Aircraft Tracker', timestamp: new Date() });
});

app.get('/api/auth/health', (req, res) => {
  res.json({ status: 'OK', service: 'Authentication API' });
});

// 11. AUTHENTICATION ROUTES (Public)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'viewer' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ New user registered:', username, 'Role:', role);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.log('❌ Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ Login failed: User not found for email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Login failed: Invalid password for user:', user.username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ User logged in:', user.username, 'Role:', user.role);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.log('❌ Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 12. AIRCRAFT ROUTES - ALL PROTECTED
app.get('/api/aircraft', authenticateToken, async (req, res) => {
  try {
    console.log('📋 User accessing aircraft data:', req.user.username, 'Role:', req.user.role);
    const aircraft = await Aircraft.find().populate('createdBy', 'username');
    res.json({ 
      message: 'Aircraft retrieved successfully', 
      count: aircraft.length,
      data: aircraft 
    });
  } catch (error) {
    console.log('❌ Get aircraft error:', error);
    res.status(500).json({ error: 'Failed to retrieve aircraft' });
  }
});

app.post('/api/aircraft', authenticateToken, async (req, res) => {
  try {
    console.log('✈️ User creating aircraft:', req.user.username, 'Role:', req.user.role);
    
    const { tailNumber, model, manufacturer, year, status, specifications } = req.body;

    // Validate required fields
    if (!tailNumber || !model || !manufacturer || !year) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const aircraft = new Aircraft({
      tailNumber,
      model,
      manufacturer,
      year,
      status: status || 'active',
      specifications: specifications || {},
      createdBy: req.user.userId
    });

    await aircraft.save();
    
    const populatedAircraft = await Aircraft.findById(aircraft._id).populate('createdBy', 'username');

    console.log('✅ Aircraft created:', tailNumber, 'by', req.user.username);

    res.status(201).json({
      message: 'Aircraft created successfully',
      data: populatedAircraft
    });

  } catch (error) {
    console.log('❌ Create aircraft error:', error);
    if (error.code === 11000) {
      res.status(400).json({ error: 'Aircraft with this tail number already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create aircraft' });
    }
  }
});

// ADDITIONAL AIRCRAFT ROUTES FOR COMPLETE PROTECTION
app.put('/api/aircraft/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 User updating aircraft:', req.user.username);
    
    const { id } = req.params;
    const updateData = req.body;

    const aircraft = await Aircraft.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    ).populate('createdBy', 'username');

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    console.log('✅ Aircraft updated:', aircraft.tailNumber, 'by', req.user.username);

    res.json({
      message: 'Aircraft updated successfully',
      data: aircraft
    });

  } catch (error) {
    console.log('❌ Update aircraft error:', error);
    res.status(500).json({ error: 'Failed to update aircraft' });
  }
});

app.delete('/api/aircraft/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ User deleting aircraft:', req.user.username);
    
    const { id } = req.params;

    const aircraft = await Aircraft.findByIdAndDelete(id);

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    console.log('✅ Aircraft deleted:', aircraft.tailNumber, 'by', req.user.username);

    res.json({
      message: 'Aircraft deleted successfully'
    });

  } catch (error) {
    console.log('❌ Delete aircraft error:', error);
    res.status(500).json({ error: 'Failed to delete aircraft' });
  }
});

// 13. PRESENTATION ROUTES - ALL PROTECTED
app.get('/api/presentations', authenticateToken, async (req, res) => {
  try {
    console.log('📅 User accessing presentations:', req.user.username);
    const presentations = await Presentation.find()
      .populate('aircraft')
      .populate('presenter', 'username')
      .populate('attendees', 'username');
    
    res.json({
      message: 'Presentations retrieved successfully',
      count: presentations.length,
      data: presentations
    });
  } catch (error) {
    console.log('❌ Get presentations error:', error);
    res.status(500).json({ error: 'Failed to retrieve presentations' });
  }
});

app.post('/api/presentations', authenticateToken, async (req, res) => {
  try {
    console.log('🎤 User creating presentation:', req.user.username);
    
    const { title, description, scheduledDate, duration, aircraft, attendees = [] } = req.body;

    // Validate required fields
    if (!title || !scheduledDate || !duration || !aircraft) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const presentation = new Presentation({
      title,
      description,
      scheduledDate,
      duration,
      aircraft,
      presenter: req.user.userId,
      attendees
    });

    await presentation.save();
    
    const populatedPresentation = await Presentation.findById(presentation._id)
      .populate('aircraft')
      .populate('presenter', 'username')
      .populate('attendees', 'username');

    console.log('✅ Presentation created:', title, 'by', req.user.username);

    res.status(201).json({
      message: 'Presentation scheduled successfully',
      data: populatedPresentation
    });

  } catch (error) {
    console.log('❌ Create presentation error:', error);
    res.status(500).json({ error: 'Failed to schedule presentation' });
  }
});

// ADDITIONAL PRESENTATION ROUTES FOR COMPLETE PROTECTION
app.put('/api/presentations/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 User updating presentation:', req.user.username);
    
    const { id } = req.params;
    const updateData = req.body;

    const presentation = await Presentation.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    )
    .populate('aircraft')
    .populate('presenter', 'username')
    .populate('attendees', 'username');

    if (!presentation) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    console.log('✅ Presentation updated:', presentation.title, 'by', req.user.username);

    res.json({
      message: 'Presentation updated successfully',
      data: presentation
    });

  } catch (error) {
    console.log('❌ Update presentation error:', error);
    res.status(500).json({ error: 'Failed to update presentation' });
  }
});

app.delete('/api/presentations/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🗑️ User deleting presentation:', req.user.username);
    
    const { id } = req.params;

    const presentation = await Presentation.findByIdAndDelete(id);

    if (!presentation) {
      return res.status(404).json({ error: 'Presentation not found' });
    }

    console.log('✅ Presentation deleted:', presentation.title, 'by', req.user.username);

    res.json({
      message: 'Presentation deleted successfully'
    });

  } catch (error) {
    console.log('❌ Delete presentation error:', error);
    res.status(500).json({ error: 'Failed to delete presentation' });
  }
});

// 14. USER ROUTES - PROTECTED
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    console.log('👥 User accessing user list:', req.user.username, 'Role:', req.user.role);
    
    // Only admin can access user list
    if (req.user.role !== 'admin') {
      console.log('❌ Access denied: User', req.user.username, 'tried to access admin route');
      return res.status(403).json({ error: 'Admin access required' });
    }

    const users = await User.find({}, 'username email role createdAt');
    
    console.log('✅ User list accessed by admin:', req.user.username);

    res.json({
      message: 'Users retrieved successfully',
      count: users.length,
      data: users
    });
  } catch (error) {
    console.log('❌ Get users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// 15. PROFILE ROUTE - PROTECTED
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    console.log('👤 Profile accessed by:', req.user.username);
    
    const user = await User.findById(req.user.userId, 'username email role createdAt');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile retrieved successfully',
      data: user
    });
  } catch (error) {
    console.log('❌ Get profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// 16. REGISTER HTML PAGE ROUTE (Public)
app.get('/register.html', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Register - AIOne Aircraft Tracker</title>
    <style>
        body { font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input, select, button { width: 100%; padding: 8px; margin-bottom: 10px; }
        button { background: #007bff; color: white; border: none; padding: 10px; cursor: pointer; }
        .message { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <h2>🚀 Create Your Account</h2>
    
    <div class="form-group">
        <label>Username:</label>
        <input type="text" id="username" placeholder="Choose a username">
    </div>
    
    <div class="form-group">
        <label>Email:</label>
        <input type="email" id="email" placeholder="your@email.com">
    </div>
    
    <div class="form-group">
        <label>Password:</label>
        <input type="password" id="password" placeholder="Enter a password">
    </div>
    
    <div class="form-group">
        <label>Role:</label>
        <select id="role">
            <option value="admin">Administrator</option>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
        </select>
    </div>
    
    <button id="registerBtn">Create Account</button>
    
    <div id="message"></div>

    <script>
        document.getElementById('registerBtn').addEventListener('click', function() {
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const role = document.getElementById('role').value;
            
            const messageDiv = document.getElementById('message');
            messageDiv.innerHTML = 'Creating account...';

            fetch('http://localhost:5000/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password, role })
            })
            .then(response => response.json())
            .then(data => {
                if (data.token) {
                    messageDiv.className = 'message success';
                    messageDiv.innerHTML = '✅ Account Created! Token: ' + data.token;
                } else {
                    messageDiv.className = 'message error';
                    messageDiv.innerHTML = '❌ Error: ' + data.error;
                }
            })
            .catch(error => {
                messageDiv.className = 'message error';
                messageDiv.innerHTML = '❌ Connection failed: ' + error.message;
            });
        });
    </script>
</body>
</html>
  `);
});

// 17. SERVE AIOne.html FILE (Public) - WITH CACHE CONTROL
app.get('/AIOne.html', (req, res) => {
  // ADD STRONG CACHE CONTROL FOR HTML FILES
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(__dirname + '/AIOne.html');
});

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(__dirname + '/AIOne.html');
});

// 18. SERVE AIOne-NEW.html FILE (Public)
app.get('/AIOne-NEW.html', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(__dirname + '/AIOne-NEW.html');
});

console.log('✅ All API routes configured');
console.log('✅ HTML routes configured with cache control');

// 19. START SERVER
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 SERVER RUNNING on http://localhost:${PORT}`);
  console.log(`📚 AVAILABLE ENDPOINTS:`);
  console.log(`   GET  /api/health (Public)`);
  console.log(`   GET  /api/auth/health (Public)`);
  console.log(`   POST /api/auth/register (Public)`);
  console.log(`   POST /api/auth/login (Public)`);
  console.log(`   GET  /api/auth/profile (Protected)`);
  console.log(`   GET  /api/aircraft (Protected)`);
  console.log(`   POST /api/aircraft (Protected)`);
  console.log(`   PUT  /api/aircraft/:id (Protected)`);
  console.log(`   DELETE /api/aircraft/:id (Protected)`);
  console.log(`   GET  /api/presentations (Protected)`);
  console.log(`   POST /api/presentations (Protected)`);
  console.log(`   PUT  /api/presentations/:id (Protected)`);
  console.log(`   DELETE /api/presentations/:id (Protected)`);
  console.log(`   GET  /api/users (Protected - admin only)`);
  console.log(`   GET  /register.html (Registration Page - Public)`);
  console.log(`   GET  /AIOne.html (Main Application - Public)`);
  console.log(`   GET  /AIOne-NEW.html (New Application - Public)`);
  console.log(`   GET  / (Main Application - Public)`);
  console.log('');
  console.log('🔐 SECURITY STATUS: ALL data routes require authentication');
  console.log('🔄 CACHE CONTROL: Added aggressive cache busting');
  console.log('🚀 READY FOR SECURE AIRCRAFT DATA TESTING!');
})
.on('error', (err) => {
  console.log('❌ SERVER STARTUP ERROR:', err.message);
  process.exit(1);
});