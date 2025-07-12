#!/usr/bin/env python3
"""
Debug test for pairing system specifically
"""

import requests
import json
from datetime import datetime

class PairingDebugTester:
    def __init__(self):
        self.base_url = "https://311a621a-67d9-4d77-a839-83196fdd23dc.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        
        # Create unique test users
        timestamp = datetime.now().strftime('%H%M%S')
        self.user1 = {
            "email": f"debug1_{timestamp}@example.com",
            "name": "DebugUser1",
            "password": "testpass123"
        }
        self.user2 = {
            "email": f"debug2_{timestamp}@example.com", 
            "name": "DebugUser2",
            "password": "testpass123"
        }

    def make_request(self, method, endpoint, data=None, token=None):
        """Make HTTP request with detailed logging"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'

        print(f"\n🔍 {method} {url}")
        if data:
            print(f"📤 Request data: {json.dumps(data, indent=2)}")

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            else:
                return None

            print(f"📥 Response status: {response.status_code}")
            
            try:
                response_data = response.json()
                print(f"📥 Response data: {json.dumps(response_data, indent=2)}")
            except:
                response_data = {"text": response.text}
                print(f"📥 Response text: {response.text}")

            return response.status_code, response_data

        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {str(e)}")
            return None, None

    def test_pairing_debug(self):
        """Debug the pairing system step by step"""
        print("🔍 PAIRING SYSTEM DEBUG TEST")
        print("=" * 50)
        
        # Step 1: Register users
        print("\n1️⃣ Registering User 1...")
        status, response = self.make_request('POST', 'auth/register', self.user1)
        if status != 200:
            print("❌ User 1 registration failed")
            return False
        user1_token = response.get('access_token')
        user1_id = response.get('user', {}).get('id')
        print(f"✅ User 1 registered with ID: {user1_id}")
        
        print("\n2️⃣ Registering User 2...")
        status, response = self.make_request('POST', 'auth/register', self.user2)
        if status != 200:
            print("❌ User 2 registration failed")
            return False
        user2_token = response.get('access_token')
        user2_id = response.get('user', {}).get('id')
        print(f"✅ User 2 registered with ID: {user2_id}")
        
        # Step 2: Get pairing code from user 1
        print("\n3️⃣ Getting pairing code from User 1...")
        status, response = self.make_request('GET', 'pairing/code', token=user1_token)
        if status != 200:
            print("❌ Failed to get pairing code")
            return False
        pairing_code = response.get('pairing_code')
        print(f"✅ Pairing code: {pairing_code}")
        print(f"🔍 Expected pairing code (last 6 chars of user1_id): {user1_id[-6:].upper()}")
        
        # Step 3: Test pairing/generate endpoint
        print("\n4️⃣ Testing pairing/generate endpoint...")
        status, response = self.make_request('POST', 'pairing/generate', token=user1_token)
        if status != 200:
            print("❌ Failed to generate pairing code")
        else:
            generated_code = response.get('pairing_code')
            print(f"✅ Generated pairing code: {generated_code}")
        
        # Step 4: Attempt pairing
        print("\n5️⃣ Attempting to link User 2 with User 1's code...")
        pairing_data = {"pairing_code": pairing_code}
        status, response = self.make_request('POST', 'pairing/link', pairing_data, user2_token)
        
        if status == 200:
            print("✅ Pairing successful!")
            couple_id = response.get('couple_id')
            print(f"🎉 Couple ID: {couple_id}")
            return True
        else:
            print(f"❌ Pairing failed with status {status}")
            print("🔍 Debugging information:")
            print(f"   - User 1 ID: {user1_id}")
            print(f"   - User 2 ID: {user2_id}")
            print(f"   - Pairing code: {pairing_code}")
            print(f"   - Expected match: {user1_id[-6:].upper()}")
            return False

    def test_edge_cases(self):
        """Test edge cases for pairing"""
        print("\n🔍 TESTING EDGE CASES")
        print("=" * 30)
        
        # Register a test user
        timestamp = datetime.now().strftime('%H%M%S')
        test_user = {
            "email": f"edge_{timestamp}@example.com",
            "name": "EdgeUser",
            "password": "testpass123"
        }
        
        status, response = self.make_request('POST', 'auth/register', test_user)
        if status != 200:
            print("❌ Failed to register edge test user")
            return
        
        token = response.get('access_token')
        
        # Test invalid pairing code
        print("\n🔍 Testing invalid pairing code...")
        invalid_data = {"pairing_code": "INVALID"}
        status, response = self.make_request('POST', 'pairing/link', invalid_data, token)
        print(f"Expected 404, got {status}: {'✅' if status == 404 else '❌'}")
        
        # Test empty pairing code
        print("\n🔍 Testing empty pairing code...")
        empty_data = {"pairing_code": ""}
        status, response = self.make_request('POST', 'pairing/link', empty_data, token)
        print(f"Expected 404, got {status}: {'✅' if status == 404 else '❌'}")

def main():
    tester = PairingDebugTester()
    success = tester.test_pairing_debug()
    tester.test_edge_cases()
    
    if success:
        print("\n🎉 Pairing system is working!")
    else:
        print("\n❌ Pairing system has issues")

if __name__ == "__main__":
    main()