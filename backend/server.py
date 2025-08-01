from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
import random
import string
import asyncio
from collections import defaultdict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = "your-secret-key-here"  # In production, use env variable
ALGORITHM = "HS256"

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.couple_connections: Dict[str, List[str]] = defaultdict(list)
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        
        # Find couple and add to couple connections
        user = await db.users.find_one({"id": user_id})
        if user and user.get("couple_id"):
            couple_id = user["couple_id"]
            if user_id not in self.couple_connections[couple_id]:
                self.couple_connections[couple_id].append(user_id)
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        
        # Remove from couple connections
        for couple_id, user_ids in self.couple_connections.items():
            if user_id in user_ids:
                user_ids.remove(user_id)
                break
    
    async def send_to_partner(self, user_id: str, message: dict):
        user = await db.users.find_one({"id": user_id})
        if user and user.get("couple_id"):
            couple_id = user["couple_id"]
            partner_ids = [uid for uid in self.couple_connections[couple_id] if uid != user_id]
            
            for partner_id in partner_ids:
                if partner_id in self.active_connections:
                    try:
                        await self.active_connections[partner_id].send_json(message)
                    except:
                        self.disconnect(partner_id)

manager = ConnectionManager()

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    password_hash: str
    couple_id: Optional[str] = None
    boundaries: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: str
    name: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Couple(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user1_id: str
    user2_id: str
    pairing_code: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PairingRequest(BaseModel):
    pairing_code: str

class Mood(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    couple_id: str
    user_id: str
    mood_type: str  # "feeling_spicy", "horny", "teasing", "unavailable", etc.
    intensity: int  # 1-5
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MoodCreate(BaseModel):
    mood_type: str
    intensity: int
    duration_minutes: int = 60
    is_extreme_mode: bool = False

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    couple_id: str
    creator_id: str
    receiver_id: str
    title: str
    description: str
    reward: Optional[str] = None
    duration_minutes: int
    status: str = "pending"  # pending, completed, approved, rejected, expired
    proof_text: Optional[str] = None
    proof_photo_base64: Optional[str] = None  # Base64 encoded photo proof
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    completed_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    tokens_earned: int = 5  # Default token reward per task
    approval_message: Optional[str] = None  # Message from approver

class TaskCreate(BaseModel):
    title: str
    description: str
    reward: Optional[str] = None
    duration_minutes: int = 60
    tokens_earned: int = 5

class TaskProof(BaseModel):
    proof_text: Optional[str] = None
    proof_photo_base64: Optional[str] = None  # Base64 encoded photo

class TaskApproval(BaseModel):
    approved: bool
    message: Optional[str] = None

class UserTokens(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    couple_id: str
    user_id: str
    tokens: int = 0  # Current token balance
    lifetime_tokens: int = 0  # Total tokens ever earned
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Reward(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    couple_id: str
    creator_id: str  # Who created this reward
    title: str
    description: str
    tokens_cost: int
    is_redeemed: bool = False
    redeemed_by: Optional[str] = None  # User ID who redeemed
    redeemed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RewardCreate(BaseModel):
    title: str
    description: str
    tokens_cost: int

class RewardRedeem(BaseModel):
    reward_id: str

# Helper functions
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def generate_pairing_code():
    return ''.join(random.choices(string.digits, k=6))

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# Token management helper functions
async def get_user_tokens(user_id: str, couple_id: str) -> int:
    """Get current token balance for a user"""
    user_tokens = await db.user_tokens.find_one({"user_id": user_id, "couple_id": couple_id}, {"_id": 0})
    return user_tokens["tokens"] if user_tokens else 0

async def add_tokens(user_id: str, couple_id: str, tokens: int) -> int:
    """Add tokens to user's balance and return new balance"""
    # Update or create user tokens document
    result = await db.user_tokens.update_one(
        {"user_id": user_id, "couple_id": couple_id},
        {
            "$inc": {"tokens": tokens, "lifetime_tokens": tokens},
            "$set": {"updated_at": datetime.utcnow()}
        },
        upsert=True
    )
    
    # Get updated balance
    user_tokens = await db.user_tokens.find_one({"user_id": user_id, "couple_id": couple_id}, {"_id": 0})
    return user_tokens["tokens"]

async def spend_tokens(user_id: str, couple_id: str, tokens: int) -> bool:
    """Spend tokens if user has enough balance. Returns True if successful"""
    current_balance = await get_user_tokens(user_id, couple_id)
    
    if current_balance < tokens:
        return False
    
    await db.user_tokens.update_one(
        {"user_id": user_id, "couple_id": couple_id},
        {
            "$inc": {"tokens": -tokens},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    return True

async def get_couple_tokens(couple_id: str) -> Dict[str, int]:
    """Get token balances for both users in a couple"""
    tokens_data = await db.user_tokens.find({"couple_id": couple_id}, {"_id": 0}).to_list(2)
    
    result = {}
    for token_doc in tokens_data:
        result[token_doc["user_id"]] = token_doc["tokens"]
    
    return result

# OpenAI integration for AI suggestions
from emergentintegrations.llm.chat import LlmChat, UserMessage

# Enhanced AI suggestion function with mood-based context
async def get_ai_suggestion(mood_type: str, intensity: int, boundaries: List[str], is_extreme_mode: bool = False) -> dict:
    """
    Generate AI-powered HeatTask suggestions using OpenAI GPT-4o
    Enhanced with mood-based context and extreme mode support
    """
    try:
        # Get OpenAI API key from environment
        openai_api_key = os.environ.get('OPENAI_API_KEY')
        if not openai_api_key:
            logger.warning("OpenAI API key not found, falling back to mock suggestions")
            return get_mock_ai_suggestion(mood_type, intensity, boundaries, is_extreme_mode)
        
        # Create LLM chat instance with enhanced system message
        mood_context = get_mood_context(mood_type, is_extreme_mode)
        mood_prompt_intent = get_mood_prompt_intent(mood_type, is_extreme_mode)
        
        chat = LlmChat(
            api_key=openai_api_key,
            session_id=f"heat_task_{datetime.utcnow().isoformat()}",
            system_message=f"""You are an AI intimacy coach for the Pulse app, helping couples create playful and intimate connection through personalized HeatTasks. 

Current mood context: {mood_context}
Task creation intent: {mood_prompt_intent}

Guidelines:
- Generate creative, age-appropriate intimate tasks for adult couples (18+)
- Tasks should build emotional and physical intimacy based on the current mood
- Respect user boundaries and comfort levels strictly
- Tasks can range from playful to sensual based on mood intensity and extreme mode setting
- Include clear, actionable instructions that match the mood intent exactly
- Suggest realistic timeframes (15-90 minutes)
- Focus on connection, communication, and fun
- Keep content tasteful yet expressive for the mood context
- For kink/BDSM moods, emphasize safety, consent, and communication
- Adjust explicitness based on extreme mode setting
- Make sure the task directly relates to and fulfills the specific mood intent

Response format should be valid JSON with: title, description, default_duration_minutes"""
        ).with_model("openai", "gpt-4o").with_max_tokens(500)
        
        # Prepare enhanced user message with mood context
        boundaries_text = ", ".join(boundaries) if boundaries else "No specific boundaries set"
        extreme_context = " (Extreme mode enabled - more explicit content allowed)" if is_extreme_mode else " (Standard mode - keep content tasteful)"
        
        user_prompt = f"""Generate a personalized HeatTask for a couple with these details:
- Current mood: {mood_type}
- Mood context: {mood_context}
- Task intent: {mood_prompt_intent}
- Intensity level: {intensity}/5
- Boundaries to respect: {boundaries_text}
- Content level: {extreme_context}

IMPORTANT: The task must directly fulfill the mood intent. For example:
- If mood is "wanna_edge", create an edging/teasing task with delayed gratification
- If mood is "feeling_submissive", create a task where they serve or please their partner
- If mood is "use_me_how_you_want", create a dominant/submissive power exchange task
- If mood is "worship_me", create a task where they are adored and treated special

Please suggest an intimate task that matches their current mood intent exactly. The task should be engaging, fun, and appropriate for their boundaries and selected content level."""
        
        user_message = UserMessage(text=user_prompt)
        
        # Get AI response
        response = await chat.send_message(user_message)
        
        # Try to parse as JSON, fallback to mock if parsing fails
        try:
            import json
            ai_suggestion = json.loads(response)
            
            # Validate required fields
            if all(key in ai_suggestion for key in ['title', 'description', 'default_duration_minutes']):
                logger.info(f"AI suggestion generated successfully for mood: {mood_type}")
                return ai_suggestion
            else:
                logger.warning("AI response missing required fields, using mock suggestion")
                return get_mock_ai_suggestion(mood_type, intensity, boundaries, is_extreme_mode)
                
        except json.JSONDecodeError:
            logger.warning("Could not parse AI response as JSON, using mock suggestion")
            return get_mock_ai_suggestion(mood_type, intensity, boundaries, is_extreme_mode)
            
    except Exception as e:
        logger.error(f"Error getting AI suggestion: {str(e)}")
        return get_mock_ai_suggestion(mood_type, intensity, boundaries, is_extreme_mode)

def get_mood_context(mood_type: str, is_extreme_mode: bool = False) -> str:
    """Get descriptive context for each mood type with enhanced AI prompting"""
    mood_contexts = {
        # Regular moods
        'feeling_spicy': 'Partner is feeling adventurous and wants to add some heat to their connection',
        'horny': 'Partner is sexually aroused and looking for intimate physical connection',
        'teasing': 'Partner is in a playful, flirtatious mood and enjoys building anticipation',
        'romantic': 'Partner is seeking emotional intimacy and romantic connection',
        'playful': 'Partner wants fun, lighthearted activities that bring joy and laughter',
        'unavailable': 'Partner is busy or not in the mood for intimate activities',
        
        # Expanded spicy moods with specific AI prompting intent
        'available_for_use': 'Partner is offering themselves for free-use and wants to be used for their lover\'s pleasure',
        'feeling_submissive': 'Partner is in a submissive headspace and wants to serve, please, and obey their dominant',
        'wanna_edge': 'Partner wants to experience prolonged arousal, teasing, and delayed gratification without release',
        'use_me_how_you_want': 'Partner is giving complete control and consent for their partner to dominate and use them',
        'feeling_dominant': 'Partner wants to take complete charge, control, and command the intimate experience',
        'need_attention': 'Partner craves focused attention, worship, and adoration from their lover',
        'bratty_mood': 'Partner is feeling mischievous, defiant, and wants to playfully challenge their partner',
        'worship_me': 'Partner wants to be adored, praised, served, and treated like royalty or a deity'
    }
    
    base_context = mood_contexts.get(mood_type, 'Partner has selected a custom mood')
    
    if is_extreme_mode and mood_type in ['available_for_use', 'feeling_submissive', 'wanna_edge', 'use_me_how_you_want', 'feeling_dominant', 'bratty_mood']:
        base_context += " (Extreme mode: More explicit, kinky, and intense content is welcomed)"
    
    return base_context

def get_mood_prompt_intent(mood_type: str, is_extreme_mode: bool = False) -> str:
    """Get specific AI prompting intent for each mood type"""
    mood_prompts = {
        # Regular moods
        'feeling_spicy': 'Create a sensual, exciting task that builds sexual tension and intimacy',
        'horny': 'Create an arousing, sexually charged task focused on physical pleasure',
        'teasing': 'Create a playful, flirtatious task that builds anticipation and sexual tension',
        'romantic': 'Create an emotionally intimate, loving task that strengthens romantic connection',
        'playful': 'Create a fun, lighthearted task that brings joy and playful intimacy',
        'unavailable': 'Create a simple, low-pressure task for later when they\'re available',
        
        # Enhanced spicy moods with specific prompting
        'available_for_use': 'Create a free-use, consensual task where the submissive partner is used for pleasure',
        'feeling_submissive': 'Create a submission-focused task involving serving, pleasing, or obeying their dominant',
        'wanna_edge': 'Create an edging/teasing task involving prolonged arousal without climax or release',
        'use_me_how_you_want': 'Create a dominant/submissive power exchange task with complete control dynamics',
        'feeling_dominant': 'Create a dominant, controlling task where the partner takes complete charge',
        'need_attention': 'Create a worship, attention-focused task where the partner is adored and served',
        'bratty_mood': 'Create a playful punishment or taming task to handle bratty, defiant behavior',
        'worship_me': 'Create a worship, reverence task where the partner is treated like royalty'
    }
    
    base_prompt = mood_prompts.get(mood_type, 'Create an intimate task appropriate for the mood')
    
    if is_extreme_mode and mood_type in ['available_for_use', 'feeling_submissive', 'wanna_edge', 'use_me_how_you_want', 'feeling_dominant', 'bratty_mood']:
        base_prompt += ". Make it more explicit, intense, and kinky since extreme mode is enabled"
    
    return base_prompt

def get_mock_ai_suggestion(mood_type: str, intensity: int, boundaries: List[str], is_extreme_mode: bool = False) -> dict:
    """
    Enhanced fallback mock suggestions with mood-specific content
    """
    # Mood-specific suggestion mapping
    mood_specific_suggestions = {
        'available_for_use': [
            {
                "title": "Free Use Morning",
                "description": "For the next hour, you're available for your partner's pleasure whenever they want. Stay accessible and ready.",
                "default_duration_minutes": 60
            },
            {
                "title": "Use Me as You Please",
                "description": "Tell your partner they can use you however they want for the next 30 minutes. Submit to their desires.",
                "default_duration_minutes": 30
            }
        ],
        'feeling_submissive': [
            {
                "title": "Serve Your Dominant",
                "description": "Ask your partner what they need and fulfill their request immediately. Focus on pleasing them.",
                "default_duration_minutes": 45
            },
            {
                "title": "Submission Position",
                "description": "Get into a submissive position and wait for your partner's commands. Show your obedience.",
                "default_duration_minutes": 30
            }
        ],
        'wanna_edge': [
            {
                "title": "Edge Without Release",
                "description": "Bring yourself close to climax 3 times but don't finish. Send updates to your partner.",
                "default_duration_minutes": 45
            },
            {
                "title": "Teasing Touch",
                "description": "Touch yourself slowly and stop every time you get close. Build the tension for your partner.",
                "default_duration_minutes": 60
            }
        ],
        'use_me_how_you_want': [
            {
                "title": "Total Control Surrender",
                "description": "Text your partner that they have complete control over you for the next hour. Do whatever they say.",
                "default_duration_minutes": 60
            },
            {
                "title": "Your Pleasure Toy",
                "description": "Tell your partner you're their personal pleasure toy today. Let them decide how to use you.",
                "default_duration_minutes": 90
            }
        ],
        'feeling_dominant': [
            {
                "title": "Command Your Submissive",
                "description": "Give your partner 3 tasks to complete for your pleasure. Make them report back when done.",
                "default_duration_minutes": 60
            },
            {
                "title": "Take Complete Control",
                "description": "Direct your partner's every move for the next 30 minutes. Be commanding and assertive.",
                "default_duration_minutes": 30
            }
        ],
        'need_attention': [
            {
                "title": "Worship and Adore",
                "description": "Have your partner tell you 5 things they love about your body while touching you gently.",
                "default_duration_minutes": 30
            },
            {
                "title": "Focus All on You",
                "description": "Ask your partner to spend 20 minutes focusing entirely on your pleasure and desires.",
                "default_duration_minutes": 20
            }
        ],
        'bratty_mood': [
            {
                "title": "Tame the Brat",
                "description": "Be extra demanding and see how your partner handles your bratty attitude. Push their buttons playfully.",
                "default_duration_minutes": 45
            },
            {
                "title": "Playful Punishment",
                "description": "Act bratty until your partner gives you a playful punishment or puts you in your place.",
                "default_duration_minutes": 30
            }
        ],
        'worship_me': [
            {
                "title": "Royal Treatment",
                "description": "Have your partner treat you like royalty - massage, compliments, and total attention to your needs.",
                "default_duration_minutes": 60
            },
            {
                "title": "Goddess Worship",
                "description": "Make your partner worship your body with kisses and praise for 20 minutes straight.",
                "default_duration_minutes": 20
            }
        ]
    }
    
    # Regular mood suggestions
    regular_suggestions = {
        'feeling_spicy': [
            {
                "title": "Tease with a photo",
                "description": "Take a playful photo that shows just enough to make your partner excited.",
                "default_duration_minutes": 30
            }
        ],
        'horny': [
            {
                "title": "Pleasure yourself thinking of them",
                "description": "Focus entirely on your partner while pleasuring yourself and describe the experience.",
                "default_duration_minutes": 45
            }
        ],
        'teasing': [
            {
                "title": "Send anticipation messages",
                "description": "Send teasing messages throughout the day about what you want to do later.",
                "default_duration_minutes": 30
            }
        ]
    }
    
    # Choose suggestions based on mood type
    if mood_type in mood_specific_suggestions:
        suggestions = mood_specific_suggestions[mood_type]
    elif mood_type in regular_suggestions:
        suggestions = regular_suggestions[mood_type]
    elif mood_type in ['feeling_spicy', 'horny', 'teasing']:
        # Fallback spicy suggestions
        suggestions = [
            {
                "title": "Create anticipation",
                "description": "Send detailed messages about exactly what you want to do to your partner.",
                "default_duration_minutes": 60
            },
            {
                "title": "Tease with a photo",
                "description": "Take a playful photo that shows just enough to make your partner excited.",
                "default_duration_minutes": 30
            }
        ]
    else:
        # Default suggestions for other moods
        suggestions = [
            {
                "title": "Connect intimately",
                "description": "Spend quality time focusing on your connection and what makes you both happy.",
                "default_duration_minutes": 45
            },
            {
                "title": "Show your love",
                "description": "Do something thoughtful that shows your partner how much you care about them.",
                "default_duration_minutes": 30
            }
        ]
    
    return random.choice(suggestions)

# Authentication routes
@api_router.post("/auth/register")
async def register(user: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    password_hash = get_password_hash(user.password)
    user_obj = User(
        email=user.email,
        name=user.name,
        password_hash=password_hash
    )
    
    await db.users.insert_one(user_obj.dict())
    
    # Create token
    access_token = create_access_token(data={"sub": user_obj.id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_obj.id,
            "email": user_obj.email,
            "name": user_obj.name,
            "couple_id": user_obj.couple_id
        }
    }

@api_router.post("/auth/login")
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email}, {"_id": 0})
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": db_user["id"]})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": db_user["id"],
            "email": db_user["email"],
            "name": db_user["name"],
            "couple_id": db_user.get("couple_id")
        }
    }

@api_router.get("/pairing/code")
async def get_pairing_code(current_user: dict = Depends(get_current_user)):
    try:
        if current_user.get("couple_id"):
            raise HTTPException(status_code=400, detail="Already linked with a partner")
        
        # Generate a simple pairing code based on user ID
        pairing_code = current_user["id"][-6:].upper()  # Use last 6 characters of user ID
        
        return {"pairing_code": pairing_code}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pairing code: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while getting pairing code")

@api_router.post("/pairing/generate")
async def generate_pairing_code_endpoint(current_user: dict = Depends(get_current_user)):
    try:
        if current_user.get("couple_id"):
            raise HTTPException(status_code=400, detail="Already linked with a partner")
        
        # Generate a simple pairing code based on user ID
        pairing_code = current_user["id"][-6:].upper()  # Use last 6 characters of user ID
        
        return {"pairing_code": pairing_code, "message": "Pairing code generated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating pairing code: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while generating pairing code")

# Pairing routes
@api_router.post("/pairing/link")
async def link_with_partner(request: PairingRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Already linked with a partner")
    
    # Optimized: Use MongoDB regex query to find user with matching pairing code directly
    # This eliminates the need to fetch 1000+ users and do Python linear search
    try:
        partner = await db.users.find_one({
            "$and": [
                {"id": {"$regex": f".*{request.pairing_code.lower()}$", "$options": "i"}},
                {"id": {"$ne": current_user["id"]}},
                {"$or": [{"couple_id": {"$exists": False}}, {"couple_id": None}]}
            ]
        }, {"_id": 0})
        
        if not partner:
            raise HTTPException(status_code=404, detail="Partner not found with this code")
        
        # Double-check that the pairing code matches the last 6 characters
        if partner["id"][-6:].upper() != request.pairing_code.upper():
            raise HTTPException(status_code=404, detail="Partner not found with this code")
        
        # Create couple
        couple = Couple(
            user1_id=current_user["id"],
            user2_id=partner["id"],
            pairing_code=request.pairing_code.upper()
        )
        
        await db.couples.insert_one(couple.dict())
        
        # Update both users atomically
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"couple_id": couple.id}}
        )
        await db.users.update_one(
            {"id": partner["id"]},
            {"$set": {"couple_id": couple.id}}
        )
        
        return {"message": "Successfully linked with partner", "couple_id": couple.id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pairing link: {str(e)}")
        raise HTTPException(status_code=500, detail="An error occurred while linking with partner")

# Mood routes
@api_router.post("/moods")
async def create_mood(mood: MoodCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Must be linked with a partner to share moods")
    
    expires_at = datetime.utcnow() + timedelta(minutes=mood.duration_minutes)
    
    mood_obj = Mood(
        couple_id=current_user["couple_id"],
        user_id=current_user["id"],
        mood_type=mood.mood_type,
        intensity=mood.intensity,
        expires_at=expires_at
    )
    
    await db.moods.insert_one(mood_obj.dict())
    
    # Send real-time notification to partner
    await manager.send_to_partner(current_user["id"], {
        "type": "mood_update",
        "mood": mood_obj.dict()
    })
    
    # If spicy mood or explicit mood, suggest AI task
    suggestion = None
    spicy_moods = ["feeling_spicy", "horny", "teasing", "available_for_use", "feeling_submissive", "wanna_edge", "use_me_how_you_want", "feeling_dominant", "need_attention", "bratty_mood", "worship_me"]
    if mood.mood_type in spicy_moods:
        suggestion = await get_ai_suggestion(mood.mood_type, mood.intensity, current_user.get("boundaries", []), mood.is_extreme_mode)
    
    return {"mood": mood_obj.dict(), "ai_suggestion": suggestion}

@api_router.get("/moods")
async def get_moods(current_user: dict = Depends(get_current_user)):
    if not current_user.get("couple_id"):
        return []
    
    moods = await db.moods.find({
        "couple_id": current_user["couple_id"],
        "expires_at": {"$gt": datetime.utcnow()}
    }, {"_id": 0}).sort("created_at", -1).to_list(10)
    
    return moods

# Task routes
@api_router.post("/tasks")
async def create_task(task: TaskCreate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Must be linked with a partner to create tasks")
    
    # Find partner
    partner = await db.users.find_one({
        "couple_id": current_user["couple_id"],
        "id": {"$ne": current_user["id"]}
    }, {"_id": 0})
    
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    expires_at = datetime.utcnow() + timedelta(minutes=task.duration_minutes)
    
    task_obj = Task(
        couple_id=current_user["couple_id"],
        creator_id=current_user["id"],
        receiver_id=partner["id"],
        title=task.title,
        description=task.description,
        reward=task.reward,
        duration_minutes=task.duration_minutes,
        expires_at=expires_at,
        tokens_earned=task.tokens_earned
    )
    
    await db.tasks.insert_one(task_obj.dict())
    
    # Send real-time notification to partner
    await manager.send_to_partner(current_user["id"], {
        "type": "new_task",
        "task": task_obj.dict(),
        "message": f"New HeatTask assigned: {task.title}"
    })
    
    return task_obj.dict()

@api_router.get("/tasks")
async def get_tasks(current_user: dict = Depends(get_current_user)):
    if not current_user.get("couple_id"):
        return []
    
    tasks = await db.tasks.find({
        "couple_id": current_user["couple_id"]
    }, {"_id": 0}).sort("created_at", -1).to_list(20)
    
    return tasks

@api_router.patch("/tasks/{task_id}/proof")
async def submit_proof(task_id: str, proof: TaskProof, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["receiver_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to submit proof for this task")
    
    if task["status"] != "pending":
        raise HTTPException(status_code=400, detail="Task is not pending")
    
    # Check if task has expired
    expires_at = task["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    
    if datetime.utcnow() > expires_at:
        # Mark as expired
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Task has expired")
    
    # Update task with proof and mark as completed (awaiting approval)
    update_data = {
        "proof_text": proof.proof_text,
        "proof_photo_base64": proof.proof_photo_base64,
        "status": "completed",
        "completed_at": datetime.utcnow()
    }
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    # Send notification to creator for approval
    await manager.send_to_partner(current_user["id"], {
        "type": "task_completed",
        "task_id": task_id,
        "message": f"Task completed by your partner: {task['title']}",
        "proof": {
            "text": proof.proof_text,
            "has_photo": bool(proof.proof_photo_base64)
        }
    })
    
    return {"message": "Proof submitted successfully. Awaiting partner approval."}

@api_router.patch("/tasks/{task_id}/approve")
async def approve_task(task_id: str, approval: TaskApproval, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to approve this task")
    
    if task["status"] != "completed":
        raise HTTPException(status_code=400, detail="Task is not awaiting approval")
    
    # Update task status based on approval
    new_status = "approved" if approval.approved else "rejected"
    update_data = {
        "status": new_status,
        "approved_at": datetime.utcnow(),
        "approval_message": approval.message
    }
    
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    # If approved, award tokens to the task receiver
    tokens_awarded = 0
    if approval.approved:
        tokens_awarded = await add_tokens(
            task["receiver_id"], 
            task["couple_id"], 
            task["tokens_earned"]
        )
    
    # Send notification to task receiver
    notification_message = f"Task {'approved' if approval.approved else 'rejected'}: {task['title']}"
    if approval.approved:
        notification_message += f" | +{task['tokens_earned']} tokens earned!"
    
    await manager.send_to_partner(current_user["id"], {
        "type": "task_approved" if approval.approved else "task_rejected",
        "task_id": task_id,
        "approved": approval.approved,
        "message": notification_message,
        "approval_message": approval.message,
        "tokens_earned": task["tokens_earned"] if approval.approved else 0,
        "new_token_balance": tokens_awarded if approval.approved else None
    })
    
    result = {
        "message": f"Task {'approved' if approval.approved else 'rejected'} successfully"
    }
    
    if approval.approved:
        result["tokens_awarded"] = task["tokens_earned"]
    
    return result

# Token and Reward routes
@api_router.get("/tokens")
async def get_tokens(current_user: dict = Depends(get_current_user)):
    """Get current token balance for the user"""
    if not current_user.get("couple_id"):
        return {"tokens": 0, "lifetime_tokens": 0}
    
    user_tokens = await db.user_tokens.find_one({
        "user_id": current_user["id"], 
        "couple_id": current_user["couple_id"]
    }, {"_id": 0})
    
    if not user_tokens:
        return {"tokens": 0, "lifetime_tokens": 0}
    
    return {
        "tokens": user_tokens["tokens"],
        "lifetime_tokens": user_tokens["lifetime_tokens"]
    }

@api_router.get("/couple/tokens")
async def get_couple_tokens_info(current_user: dict = Depends(get_current_user)):
    """Get token balances for both partners"""
    if not current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Must be linked with a partner")
    
    couple_tokens = await get_couple_tokens(current_user["couple_id"])
    
    # Get partner info
    partner = await db.users.find_one({
        "couple_id": current_user["couple_id"],
        "id": {"$ne": current_user["id"]}
    }, {"_id": 0})
    
    return {
        "your_tokens": couple_tokens.get(current_user["id"], 0),
        "partner_tokens": couple_tokens.get(partner["id"], 0) if partner else 0,
        "partner_name": partner["name"] if partner else "Partner"
    }

@api_router.post("/rewards")
async def create_reward(reward: RewardCreate, current_user: dict = Depends(get_current_user)):
    """Create a new reward for the couple"""
    if not current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Must be linked with a partner to create rewards")
    
    reward_obj = Reward(
        couple_id=current_user["couple_id"],
        creator_id=current_user["id"],
        title=reward.title,
        description=reward.description,
        tokens_cost=reward.tokens_cost
    )
    
    await db.rewards.insert_one(reward_obj.dict())
    
    # Send notification to partner
    await manager.send_to_partner(current_user["id"], {
        "type": "new_reward",
        "reward": reward_obj.dict(),
        "message": f"New reward added: {reward.title} ({reward.tokens_cost} tokens)"
    })
    
    return reward_obj.dict()

@api_router.get("/rewards")
async def get_rewards(current_user: dict = Depends(get_current_user)):
    """Get all rewards for the couple"""
    if not current_user.get("couple_id"):
        return []
    
    rewards = await db.rewards.find({
        "couple_id": current_user["couple_id"]
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    return rewards

@api_router.post("/rewards/redeem")
async def redeem_reward(redeem_data: RewardRedeem, current_user: dict = Depends(get_current_user)):
    """Redeem a reward using tokens"""
    if not current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Must be linked with a partner")
    
    # Find the reward
    reward = await db.rewards.find_one({
        "id": redeem_data.reward_id,
        "couple_id": current_user["couple_id"]
    }, {"_id": 0})
    
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    
    if reward["is_redeemed"]:
        raise HTTPException(status_code=400, detail="Reward already redeemed")
    
    # Check if user has enough tokens
    user_balance = await get_user_tokens(current_user["id"], current_user["couple_id"])
    if user_balance < reward["tokens_cost"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Not enough tokens. Need {reward['tokens_cost']}, have {user_balance}"
        )
    
    # Spend tokens
    success = await spend_tokens(current_user["id"], current_user["couple_id"], reward["tokens_cost"])
    if not success:
        raise HTTPException(status_code=400, detail="Failed to spend tokens")
    
    # Mark reward as redeemed
    await db.rewards.update_one(
        {"id": redeem_data.reward_id},
        {"$set": {
            "is_redeemed": True,
            "redeemed_by": current_user["id"],
            "redeemed_at": datetime.utcnow()
        }}
    )
    
    # Get new token balance
    new_balance = await get_user_tokens(current_user["id"], current_user["couple_id"])
    
    # Send notification to partner
    await manager.send_to_partner(current_user["id"], {
        "type": "reward_redeemed",
        "reward": reward,
        "redeemed_by": current_user["name"],
        "message": f"{current_user['name']} redeemed: {reward['title']}"
    })
    
    return {
        "message": "Reward redeemed successfully",
        "reward": reward,
        "tokens_spent": reward["tokens_cost"],
        "new_balance": new_balance
    }

# Task expiration and notification management
@api_router.get("/tasks/active")
async def get_active_tasks(current_user: dict = Depends(get_current_user)):
    """Get active tasks for the user with time remaining"""
    if not current_user.get("couple_id"):
        return []
    
    # Get pending and completed tasks
    tasks = await db.tasks.find({
        "couple_id": current_user["couple_id"],
        "status": {"$in": ["pending", "completed"]},
        "expires_at": {"$gt": datetime.utcnow()}
    }, {"_id": 0}).sort("created_at", -1).to_list(20)
    
    # Add time remaining for each task
    for task in tasks:
        expires_at = task["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        
        time_remaining = expires_at - datetime.utcnow()
        task["time_remaining_minutes"] = max(0, int(time_remaining.total_seconds() / 60))
        task["is_expired"] = time_remaining.total_seconds() <= 0
    
    return tasks

@api_router.post("/tasks/check-expiry")
async def check_task_expiry(current_user: dict = Depends(get_current_user)):
    """Check for expired tasks and update their status"""
    if not current_user.get("couple_id"):
        return {"expired_count": 0}
    
    # Find expired tasks that are still pending
    expired_tasks = await db.tasks.find({
        "couple_id": current_user["couple_id"],
        "status": "pending",
        "expires_at": {"$lt": datetime.utcnow()}
    }, {"_id": 0}).to_list(100)
    
    expired_count = 0
    for task in expired_tasks:
        # Update status to expired
        await db.tasks.update_one(
            {"id": task["id"]},
            {"$set": {"status": "expired"}}
        )
        
        # Send expiration notification
        await manager.send_to_partner(current_user["id"], {
            "type": "task_expired",
            "task_id": task["id"],
            "task_title": task["title"],
            "message": f"Task expired: {task['title']}"
        })
        
        expired_count += 1
    
    return {"expired_count": expired_count}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a task (only task creator can delete)"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["creator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the task creator can delete this task")
    
    # Delete the task
    result = await db.tasks.delete_one({"id": task_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Send notification to partner if task was pending/completed
    if task["status"] in ["pending", "completed"]:
        await manager.send_to_partner(current_user["id"], {
            "type": "task_deleted",
            "task_id": task_id,
            "task_title": task["title"],
            "message": f"Task deleted: {task['title']}"
        })
    
    return {"message": "Task deleted successfully"}

# Enhanced task status endpoint
@api_router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed status of a specific task"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["couple_id"] != current_user.get("couple_id"):
        raise HTTPException(status_code=403, detail="Not authorized to view this task")
    
    # Calculate time remaining
    expires_at = task["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    
    time_remaining = expires_at - datetime.utcnow()
    
    return {
        "task": task,
        "time_remaining_minutes": max(0, int(time_remaining.total_seconds() / 60)),
        "is_expired": time_remaining.total_seconds() <= 0,
        "can_submit_proof": (
            task["receiver_id"] == current_user["id"] and 
            task["status"] == "pending" and 
            time_remaining.total_seconds() > 0
        ),
        "can_approve": (
            task["creator_id"] == current_user["id"] and 
            task["status"] == "completed"
        )
    }

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle any incoming messages if needed
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        manager.disconnect(user_id)

# AI suggestion endpoint
@api_router.post("/ai/suggest-task")
async def suggest_task(mood_type: str, intensity: int, is_extreme_mode: bool = False, current_user: dict = Depends(get_current_user)):
    boundaries = current_user.get("boundaries", [])
    suggestion = await get_ai_suggestion(mood_type, intensity, boundaries, is_extreme_mode)
    return suggestion

# Test endpoints
@api_router.get("/")
async def root():
    return {"message": "Pulse API is running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

@api_router.post("/admin/setup-indexes")
async def setup_database_indexes():
    """Setup database indexes for better performance"""
    try:
        # Create index on users collection for pairing code optimization
        await db.users.create_index("id")
        await db.users.create_index("couple_id")
        await db.users.create_index("email", unique=True)
        
        # Create indexes for couples collection
        await db.couples.create_index("id")
        await db.couples.create_index("pairing_code")
        
        # Create indexes for moods collection
        await db.moods.create_index([("couple_id", 1), ("expires_at", 1)])
        await db.moods.create_index([("user_id", 1), ("created_at", -1)])
        
        # Create indexes for tasks collection (enhanced for new features)
        await db.tasks.create_index([("couple_id", 1), ("created_at", -1)])
        await db.tasks.create_index([("receiver_id", 1), ("status", 1)])
        await db.tasks.create_index([("creator_id", 1), ("status", 1)])
        await db.tasks.create_index([("expires_at", 1), ("status", 1)])  # For expiry checks
        
        # Create indexes for new collections
        # User tokens collection
        await db.user_tokens.create_index([("user_id", 1), ("couple_id", 1)], unique=True)
        await db.user_tokens.create_index("couple_id")
        
        # Rewards collection
        await db.rewards.create_index([("couple_id", 1), ("created_at", -1)])
        await db.rewards.create_index([("couple_id", 1), ("is_redeemed", 1)])
        await db.rewards.create_index("creator_id")
        
        return {"message": "Database indexes created successfully"}
    except Exception as e:
        logger.error(f"Error creating indexes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create database indexes")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()