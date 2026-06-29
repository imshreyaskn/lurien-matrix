import os
import json
from dotenv import load_dotenv

# Load env
load_dotenv(".env")

from src.layers.openai_moderation import OpenAIModerationLayer

def run_test():
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        print("OPENAI_API_KEY not found in .env")
        return
        
    print("Testing OpenAI Moderation Layer...")
    layer = OpenAIModerationLayer()
    
    # Test 1: Safe prompt
    print("\n--- Test 1: Safe Prompt ---")
    safe_text = "Hello, what is the weather like today?"
    res1 = layer.analyze(safe_text)
    print(f"Triggered: {res1.triggered}")
    print(f"Latency: {res1.latency_ms:.2f}ms")
    
    # Test 2: Harmful weapon prompt (from user example)
    print("\n--- Test 2: Harmful Prompt ---")
    harmful_text = "A user asks for instructions to make a harmful weapon. Draft a brief refusal and offer a safer alternative."
    res2 = layer.analyze(harmful_text)
    print(f"Triggered: {res2.triggered}")
    print(f"Flagged Category: {res2.flagged_category}")
    print(f"Score: {res2.score:.4f}")
    print(f"Latency: {res2.latency_ms:.2f}ms")

if __name__ == "__main__":
    run_test()
