"""
Authentication Routes — /v1/auth
"""
import logging
from datetime import datetime, timezone
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status

from src.api.schemas import UserCreate, UserLogin, TokenResponse, UserResponse
from src.db import mongo
from src.api.auth_middleware import create_access_token, validate_user_token

logger = logging.getLogger("llm_firewall.routes.auth")

router = APIRouter(prefix="/v1/auth", tags=["auth"])

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate):
    users = mongo.get_users_collection()
    
    # Check if user already exists
    existing_user = await users.find_one({"email": user_data.email})
    if existing_user:
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
    
    return UserResponse(
        id=str(result.inserted_id),
        email=user_doc["email"],
        created_at=now
    )


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    users = mongo.get_users_collection()
    
    user = await users.find_one({"email": user_data.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
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
