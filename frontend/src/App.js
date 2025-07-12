import React, { useState, useEffect, useContext, createContext, useRef } from 'react';
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

// Enhanced WebSocket Hook with Notifications
const useWebSocket = (userId) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);

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
        
        // Add notification for display
        if (message.type && message.message) {
          const notification = {
            id: Date.now(),
            type: message.type,
            message: message.message,
            timestamp: new Date()
          };
          setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10
        }
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

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return { socket, messages, notifications, dismissNotification };
};

// Enhanced Components

// Notification Toast Component
const NotificationToast = ({ notification, onDismiss }) => {
  const getTypeColor = (type) => {
    switch (type) {
      case 'new_task': return 'from-purple-500 to-pink-500';
      case 'task_completed': return 'from-blue-500 to-purple-500';
      case 'task_approved': return 'from-green-500 to-blue-500';
      case 'task_rejected': return 'from-red-500 to-orange-500';
      case 'task_expired': return 'from-gray-500 to-red-500';
      case 'new_reward': return 'from-yellow-500 to-orange-500';
      case 'reward_redeemed': return 'from-pink-500 to-purple-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const getTypeEmoji = (type) => {
    switch (type) {
      case 'new_task': return '🎯';
      case 'task_completed': return '✅';
      case 'task_approved': return '🎉';
      case 'task_rejected': return '❌';
      case 'task_expired': return '⏰';
      case 'new_reward': return '🎁';
      case 'reward_redeemed': return '💎';
      default: return '📢';
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), 5000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div className={`mb-2 p-3 rounded-xl bg-gradient-to-r ${getTypeColor(notification.type)} text-white shadow-lg animate-fade-in`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getTypeEmoji(notification.type)}</span>
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
        <button 
          onClick={() => onDismiss(notification.id)}
          className="text-white/80 hover:text-white ml-2"
        >
          ×
        </button>
      </div>
    </div>
  );
};

// Countdown Timer Component
const CountdownTimer = ({ expiresAt, onExpired }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const diff = expires - now;
      
      if (diff <= 0) {
        setTimeLeft('Expired');
        setIsExpired(true);
        if (onExpired) onExpired();
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
      
      setIsExpired(false);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  return (
    <span className={`text-sm font-mono ${
      isExpired ? 'text-red-400' : 
      timeLeft.includes('s') && !timeLeft.includes('m') ? 'text-yellow-400' :
      'text-gray-400'
    }`}>
      {timeLeft}
    </span>
  );
};

// Photo Upload Component
const PhotoUpload = ({ onPhotoSelected, existingPhoto }) => {
  const [preview, setPreview] = useState(existingPhoto || null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64String = e.target.result;
        setPreview(base64String);
        onPhotoSelected(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPreview(null);
    onPhotoSelected(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {preview ? (
        <div className="relative">
          <img 
            src={preview} 
            alt="Proof preview" 
            className="w-full h-48 object-cover rounded-xl"
          />
          <button
            onClick={removePhoto}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-48 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-pink-500 hover:text-pink-500 transition-colors"
        >
          <span className="text-4xl mb-2">📸</span>
          <span>Tap to add photo proof</span>
          <span className="text-xs mt-1">Max 5MB</span>
        </button>
      )}
    </div>
  );
};

// Token Display Component
const TokenDisplay = ({ tokens, lifetimeTokens, size = "normal" }) => {
  const sizeClasses = {
    small: "text-sm",
    normal: "text-lg",
    large: "text-2xl"
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-yellow-400">🪙</span>
      <span className={`font-bold text-yellow-400 ${sizeClasses[size]}`}>
        {tokens || 0}
      </span>
      {lifetimeTokens !== undefined && (
        <span className="text-xs text-gray-400">
          ({lifetimeTokens} lifetime)
        </span>
      )}
    </div>
  );
};

// Reward Creator Component
const RewardCreator = ({ onRewardCreate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tokensCost, setTokensCost] = useState(10);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onRewardCreate({
      title,
      description,
      tokens_cost: tokensCost
    });
    setTitle('');
    setDescription('');
    setTokensCost(10);
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-4 rounded-2xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        <span className="text-xl">🎁</span>
        Create Reward
      </button>
    );
  }

  return (
    <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold text-white mb-4">Create Reward</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Reward title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          required
        />
        
        <textarea
          placeholder="Describe the reward..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 h-24 resize-none"
          required
        />

        <div>
          <label className="block text-gray-300 mb-2">Token Cost: {tokensCost} 🪙</label>
          <input
            type="range"
            min="1"
            max="50"
            value={tokensCost}
            onChange={(e) => setTokensCost(e.target.value)}
            className="w-full"
          />
        </div>
        
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Create Reward
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

// Reward Card Component
const RewardCard = ({ reward, onRedeem, userTokens, isRedeemable = true }) => {
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  
  const canAfford = userTokens >= reward.tokens_cost;
  const isAvailable = !reward.is_redeemed && isRedeemable;

  const handleRedeem = async () => {
    if (!canAfford) {
      alert(`Not enough tokens! You need ${reward.tokens_cost} but have ${userTokens}`);
      return;
    }

    setRedeeming(true);
    try {
      await onRedeem(reward.id);
      setShowRedeemModal(false);
    } catch (error) {
      console.error('Error redeeming reward:', error);
      alert('Failed to redeem reward');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <>
      <div className={`bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10 ${
        reward.is_redeemed ? 'opacity-60' : ''
      }`}>
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-lg font-semibold text-white pr-2">{reward.title}</h4>
          {reward.is_redeemed && (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-500/20 text-green-400">
              Redeemed ✅
            </span>
          )}
        </div>
        
        <p className="text-gray-300 mb-4">{reward.description}</p>
        
        <div className="flex items-center justify-between mb-4">
          <TokenDisplay tokens={reward.tokens_cost} size="normal" />
          {reward.is_redeemed && reward.redeemed_at && (
            <span className="text-xs text-gray-400">
              Redeemed {new Date(reward.redeemed_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {isAvailable && (
          <button
            onClick={() => setShowRedeemModal(true)}
            disabled={!canAfford}
            className={`w-full py-3 rounded-xl font-semibold transition-opacity ${
              canAfford 
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:opacity-90' 
                : 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
            }`}
          >
            {canAfford ? 'Redeem' : `Need ${reward.tokens_cost - userTokens} more tokens`}
          </button>
        )}
      </div>

      {/* Redeem Confirmation Modal */}
      {showRedeemModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-black/90 backdrop-blur-lg rounded-2xl p-6 border border-white/10 max-w-sm w-full">
            <h3 className="text-xl font-bold text-white mb-4">Redeem Reward</h3>
            
            <div className="text-center mb-6">
              <h4 className="text-lg text-yellow-400 mb-2">{reward.title}</h4>
              <p className="text-gray-300 mb-4">{reward.description}</p>
              
              <div className="flex items-center justify-center gap-4 mb-4">
                <span className="text-gray-400">Cost:</span>
                <TokenDisplay tokens={reward.tokens_cost} size="large" />
              </div>
              
              <div className="flex items-center justify-center gap-4">
                <span className="text-gray-400">Your balance:</span>
                <TokenDisplay tokens={userTokens} size="large" />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleRedeem}
                disabled={redeeming}
                className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {redeeming ? 'Redeeming...' : 'Confirm Redeem'}
              </button>
              <button
                onClick={() => setShowRedeemModal(false)}
                disabled={redeeming}
                className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-gray-300 hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
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
  const [myPairingCode, setMyPairingCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    // Get or generate pairing code when component mounts
    getPairingCode();
  }, []);

  const getPairingCode = async () => {
    try {
      const response = await axios.get(`${API}/pairing/code`);
      setMyPairingCode(response.data.pairing_code);
    } catch (error) {
      console.error('Error getting pairing code:', error);
      generateNewCode();
    }
  };

  const generateNewCode = async () => {
    setGeneratingCode(true);
    try {
      const response = await axios.post(`${API}/pairing/generate`);
      setMyPairingCode(response.data.pairing_code);
    } catch (error) {
      console.error('Error generating pairing code:', error);
      setError('Failed to generate pairing code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handlePairingCodeChange = (e) => {
    const value = e.target.value;
    // Allow alphanumeric characters (A-Z, 0-9) and limit to 6 characters
    const cleanedValue = value.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    setPairingCode(cleanedValue);
    
    // Clear any previous errors when user starts typing
    if (error && !error.includes('Waiting')) {
      setError('');
    }
  };

  const handlePair = async (e) => {
    e.preventDefault();
    
    if (pairingCode.length !== 6) {
      setError('Please enter a complete 6-character code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('Attempting to pair with code:', pairingCode);
      const response = await axios.post(`${API}/pairing/link`, { pairing_code: pairingCode });
      
      console.log('Pairing response:', response.data);
      
      if (response.data.couple_id) {
        // Successfully linked - reload page to update user data
        setError('Success! Linking with partner...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        // Pairing request created, waiting for partner
        setError('Pairing request sent! Waiting for your partner to join...');
      }
    } catch (error) {
      console.error('Pairing error:', error);
      const errorMessage = error.response?.data?.detail || 'Pairing failed. Please check the code and try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isButtonDisabled = loading || pairingCode.length !== 6;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 flex items-center justify-center p-4">
      <div className="bg-black/20 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md border border-white/10">
        {/* Enhanced Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">👫 Link with Partner</h1>
          <p className="text-gray-300">Share your code or enter theirs to connect</p>
          <p className="text-xs text-gray-400 mt-2">You'll be able to create tasks and share moods together</p>
        </div>

        {/* Your Pairing Code Section */}
        <div className="mb-8">
          <label className="block text-gray-300 mb-2 font-semibold">Your Pairing Code:</label>
          <div className="bg-white/10 border border-white/20 rounded-xl p-4 text-center">
            <span className="text-3xl font-mono text-white tracking-wider">
              {myPairingCode || '------'}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-gray-400">Share this code with your partner</p>
            <button
              onClick={generateNewCode}
              disabled={generatingCode}
              className="text-sm text-pink-400 hover:text-pink-300 disabled:opacity-50 underline"
            >
              {generatingCode ? 'Generating...' : 'New Code'}
            </button>
          </div>
        </div>

        {/* Partner's Code Input Section */}
        <form onSubmit={handlePair} className="space-y-6">
          <div>
            <label className="block text-gray-300 mb-2 font-semibold">Partner's Code:</label>
            <input
              type="text"
              placeholder="Enter 6-character code"
              value={pairingCode}
              onChange={handlePairingCodeChange}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 text-center text-xl font-mono tracking-wider uppercase"
              maxLength="6"
              autoComplete="off"
            />
          </div>

          {error && (
            <div className={`text-sm text-center p-3 rounded-xl ${
              error.includes('Waiting') || error.includes('Success') ? 'bg-blue-500/20 text-blue-400' : 
              error.includes('Success') ? 'bg-green-500/20 text-green-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {error}
            </div>
          )}

          {/* Enhanced Submit Button */}
          <button
            type="submit"
            disabled={isButtonDisabled}
            className={`w-full py-3 rounded-xl font-semibold transition-all duration-200 ${
              isButtonDisabled
                ? 'bg-gray-500/20 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:opacity-90 hover:scale-[1.02]'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Linking...
              </div>
            ) : (
              `Link with Partner ${pairingCode.length === 6 ? '✨' : `(${6 - pairingCode.length} chars needed)`}`
            )}
          </button>

          {/* Helper Text */}
          <div className="text-center">
            <p className="text-xs text-gray-400">
              Enter your partner's 6-character code to link your accounts and start sharing intimate moments together.
            </p>
          </div>
        </form>

        {/* Enhanced Logout Button */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <button
            onClick={() => {
              // Clear token and reload to go back to login
              localStorage.removeItem('token');
              window.location.reload();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 text-gray-400 hover:text-white transition-colors"
          >
            <span>🚪</span>
            <span className="text-sm">Switch Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const MoodSelector = ({ onMoodSelect }) => {
  const [selectedMood, setSelectedMood] = useState(null);
  const [intensity, setIntensity] = useState(3);
  const [extremeMode, setExtremeMode] = useState(false);
  const [showTooltip, setShowTooltip] = useState(null);

  // Regular moods - always visible
  const regularMoods = [
    { 
      id: 'feeling_spicy', 
      name: 'Feeling Spicy', 
      emoji: '🌶️', 
      color: 'from-red-500 to-orange-500',
      description: 'Ready to add some heat and adventure to your connection'
    },
    { 
      id: 'horny', 
      name: 'Horny', 
      emoji: '🔥', 
      color: 'from-orange-500 to-red-500',
      description: 'Sexually aroused and craving intimate physical connection'
    },
    { 
      id: 'teasing', 
      name: 'Teasing', 
      emoji: '😈', 
      color: 'from-purple-500 to-pink-500',
      description: 'Playful and flirtatious, enjoying building anticipation'
    },
    { 
      id: 'romantic', 
      name: 'Romantic', 
      emoji: '💕', 
      color: 'from-pink-500 to-purple-500',
      description: 'Seeking emotional intimacy and romantic connection'
    },
    { 
      id: 'playful', 
      name: 'Playful', 
      emoji: '😏', 
      color: 'from-blue-500 to-purple-500',
      description: 'Fun and lighthearted, wanting joy and laughter'
    },
    { 
      id: 'unavailable', 
      name: 'Unavailable', 
      emoji: '🚫', 
      color: 'from-gray-500 to-gray-600',
      description: 'Not in the mood for intimate activities right now'
    },
  ];

  // Spicy moods - always visible but marked as spicy
  const spicyMoods = [
    { 
      id: 'feeling_dominant', 
      name: 'Feeling Dominant', 
      emoji: '👑', 
      color: 'from-purple-600 to-indigo-600',
      description: 'Want to take charge and lead the intimate experience'
    },
    { 
      id: 'need_attention', 
      name: 'Need Attention', 
      emoji: '🥺', 
      color: 'from-pink-600 to-red-500',
      description: 'Craving focused attention and adoration from your lover'
    },
  ];

  // Extreme moods - only visible when extreme mode is enabled
  const extremeMoods = [
    { 
      id: 'available_for_use', 
      name: 'Available for Use', 
      emoji: '🎯', 
      color: 'from-red-600 to-pink-600',
      description: 'Offering yourself for your partner\'s pleasure and desires'
    },
    { 
      id: 'feeling_submissive', 
      name: 'Feeling Submissive', 
      emoji: '🙇', 
      color: 'from-purple-600 to-pink-600',
      description: 'In a submissive headspace, wanting to please your dominant'
    },
    { 
      id: 'wanna_edge', 
      name: 'Wanna Edge', 
      emoji: '⏳', 
      color: 'from-blue-600 to-purple-600',
      description: 'Want to experience prolonged arousal and delayed gratification'
    },
    { 
      id: 'use_me_how_you_want', 
      name: 'Use Me How You Want', 
      emoji: '🎪', 
      color: 'from-red-600 to-orange-600',
      description: 'Giving full consent for your partner to take complete control'
    },
    { 
      id: 'bratty_mood', 
      name: 'Bratty Mood', 
      emoji: '😤', 
      color: 'from-pink-600 to-purple-600',
      description: 'Feeling mischievous and wanting to playfully challenge your partner'
    },
    { 
      id: 'worship_me', 
      name: 'Worship Me', 
      emoji: '👸', 
      color: 'from-yellow-500 to-red-500',
      description: 'Want to be adored, praised, and treated like royalty'
    },
  ];

  const handleMoodSelect = (mood) => {
    setSelectedMood(mood);
    onMoodSelect(mood, intensity, extremeMode);
  };

  const allMoods = [...regularMoods, ...spicyMoods, ...(extremeMode ? extremeMoods : [])];

  return (
    <div className="space-y-4">
      {/* Extreme Mode Toggle */}
      <div className="flex items-center justify-between bg-black/30 rounded-xl p-3">
        <div>
          <span className="text-white font-semibold">Extreme Mode</span>
          <p className="text-gray-400 text-xs">Unlock more explicit mood options</p>
        </div>
        <button
          onClick={() => setExtremeMode(!extremeMode)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
            extremeMode ? 'bg-red-500' : 'bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
              extremeMode ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Intensity Slider */}
      <div className="bg-black/20 rounded-xl p-4">
        <label className="block text-gray-300 mb-2 font-semibold">
          Intensity: {intensity}/5 🔥
        </label>
        <input
          type="range"
          min="1"
          max="5"
          value={intensity}
          onChange={(e) => setIntensity(e.target.value)}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>

      {/* Regular Moods */}
      <div>
        <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
          💭 How are you feeling?
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {regularMoods.map((mood) => (
            <div
              key={mood.id}
              className="relative"
              onMouseEnter={() => setShowTooltip(mood.id)}
              onMouseLeave={() => setShowTooltip(null)}
            >
              <button
                onClick={() => handleMoodSelect(mood)}
                className={`w-full p-4 rounded-2xl bg-gradient-to-br ${mood.color} text-white hover:scale-105 transition-all duration-200 shadow-lg relative`}
              >
                <div className="text-2xl mb-2">{mood.emoji}</div>
                <div className="font-semibold text-sm">{mood.name}</div>
              </button>
              
              {/* Tooltip */}
              {showTooltip === mood.id && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black/90 text-white text-xs rounded-lg p-2 max-w-48 z-10">
                  {mood.description}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Spicy Moods */}
      <div>
        <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
          🌶️ Spicy Vibes
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {spicyMoods.map((mood) => (
            <div
              key={mood.id}
              className="relative"
              onMouseEnter={() => setShowTooltip(mood.id)}
              onMouseLeave={() => setShowTooltip(null)}
            >
              <button
                onClick={() => handleMoodSelect(mood)}
                className={`w-full p-4 rounded-2xl bg-gradient-to-br ${mood.color} text-white hover:scale-105 transition-all duration-200 shadow-lg relative`}
              >
                <div className="text-2xl mb-2">{mood.emoji}</div>
                <div className="font-semibold text-sm">{mood.name}</div>
              </button>
              
              {/* Tooltip */}
              {showTooltip === mood.id && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black/90 text-white text-xs rounded-lg p-2 max-w-48 z-10">
                  {mood.description}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Extreme Moods - Only visible when extreme mode is enabled */}
      {extremeMode && (
        <div>
          <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
            🔥 Extreme Mode
            <span className="text-xs bg-red-500/20 px-2 py-1 rounded">18+</span>
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {extremeMoods.map((mood) => (
              <div
                key={mood.id}
                className="relative"
                onMouseEnter={() => setShowTooltip(mood.id)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <button
                  onClick={() => handleMoodSelect(mood)}
                  className={`w-full p-4 rounded-2xl bg-gradient-to-br ${mood.color} text-white hover:scale-105 transition-all duration-200 shadow-lg relative border-2 border-red-400/30`}
                >
                  <div className="text-2xl mb-2">{mood.emoji}</div>
                  <div className="font-semibold text-sm">{mood.name}</div>
                </button>
                
                {/* Tooltip */}
                {showTooltip === mood.id && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-black/90 text-white text-xs rounded-lg p-2 max-w-48 z-10">
                    {mood.description}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            🔒 Extreme mode content is for consenting adults (18+) only
          </p>
        </div>
      )}
    </div>
  );
};

// Enhanced Task Card Component
const TaskCard = ({ task, currentUser, onProofSubmit, onTaskApprove, onRefresh }) => {
  const [showProofModal, setShowProofModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [proofText, setProofText] = useState('');
  const [proofPhoto, setProofPhoto] = useState(null);
  const [approvalMessage, setApprovalMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCreator = task.creator_id === currentUser.id;
  const isReceiver = task.receiver_id === currentUser.id;
  const canSubmitProof = isReceiver && task.status === 'pending';
  const canApprove = isCreator && task.status === 'completed';

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'completed': return 'bg-blue-500/20 text-blue-400';
      case 'approved': return 'bg-green-500/20 text-green-400';
      case 'rejected': return 'bg-red-500/20 text-red-400';
      case 'expired': return 'bg-gray-500/20 text-gray-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'completed': return 'Awaiting Approval';
      case 'approved': return 'Approved ✅';
      case 'rejected': return 'Rejected ❌';
      case 'expired': return 'Expired ⏰';
      default: return status;
    }
  };

  const handleProofSubmit = async () => {
    if (!proofText && !proofPhoto) {
      alert('Please provide either text or photo proof');
      return;
    }

    setSubmitting(true);
    try {
      await onProofSubmit(task.id, {
        proof_text: proofText,
        proof_photo_base64: proofPhoto
      });
      setShowProofModal(false);
      setProofText('');
      setProofPhoto(null);
      onRefresh();
    } catch (error) {
      console.error('Error submitting proof:', error);
      alert('Failed to submit proof');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproval = async (approved) => {
    setSubmitting(true);
    try {
      await onTaskApprove(task.id, {
        approved,
        message: approvalMessage
      });
      setShowApprovalModal(false);
      setApprovalMessage('');
      onRefresh();
    } catch (error) {
      console.error('Error approving task:', error);
      alert('Failed to update task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-lg font-semibold text-white pr-2">{task.title}</h4>
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(task.status)}`}>
            {getStatusText(task.status)}
          </span>
        </div>
        
        <p className="text-gray-300 mb-3">{task.description}</p>
        
        {task.reward && (
          <p className="text-pink-400 mb-3">🎁 Reward: {task.reward}</p>
        )}

        <div className="flex items-center justify-between mb-4">
          <TokenDisplay tokens={task.tokens_earned} size="small" />
          <CountdownTimer 
            expiresAt={task.expires_at} 
            onExpired={() => onRefresh()}
          />
        </div>
        
        <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
          <span>{isCreator ? 'Created by you' : 'From your partner'}</span>
          <span>{isReceiver ? 'Assigned to you' : 'Assigned to partner'}</span>
        </div>

        {/* Proof Display */}
        {task.proof_text && (
          <div className="mb-4 p-3 bg-white/10 rounded-xl">
            <p className="text-gray-300 text-sm mb-2">📝 Proof:</p>
            <p className="text-white">{task.proof_text}</p>
          </div>
        )}

        {task.proof_photo_base64 && (
          <div className="mb-4">
            <p className="text-gray-300 text-sm mb-2">📸 Photo Proof:</p>
            <img 
              src={task.proof_photo_base64} 
              alt="Task proof" 
              className="w-full h-32 object-cover rounded-xl"
            />
          </div>
        )}

        {/* Approval Message */}
        {task.approval_message && (
          <div className="mb-4 p-3 bg-white/10 rounded-xl">
            <p className="text-gray-300 text-sm mb-2">
              {task.status === 'approved' ? '✅ Approval Message:' : '❌ Rejection Message:'}
            </p>
            <p className="text-white">{task.approval_message}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {canSubmitProof && (
            <button
              onClick={() => setShowProofModal(true)}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-500 text-white py-2 px-4 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Submit Proof
            </button>
          )}

          {canApprove && (
            <button
              onClick={() => setShowApprovalModal(true)}
              className="flex-1 bg-gradient-to-r from-green-500 to-blue-500 text-white py-2 px-4 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Review Proof
            </button>
          )}
        </div>
      </div>

      {/* Proof Submission Modal */}
      {showProofModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-black/90 backdrop-blur-lg rounded-2xl p-6 border border-white/10 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4">Submit Proof</h3>
            <div className="space-y-4">
              <textarea
                placeholder="Describe what you did..."
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 h-24 resize-none"
              />
              
              <PhotoUpload 
                onPhotoSelected={setProofPhoto}
                existingPhoto={proofPhoto}
              />
              
              <div className="flex gap-3">
                <button
                  onClick={handleProofSubmit}
                  disabled={submitting || (!proofText && !proofPhoto)}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Proof'}
                </button>
                <button
                  onClick={() => setShowProofModal(false)}
                  disabled={submitting}
                  className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-gray-300 hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-black/90 backdrop-blur-lg rounded-2xl p-6 border border-white/10 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Review Task Proof</h3>
            
            {task.proof_text && (
              <div className="mb-4 p-3 bg-white/10 rounded-xl">
                <p className="text-gray-300 text-sm mb-2">📝 Their proof:</p>
                <p className="text-white">{task.proof_text}</p>
              </div>
            )}

            {task.proof_photo_base64 && (
              <div className="mb-4">
                <p className="text-gray-300 text-sm mb-2">📸 Photo proof:</p>
                <img 
                  src={task.proof_photo_base64} 
                  alt="Task proof" 
                  className="w-full h-40 object-cover rounded-xl"
                />
              </div>
            )}

            <textarea
              placeholder="Add a message (optional)..."
              value={approvalMessage}
              onChange={(e) => setApprovalMessage(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 h-20 resize-none mb-4"
            />
            
            <div className="flex gap-3">
              <button
                onClick={() => handleApproval(true)}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-green-500 to-blue-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? 'Processing...' : '✅ Approve'}
              </button>
              <button
                onClick={() => handleApproval(false)}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-red-500 to-orange-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? 'Processing...' : '❌ Reject'}
              </button>
              <button
                onClick={() => setShowApprovalModal(false)}
                disabled={submitting}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-gray-300 hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Enhanced TaskCreator Component with Integrated Reward System
const TaskCreator = ({ onTaskCreate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [duration, setDuration] = useState(60);
  const [tokensEarned, setTokensEarned] = useState(5);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onTaskCreate({
      title,
      description,
      reward,
      duration_minutes: duration,
      tokens_earned: tokensEarned
    });
    setTitle('');
    setDescription('');
    setReward('');
    setDuration(60);
    setTokensEarned(5);
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
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        🎯 Create Heat Task
        <span className="text-sm bg-pink-500/20 px-2 py-1 rounded text-pink-400">All-in-One</span>
      </h3>
      
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
        
        <div>
          <label className="block text-gray-300 mb-2 font-semibold">
            🎁 What will your partner get if they complete this?
          </label>
          <input
            type="text"
            placeholder="e.g., A sensual massage, your favorite meal, a special surprise..."
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          <p className="text-xs text-gray-400 mt-1">Optional: Describe the real-world reward they'll get</p>
        </div>
        
        <div>
          <label className="block text-gray-300 mb-2">Duration: {duration} minutes ⏰</label>
          <input
            type="range"
            min="15"
            max="240"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>15 min</span>
            <span>4 hours</span>
          </div>
        </div>

        <div>
          <label className="block text-gray-300 mb-2">Token Reward: {tokensEarned} 🪙</label>
          <input
            type="range"
            min="1"
            max="20"
            value={tokensEarned}
            onChange={(e) => setTokensEarned(e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1 token</span>
            <span>20 tokens</span>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Create Task & Reward
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
  const [rewards, setRewards] = useState([]);
  const [tokens, setTokens] = useState({ tokens: 0, lifetime_tokens: 0 });
  const [activeTab, setActiveTab] = useState('moods');
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const { logout } = useAuth();
  const { messages, notifications, dismissNotification } = useWebSocket(user.id);

  useEffect(() => {
    fetchMoods();
    fetchTasks();
    fetchRewards();
    fetchTokens();
  }, []);

  useEffect(() => {
    // Handle WebSocket messages with enhanced notifications
    messages.forEach(message => {
      if (message.type === 'mood_update') {
        fetchMoods();
      } else if (message.type === 'new_task') {
        fetchTasks();
      } else if (message.type === 'task_completed') {
        fetchTasks();
      } else if (message.type === 'task_approved' || message.type === 'task_rejected') {
        fetchTasks();
        fetchTokens(); // Refresh tokens on approval
      } else if (message.type === 'new_reward') {
        fetchRewards();
      } else if (message.type === 'reward_redeemed') {
        fetchRewards();
        fetchTokens(); // Refresh tokens on redemption
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
      const response = await axios.get(`${API}/tasks/active`);
      setTasks(response.data);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchRewards = async () => {
    try {
      const response = await axios.get(`${API}/rewards`);
      setRewards(response.data);
    } catch (error) {
      console.error('Error fetching rewards:', error);
    }
  };

  const fetchTokens = async () => {
    try {
      const response = await axios.get(`${API}/tokens`);
      setTokens(response.data);
    } catch (error) {
      console.error('Error fetching tokens:', error);
    }
  };

  const handleMoodSelect = async (mood, intensity, extremeMode) => {
    try {
      const response = await axios.post(`${API}/moods`, {
        mood_type: mood.id,
        intensity: intensity,
        duration_minutes: 60,
        is_extreme_mode: extremeMode
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

  const handleProofSubmit = async (taskId, proofData) => {
    try {
      await axios.patch(`${API}/tasks/${taskId}/proof`, proofData);
      fetchTasks();
    } catch (error) {
      console.error('Error submitting proof:', error);
      throw error;
    }
  };

  const handleTaskApprove = async (taskId, approvalData) => {
    try {
      await axios.patch(`${API}/tasks/${taskId}/approve`, approvalData);
      fetchTasks();
      fetchTokens();
    } catch (error) {
      console.error('Error approving task:', error);
      throw error;
    }
  };

  const handleRewardCreate = async (rewardData) => {
    try {
      await axios.post(`${API}/rewards`, rewardData);
      fetchRewards();
    } catch (error) {
      console.error('Error creating reward:', error);
    }
  };

  const handleRewardRedeem = async (rewardId) => {
    try {
      await axios.post(`${API}/rewards/redeem`, { reward_id: rewardId });
      fetchRewards();
      fetchTokens();
    } catch (error) {
      console.error('Error redeeming reward:', error);
      throw error;
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

  const availableRewards = rewards.filter(r => !r.is_redeemed);
  const redeemedRewards = rewards.filter(r => r.is_redeemed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-red-900 p-4">
      <div className="max-w-md mx-auto">
        {/* Notification Toasts */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <NotificationToast
              key={notification.id}
              notification={notification}
              onDismiss={dismissNotification}
            />
          ))}
        </div>

        {/* Header with Token Display */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">💓 Pulse</h1>
            <p className="text-gray-300">Hey {user.name}!</p>
          </div>
          <div className="flex items-center gap-4">
            <TokenDisplay tokens={tokens.tokens} lifetimeTokens={tokens.lifetime_tokens} size="normal" />
            {/* Enhanced Logout Button */}
            <div className="relative group">
              <button
                onClick={logout}
                className="flex items-center gap-2 p-2 bg-white/10 rounded-xl text-gray-300 hover:bg-white/20 transition-colors border border-white/10"
              >
                <span className="text-lg">🚪</span>
                <span className="text-sm font-medium">Logout</span>
              </button>
              <div className="absolute -bottom-8 right-0 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Switch accounts
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced AI Suggestion Modal */}
        {aiSuggestion && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-black/90 backdrop-blur-lg rounded-2xl p-6 border border-white/10 max-w-sm w-full">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                  ✨ AI Mood Suggestion
                </h3>
                <p className="text-xs text-gray-400">Based on your current mood and intensity</p>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-lg text-pink-400 font-semibold">{aiSuggestion.title}</h4>
                <p className="text-gray-300 text-sm leading-relaxed">{aiSuggestion.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-400 bg-white/10 rounded-lg p-2">
                  <span>⏰ Duration: {aiSuggestion.default_duration_minutes} min</span>
                  <span>🪙 Reward: 7 tokens</span>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    handleTaskCreate({
                      title: aiSuggestion.title,
                      description: aiSuggestion.description,
                      reward: "AI-suggested reward based on your mood",
                      duration_minutes: aiSuggestion.default_duration_minutes,
                      tokens_earned: 7
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
              
              <p className="text-xs text-center text-gray-500 mt-3">
                💡 AI suggestions are tailored to your mood and intensity
              </p>
            </div>
          </div>
        )}

        {/* Enhanced Tab Navigation */}
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
          <button
            onClick={() => setActiveTab('rewards')}
            className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-colors ${
              activeTab === 'rewards'
                ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Rewards
          </button>
        </div>

        {/* Content Sections */}
        <div className="space-y-6">
          {activeTab === 'moods' && (
            <div className="space-y-6">
              <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                <h3 className="text-xl font-bold text-white mb-4">How are you feeling?</h3>
                <MoodSelector onMoodSelect={handleMoodSelect} />
              </div>
              
              {moods.length > 0 && (
                <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    💭 Recent Moods
                    <span className="text-xs bg-pink-500/20 px-2 py-1 rounded text-pink-400">Live</span>
                  </h3>
                  <div className="space-y-3">
                    {moods.map((mood) => {
                      const moodName = mood.mood_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                      const isExplicit = ['Available For Use', 'Feeling Submissive', 'Wanna Edge', 'Use Me How You Want', 'Bratty Mood', 'Worship Me'].includes(moodName);
                      
                      return (
                        <div key={mood.id} className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-semibold">{moodName}</span>
                                {isExplicit && (
                                  <span className="text-xs bg-red-500/20 px-1.5 py-0.5 rounded text-red-400">
                                    Spicy
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <span>🔥 Intensity: {mood.intensity}/5</span>
                              </div>
                            </div>
                          </div>
                          <span className="text-gray-400 text-sm">{formatTimeRemaining(mood.expires_at)}</span>
                        </div>
                      );
                    })}
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
                  <h3 className="text-lg font-bold text-white">Active Tasks</h3>
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUser={user}
                      onProofSubmit={handleProofSubmit}
                      onTaskApprove={handleTaskApprove}
                      onRefresh={fetchTasks}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'rewards' && (
            <div className="space-y-6">
              {/* Info about integrated rewards */}
              <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-6 border border-white/10 border-dashed">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-center gap-2">
                    🎁 Rewards are now part of Heat Tasks!
                  </h3>
                  <p className="text-gray-300 text-sm mb-3">
                    Create rewards directly when making Heat Tasks for a seamless experience.
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-pink-400">
                    <span>💡</span>
                    <span>Go to the Tasks tab to create task + reward combos</span>
                  </div>
                </div>
              </div>
              
              {availableRewards.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white">Available Rewards</h3>
                  {availableRewards.map((reward) => (
                    <RewardCard
                      key={reward.id}
                      reward={reward}
                      onRedeem={handleRewardRedeem}
                      userTokens={tokens.tokens}
                      isRedeemable={true}
                    />
                  ))}
                </div>
              )}

              {redeemedRewards.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white">Redeemed Rewards</h3>
                  {redeemedRewards.map((reward) => (
                    <RewardCard
                      key={reward.id}
                      reward={reward}
                      onRedeem={handleRewardRedeem}
                      userTokens={tokens.tokens}
                      isRedeemable={false}
                    />
                  ))}
                </div>
              )}

              {availableRewards.length === 0 && redeemedRewards.length === 0 && (
                <div className="bg-black/20 backdrop-blur-lg rounded-2xl p-8 border border-white/10 text-center">
                  <div className="text-4xl mb-3">🎯</div>
                  <h3 className="text-lg font-bold text-white mb-2">No rewards yet!</h3>
                  <p className="text-gray-300 text-sm mb-4">
                    Create Heat Tasks with rewards attached to start earning and redeeming.
                  </p>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className="bg-gradient-to-r from-pink-500 to-purple-500 text-white py-2 px-4 rounded-xl font-semibold hover:opacity-90 transition-opacity"
                  >
                    Create First Task
                  </button>
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