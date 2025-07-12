import React, { useState, useEffect, useContext, createContext } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token and get user info
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = (userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('token', tokenData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${tokenData}`;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// WebSocket Hook
const useWebSocket = (userId) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (userId) {
      const wsUrl = `${BACKEND_URL.replace('https://', 'wss://')}/ws/${userId}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setSocket(ws);
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setMessages(prev => [...prev, message]);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setSocket(null);
      };
      
      return () => {
        ws.close();
      };
    }
  }, [userId]);

  return { socket, messages };
};

// Components
const LoginForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const data = isLogin 
        ? { email, password }
        : { email, password, name };

      const response = await axios.post(`${API}${endpoint}`, data);
      
      login(response.data.user, response.data.access_token);
    } catch (error) {
      setError(error.response?.data?.detail || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 flex items-center justify-center p-4">
      <div className="bg-black/20 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">💓 Pulse</h1>
          <p className="text-gray-300">Connect with your partner intimately</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                required
              />
            </div>
          )}
          
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
              required
            />
          </div>
          
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
              required
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Loading...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-gray-300 hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PairingScreen = ({ user }) => {
  const [pairingCode, setPairingCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handlePair = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post(`${API}/pairing/link`, { pairing_code: pairingCode });
      // Refresh user data
      window.location.reload();
    } catch (error) {
      setError(error.response?.data?.detail || 'Pairing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 flex items-center justify-center p-4">
      <div className="bg-black/20 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">👫 Link with Partner</h1>
          <p className="text-gray-300">Share your code or enter theirs</p>
        </div>

        <div className="mb-8">
          <label className="block text-gray-300 mb-2">Your Pairing Code:</label>
          <div className="bg-white/10 border border-white/20 rounded-xl p-4 text-center">
            <span className="text-3xl font-mono text-white tracking-wider">
              {user.pairing_code || '------'}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-2">Share this code with your partner</p>
        </div>

        <form onSubmit={handlePair} className="space-y-6">
          <div>
            <label className="block text-gray-300 mb-2">Partner's Code:</label>
            <input
              type="text"
              placeholder="Enter 6-digit code"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 text-center text-xl font-mono tracking-wider"
              maxLength="6"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || pairingCode.length !== 6}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Linking...' : 'Link with Partner'}
          </button>
        </form>
      </div>
    </div>
  );
};

const MoodSelector = ({ onMoodSelect }) => {
  const moods = [
    { id: 'feeling_spicy', name: 'Feeling Spicy', emoji: '🌶️', color: 'from-red-500 to-orange-500' },
    { id: 'horny', name: 'Horny', emoji: '🔥', color: 'from-orange-500 to-red-500' },
    { id: 'teasing', name: 'Teasing', emoji: '😈', color: 'from-purple-500 to-pink-500' },
    { id: 'romantic', name: 'Romantic', emoji: '💕', color: 'from-pink-500 to-purple-500' },
    { id: 'playful', name: 'Playful', emoji: '😏', color: 'from-blue-500 to-purple-500' },
    { id: 'unavailable', name: 'Unavailable', emoji: '🚫', color: 'from-gray-500 to-gray-600' },
  ];

  const [selectedMood, setSelectedMood] = useState(null);
  const [intensity, setIntensity] = useState(3);

  const handleMoodSelect = (mood) => {
    setSelectedMood(mood);
    onMoodSelect(mood, intensity);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {moods.map((mood) => (
        <button
          key={mood.id}
          onClick={() => handleMoodSelect(mood)}
          className={`p-4 rounded-2xl bg-gradient-to-br ${mood.color} text-white hover:scale-105 transition-transform duration-200 shadow-lg`}
        >
          <div className="text-3xl mb-2">{mood.emoji}</div>
          <div className="font-semibold">{mood.name}</div>
        </button>
      ))}
    </div>
  );
};

const TaskCreator = ({ onTaskCreate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [duration, setDuration] = useState(60);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onTaskCreate({
      title,
      description,
      reward,
      duration_minutes: duration
    });
    setTitle('');
    setDescription('');
    setReward('');
    setDuration(60);
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-4 rounded-2xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        <span className="text-xl">🎯</span>
        Create Heat Task
      </button>
    );
  }

  return (
    <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold text-white mb-4">Create Heat Task</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
          required
        />
        
        <textarea
          placeholder="Describe the task..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 h-24 resize-none"
          required
        />
        
        <input
          type="text"
          placeholder="Reward (optional)"
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
        
        <div>
          <label className="block text-gray-300 mb-2">Duration: {duration} minutes</label>
          <input
            type="range"
            min="15"
            max="240"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full"
          />
        </div>
        
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Create Task
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-gray-300 hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const Dashboard = ({ user }) => {
  const [moods, setMoods] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('moods');
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const { logout } = useAuth();
  const { messages } = useWebSocket(user.id);

  useEffect(() => {
    fetchMoods();
    fetchTasks();
  }, []);

  useEffect(() => {
    // Handle WebSocket messages
    messages.forEach(message => {
      if (message.type === 'mood_update') {
        fetchMoods();
      } else if (message.type === 'new_task') {
        fetchTasks();
      } else if (message.type === 'task_completed') {
        fetchTasks();
      }
    });
  }, [messages]);

  const fetchMoods = async () => {
    try {
      const response = await axios.get(`${API}/moods`);
      setMoods(response.data);
    } catch (error) {
      console.error('Error fetching moods:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API}/tasks`);
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const handleMoodSelect = async (mood, intensity) => {
    try {
      const response = await axios.post(`${API}/moods`, {
        mood_type: mood.id,
        intensity: intensity,
        duration_minutes: 60
      });
      
      if (response.data.ai_suggestion) {
        setAiSuggestion(response.data.ai_suggestion);
      }
      
      fetchMoods();
    } catch (error) {
      console.error('Error setting mood:', error);
    }
  };

  const handleTaskCreate = async (taskData) => {
    try {
      await axios.post(`${API}/tasks`, taskData);
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">💓 Pulse</h1>
            <p className="text-gray-300">Hey {user.name}!</p>
          </div>
          <button
            onClick={logout}
            className="p-2 bg-white/10 rounded-full text-gray-300 hover:bg-white/20 transition-colors"
          >
            <span className="text-xl">🚪</span>
          </button>
        </div>

        {/* AI Suggestion Modal */}
        {aiSuggestion && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-black/90 backdrop-blur-lg rounded-2xl p-6 border border-white/10 max-w-sm w-full">
              <h3 className="text-xl font-bold text-white mb-4">✨ AI Suggestion</h3>
              <div className="space-y-3">
                <h4 className="text-lg text-pink-400">{aiSuggestion.title}</h4>
                <p className="text-gray-300">{aiSuggestion.description}</p>
                <p className="text-sm text-gray-400">Duration: {aiSuggestion.default_duration_minutes} minutes</p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    handleTaskCreate({
                      title: aiSuggestion.title,
                      description: aiSuggestion.description,
                      duration_minutes: aiSuggestion.default_duration_minutes
                    });
                    setAiSuggestion(null);
                  }}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                  Create Task
                </button>
                <button
                  onClick={() => setAiSuggestion(null)}
                  className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-gray-300 hover:bg-white/20 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex bg-black/20 backdrop-blur-lg rounded-2xl p-1 mb-6">
          <button
            onClick={() => setActiveTab('moods')}
            className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-colors ${
              activeTab === 'moods'
                ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Moods
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-colors ${
              activeTab === 'tasks'
                ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Tasks
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'moods' && (
            <div className="space-y-6">
              <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                <h3 className="text-xl font-bold text-white mb-4">How are you feeling?</h3>
                <MoodSelector onMoodSelect={handleMoodSelect} />
              </div>
              
              {moods.length > 0 && (
                <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                  <h3 className="text-xl font-bold text-white mb-4">Recent Moods</h3>
                  <div className="space-y-3">
                    {moods.map((mood) => (
                      <div key={mood.id} className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                        <div>
                          <span className="text-white font-semibold">{mood.mood_type.replace('_', ' ')}</span>
                          <span className="text-gray-300 ml-2">Intensity: {mood.intensity}/5</span>
                        </div>
                        <span className="text-gray-400 text-sm">{formatTimeRemaining(mood.expires_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-6">
              <TaskCreator onTaskCreate={handleTaskCreate} />
              
              {tasks.length > 0 && (
                <div className="space-y-4">
                  {tasks.map((task) => (
                    <div key={task.id} className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="text-lg font-semibold text-white">{task.title}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          task.status === 'expired' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {task.status}
                        </span>
                      </div>
                      <p className="text-gray-300 mb-3">{task.description}</p>
                      {task.reward && (
                        <p className="text-pink-400 mb-3">🎁 Reward: {task.reward}</p>
                      )}
                      <div className="flex items-center justify-between text-sm text-gray-400">
                        <span>{task.creator_id === user.id ? 'Created by you' : 'From your partner'}</span>
                        <span>{formatTimeRemaining(task.expires_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  if (!user.couple_id) {
    return <PairingScreen user={user} />;
  }

  return <Dashboard user={user} />;
}

export default App;