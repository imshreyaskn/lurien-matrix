"""
Auth Middleware — JWT Validation
"""
import os
import logging
from typing import Optional
from datetime import datetime, timedelta, timezone

from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from bson import ObjectId

from src.db import mongo

logger = logging.getLogger("llm_firewall.auth_middleware")

security = HTTPBearer()

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def validate_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Validate the JWT access token and return the user document.
    Raises HTTPException on failure.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        try:
            user_id = ObjectId(user_id_str)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid user ID format in token")
            
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
        
    users_collection = mongo.get_users_collection()
    user = await users_collection.find_one({"_id": user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
        
    return user
