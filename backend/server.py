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

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    couple_id: str
    creator_id: str
    receiver_id: str
    title: str
    description: str
    reward: Optional[str] = None
    duration_minutes: int
    status: str = "pending"  # pending, completed, expired
    proof_text: Optional[str] = None
    proof_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime

class TaskCreate(BaseModel):
    title: str
    description: str
    reward: Optional[str] = None
    duration_minutes: int = 60

class TaskProof(BaseModel):
    proof_text: Optional[str] = None
    proof_url: Optional[str] = None

class Reward(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    couple_id: str
    title: str
    description: str
    tokens_cost: int
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RewardCreate(BaseModel):
    title: str
    description: str
    tokens_cost: int

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
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# Mock AI suggestion function
async def get_ai_suggestion(mood_type: str, intensity: int, boundaries: List[str]) -> dict:
    suggestions = [
        {
            "title": "Cook naked with your apron on",
            "description": "Remove your underwear and prepare dinner while sending a photo of your plate.",
            "default_duration_minutes": 90
        },
        {
            "title": "Sensual massage time",
            "description": "Give your partner a 10-minute massage with oils and take a photo of the setup.",
            "default_duration_minutes": 60
        },
        {
            "title": "Send a spicy voice message",
            "description": "Record a 30-second voice message telling your partner what you want to do to them.",
            "default_duration_minutes": 30
        },
        {
            "title": "Take a teasing photo",
            "description": "Take a photo showing just enough to make your partner want more.",
            "default_duration_minutes": 45
        }
    ]
    return random.choice(suggestions)

# Authentication routes
@api_router.post("/auth/register")
async def register(user: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user.email})
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
    
    # Generate pairing code
    pairing_code = generate_pairing_code()
    
    # Create token
    access_token = create_access_token(data={"sub": user_obj.id})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_obj.id,
            "email": user_obj.email,
            "name": user_obj.name,
            "couple_id": user_obj.couple_id,
            "pairing_code": pairing_code
        }
    }

@api_router.post("/auth/login")
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": db_user["id"]})
    
    # Get pairing code if not coupled
    pairing_code = None
    if not db_user.get("couple_id"):
        pairing_code = generate_pairing_code()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": db_user["id"],
            "email": db_user["email"],
            "name": db_user["name"],
            "couple_id": db_user.get("couple_id"),
            "pairing_code": pairing_code
        }
    }

# Pairing routes
@api_router.post("/pairing/link")
async def link_with_partner(request: PairingRequest, current_user: dict = Depends(get_current_user)):
    if current_user.get("couple_id"):
        raise HTTPException(status_code=400, detail="Already linked with a partner")
    
    # Find pending pairing request by code
    existing_pairing = await db.pairing_requests.find_one({
        "pairing_code": request.pairing_code,
        "user_id": {"$ne": current_user["id"]},
        "used": False
    })
    
    if not existing_pairing:
        # Create new pairing request
        pairing_request = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "pairing_code": request.pairing_code,
            "used": False,
            "created_at": datetime.utcnow()
        }
        await db.pairing_requests.insert_one(pairing_request)
        return {"message": "Pairing request created. Waiting for partner to join.", "pairing_code": request.pairing_code}
    
    # Found matching pairing request - link partners
    partner = await db.users.find_one({"id": existing_pairing["user_id"]})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    if partner.get("couple_id"):
        raise HTTPException(status_code=400, detail="Partner already linked with someone else")
    
    # Create couple
    couple = Couple(
        user1_id=partner["id"],
        user2_id=current_user["id"],
        pairing_code=request.pairing_code
    )
    
    await db.couples.insert_one(couple.dict())
    
    # Update both users
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"couple_id": couple.id}}
    )
    await db.users.update_one(
        {"id": partner["id"]},
        {"$set": {"couple_id": couple.id}}
    )
    
    # Mark pairing request as used
    await db.pairing_requests.update_one(
        {"id": existing_pairing["id"]},
        {"$set": {"used": True}}
    )
    
    return {"message": "Successfully linked with partner", "couple_id": couple.id}

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
    
    # If spicy mood, suggest AI task
    suggestion = None
    if mood.mood_type in ["feeling_spicy", "horny", "teasing"]:
        suggestion = await get_ai_suggestion(mood.mood_type, mood.intensity, current_user.get("boundaries", []))
    
    return {"mood": mood_obj.dict(), "ai_suggestion": suggestion}

@api_router.get("/moods")
async def get_moods(current_user: dict = Depends(get_current_user)):
    if not current_user.get("couple_id"):
        return []
    
    moods = await db.moods.find({
        "couple_id": current_user["couple_id"],
        "expires_at": {"$gt": datetime.utcnow()}
    }).sort("created_at", -1).to_list(10)
    
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
    })
    
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
        expires_at=expires_at
    )
    
    await db.tasks.insert_one(task_obj.dict())
    
    # Send real-time notification to partner
    await manager.send_to_partner(current_user["id"], {
        "type": "new_task",
        "task": task_obj.dict()
    })
    
    return task_obj.dict()

@api_router.get("/tasks")
async def get_tasks(current_user: dict = Depends(get_current_user)):
    if not current_user.get("couple_id"):
        return []
    
    tasks = await db.tasks.find({
        "couple_id": current_user["couple_id"]
    }).sort("created_at", -1).to_list(20)
    
    return tasks

@api_router.patch("/tasks/{task_id}/proof")
async def submit_proof(task_id: str, proof: TaskProof, current_user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["receiver_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to submit proof for this task")
    
    if task["status"] != "pending":
        raise HTTPException(status_code=400, detail="Task is not pending")
    
    if datetime.utcnow() > datetime.fromisoformat(task["expires_at"].replace("Z", "+00:00")):
        raise HTTPException(status_code=400, detail="Task has expired")
    
    # Update task with proof
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "proof_text": proof.proof_text,
            "proof_url": proof.proof_url,
            "status": "completed"
        }}
    )
    
    # Send notification to creator
    await manager.send_to_partner(current_user["id"], {
        "type": "task_completed",
        "task_id": task_id,
        "proof": proof.dict()
    })
    
    return {"message": "Proof submitted successfully"}

# WebSocket endpoint
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
async def suggest_task(mood_type: str, intensity: int, current_user: dict = Depends(get_current_user)):
    boundaries = current_user.get("boundaries", [])
    suggestion = await get_ai_suggestion(mood_type, intensity, boundaries)
    return suggestion

# Test endpoints
@api_router.get("/")
async def root():
    return {"message": "Pulse API is running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()