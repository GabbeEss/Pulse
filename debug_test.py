#!/usr/bin/env python3
"""
Debug specific failing endpoints
"""

import requests
import json
from datetime import datetime

# Test configuration
BASE_URL = "https://760db4b3-114c-412c-a5f7-52f931b271ed.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

def test_endpoint(method, endpoint, data=None, token=None, expected_status=200):
    """Test a specific endpoint and return detailed results"""
    url = f"{API_URL}/{endpoint}"
    headers = {'Content-Type': 'application/json'}
    
    if token:
        headers['Authorization'] = f'Bearer {token}'

    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=15)
        elif method == 'POST':
            response = requests.post(url, json=data, headers=headers, timeout=15)
        elif method == 'PATCH':
            response = requests.patch(url, json=data, headers=headers, timeout=15)
        
        print(f"\n{method} {endpoint}")
        print(f"Status: {response.status_code}")
        print(f"Expected: {expected_status}")
        
        try:
            response_data = response.json()
            print(f"Response: {json.dumps(response_data, indent=2)}")
        except:
            print(f"Response Text: {response.text[:500]}")
        
        return response.status_code == expected_status, response
        
    except Exception as e:
        print(f"\n{method} {endpoint}")
        print(f"ERROR: {str(e)}")
        return False, None

def main():
    print("🔍 Debug Testing Specific Endpoints...")
    
    # First, register and get tokens
    timestamp = datetime.now().strftime('%H%M%S')
    user1_data = {
        "email": f"debug1_{timestamp}@example.com",
        "name": "Debug User 1",
        "password": "testpassword123"
    }
    user2_data = {
        "email": f"debug2_{timestamp}@example.com", 
        "name": "Debug User 2",
        "password": "testpassword123"
    }
    
    # Register users
    success, response = test_endpoint('POST', 'auth/register', user1_data, expected_status=200)
    if not success:
        print("❌ Failed to register user 1")
        return
    user1_token = response.json().get('access_token')
    user1_id = response.json().get('user', {}).get('id')
    
    success, response = test_endpoint('POST', 'auth/register', user2_data, expected_status=200)
    if not success:
        print("❌ Failed to register user 2")
        return
    user2_token = response.json().get('access_token')
    user2_id = response.json().get('user', {}).get('id')
    
    # Pair users
    success, response = test_endpoint('GET', 'pairing/code', token=user1_token, expected_status=200)
    if not success:
        print("❌ Failed to get pairing code")
        return
    pairing_code = response.json().get('pairing_code')
    
    pairing_data = {"pairing_code": pairing_code}
    success, response = test_endpoint('POST', 'pairing/link', pairing_data, user2_token, expected_status=200)
    if not success:
        print("❌ Failed to pair users")
        return
    
    print("\n✅ Users registered and paired successfully")
    
    # Now test the problematic endpoints
    print("\n🔍 Testing Problematic Endpoints...")
    
    # Test tasks/active
    test_endpoint('GET', 'tasks/active', token=user1_token, expected_status=200)
    
    # Test moods retrieval
    test_endpoint('GET', 'moods', token=user1_token, expected_status=200)
    
    # Test rewards listing
    test_endpoint('GET', 'rewards', token=user1_token, expected_status=200)
    
    # Create a task first
    task_data = {
        "title": "Debug Task",
        "description": "Test task for debugging",
        "duration_minutes": 60,
        "tokens_earned": 5
    }
    success, response = test_endpoint('POST', 'tasks', task_data, user1_token, expected_status=200)
    if success:
        task_id = response.json().get('id')
        print(f"\n✅ Created task with ID: {task_id}")
        
        # Test task status
        test_endpoint('GET', f'tasks/{task_id}/status', token=user1_token, expected_status=200)
        
        # Test proof submission
        proof_data = {
            "proof_text": "Debug proof text"
        }
        test_endpoint('PATCH', f'tasks/{task_id}/proof', proof_data, user2_token, expected_status=200)
    
    # Test tasks retrieval
    test_endpoint('GET', 'tasks', token=user1_token, expected_status=200)

if __name__ == "__main__":
    main()