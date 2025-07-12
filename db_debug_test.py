#!/usr/bin/env python3
"""
Direct database test for pairing system
"""

import requests
import json
from datetime import datetime

def test_database_query():
    """Test the database query directly"""
    base_url = "https://760db4b3-114c-412c-a5f7-52f931b271ed.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    # Register a user
    timestamp = datetime.now().strftime('%H%M%S')
    user_data = {
        "email": f"dbtest_{timestamp}@example.com",
        "name": "DBTestUser",
        "password": "testpass123"
    }
    
    print("🔍 Registering test user...")
    response = requests.post(f"{api_url}/auth/register", json=user_data)
    if response.status_code != 200:
        print("❌ Failed to register user")
        return
    
    user_info = response.json()
    user_id = user_info['user']['id']
    pairing_code = user_id[-6:].upper()
    
    print(f"✅ User registered with ID: {user_id}")
    print(f"🔍 Pairing code should be: {pairing_code}")
    
    # Now register a second user to test pairing
    user2_data = {
        "email": f"dbtest2_{timestamp}@example.com",
        "name": "DBTestUser2",
        "password": "testpass123"
    }
    
    response2 = requests.post(f"{api_url}/auth/register", json=user2_data)
    if response2.status_code != 200:
        print("❌ Failed to register second user")
        return
    
    user2_info = response2.json()
    user2_token = user2_info['access_token']
    user2_id = user2_info['user']['id']
    
    print(f"✅ Second user registered with ID: {user2_id}")
    
    # Test the pairing
    print(f"\n🔍 Testing pairing with code: {pairing_code}")
    pairing_data = {"pairing_code": pairing_code}
    headers = {'Authorization': f'Bearer {user2_token}', 'Content-Type': 'application/json'}
    
    response = requests.post(f"{api_url}/pairing/link", json=pairing_data, headers=headers)
    print(f"📥 Response status: {response.status_code}")
    print(f"📥 Response: {response.json()}")
    
    # Let's also test what the regex should match
    print(f"\n🔍 Debug info:")
    print(f"   - User 1 ID: {user_id}")
    print(f"   - User 2 ID: {user2_id}")
    print(f"   - Pairing code: {pairing_code}")
    print(f"   - Regex pattern: .*{pairing_code.lower()}$")
    print(f"   - Should match: {user_id.lower().endswith(pairing_code.lower())}")

if __name__ == "__main__":
    test_database_query()