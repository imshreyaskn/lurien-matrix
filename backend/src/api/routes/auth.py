"""
Authentication Routes — /v1/auth
"""
import logging
from datetime import datetime, timezone
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status, Request

from src.api.schemas import UserCreate, UserLogin, TokenResponse, UserResponse
from src.db import mongo, redis
from src.api.auth_middleware import create_access_token, validate_user_token

async def check_auth_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    r = redis.get_redis()
    if r:
        key = f"rate:auth:{client_ip}"
        async with r.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, 60, nx=True)
            results = await pipe.execute()
            count = results[0]
        if count > 5:
            raise HTTPException(status_code=429, detail="Too many authentication attempts. Please try again in a minute.")

async def log_auth_event(event_type: str, email: str, ip: str, success: bool):
    try:
        db = mongo.get_db()
        if db is not None:
            await db.audit_logs.insert_one({
                "event_type": event_type,
                "email": email,
                "ip": ip,
                "success": success,
                "timestamp": datetime.now(timezone.utc)
            })
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

logger = logging.getLogger("llm_firewall.routes.auth")

router = APIRouter(prefix="/v1/auth", tags=["auth"])

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: Request, user_data: UserCreate, _: None = Depends(check_auth_rate_limit)):
    users = mongo.get_users_collection()
    
    # Check if user already exists
    existing_user = await users.find_one({"email": user_data.email})
    if existing_user:
        await log_auth_event("signup", user_data.email, request.client.host if request.client else "unknown", False)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
        
    hashed_password = get_password_hash(user_data.password)
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "email": user_data.email,
        "hashed_password": hashed_password,
        "created_at": now
    }
    
    result = await users.insert_one(user_doc)
    await log_auth_event("signup", user_data.email, request.client.host if request.client else "unknown", True)
    
    return UserResponse(
        id=str(result.inserted_id),
        email=user_doc["email"],
        created_at=now
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, user_data: UserLogin, _: None = Depends(check_auth_rate_limit)):
    users = mongo.get_users_collection()
    
    user = await users.find_one({"email": user_data.email})
    if not user:
        await log_auth_event("login", user_data.email, request.client.host if request.client else "unknown", False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not verify_password(user_data.password, user["hashed_password"]):
        await log_auth_event("login", user_data.email, request.client.host if request.client else "unknown", False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": str(user["_id"])})
    await log_auth_event("login", user_data.email, request.client.host if request.client else "unknown", True)
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=str(user["_id"]),
            email=user["email"],
            created_at=user["created_at"]
        )
    )


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(validate_user_token)):
    return UserResponse(
        id=str(current_user["_id"]),
        email=current_user["email"],
        created_at=current_user["created_at"]
    )
