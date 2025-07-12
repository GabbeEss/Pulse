#!/usr/bin/env python3
"""
Comprehensive pairing system test
"""

import requests
import json
from datetime import datetime
import time

class PairingSystemTester:
    def __init__(self):
        self.base_url = "https://ab68f583-e369-494f-b7f6-93bb401f8c1b.preview.emergentagent.com"
        self.api_url = f"{self.base_url}/api"
        self.tests_passed = 0
        self.tests_total = 0

    def log_test(self, name, success, details=""):
        self.tests_total += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")

    def make_request(self, method, endpoint, data=None, token=None, expected_status=200):
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            else:
                return False, f"Unsupported method: {method}"

            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"text": response.text}

            if not success:
                return False, f"Expected {expected_status}, got {response.status_code}. Response: {response_data}"
                
            return True, response_data

        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}"

    def test_pairing_performance(self):
        """Test pairing system performance and timeout resolution"""
        print("\n🚀 PAIRING SYSTEM PERFORMANCE TEST")
        print("=" * 50)
        
        # Test multiple pairing operations to ensure no timeouts
        for i in range(3):
            print(f"\n🔄 Test iteration {i+1}/3")
            
            # Create unique users
            timestamp = datetime.now().strftime('%H%M%S') + str(i)
            user1_data = {
                "email": f"perf1_{timestamp}@example.com",
                "name": f"PerfUser1_{i}",
                "password": "testpass123"
            }
            user2_data = {
                "email": f"perf2_{timestamp}@example.com",
                "name": f"PerfUser2_{i}",
                "password": "testpass123"
            }
            
            # Register users
            start_time = time.time()
            success1, response1 = self.make_request('POST', 'auth/register', user1_data)
            success2, response2 = self.make_request('POST', 'auth/register', user2_data)
            
            if not (success1 and success2):
                self.log_test(f"User registration {i+1}", False, "Failed to register users")
                continue
                
            user1_token = response1.get('access_token')
            user2_token = response2.get('access_token')
            
            # Test pairing code generation
            success, response = self.make_request('GET', 'pairing/code', token=user1_token)
            if not success:
                self.log_test(f"Pairing code generation {i+1}", False, str(response))
                continue
            
            pairing_code = response.get('pairing_code')
            
            # Test pairing/generate endpoint
            success, response = self.make_request('POST', 'pairing/generate', token=user1_token)
            self.log_test(f"Pairing generate endpoint {i+1}", success, str(response) if not success else "")
            
            # Test pairing link
            pairing_data = {"pairing_code": pairing_code}
            success, response = self.make_request('POST', 'pairing/link', pairing_data, user2_token)
            
            end_time = time.time()
            duration = end_time - start_time
            
            self.log_test(f"Pairing link {i+1} (took {duration:.2f}s)", success, str(response) if not success else "")
            
            # Verify no timeout (should complete in under 5 seconds)
            self.log_test(f"No timeout {i+1}", duration < 5.0, f"Took {duration:.2f}s")

    def test_edge_cases(self):
        """Test edge cases and error handling"""
        print("\n🔍 EDGE CASES TEST")
        print("=" * 30)
        
        # Register test user
        timestamp = datetime.now().strftime('%H%M%S')
        user_data = {
            "email": f"edge_{timestamp}@example.com",
            "name": "EdgeUser",
            "password": "testpass123"
        }
        
        success, response = self.make_request('POST', 'auth/register', user_data)
        if not success:
            print("❌ Failed to register edge test user")
            return
        
        token = response.get('access_token')
        
        # Test invalid pairing codes
        test_cases = [
            ("INVALID", 404, "Invalid pairing code"),
            ("", 404, "Empty pairing code"),
            ("12345", 404, "Short pairing code"),
            ("1234567", 404, "Long pairing code"),
            ("ABCDEF", 404, "Non-existent pairing code")
        ]
        
        for code, expected_status, description in test_cases:
            data = {"pairing_code": code}
            success, response = self.make_request('POST', 'pairing/link', data, token, expected_status)
            self.log_test(description, success, str(response) if not success else "")

    def test_already_linked_users(self):
        """Test behavior with already linked users"""
        print("\n🔗 ALREADY LINKED USERS TEST")
        print("=" * 35)
        
        # Create and link two users first
        timestamp = datetime.now().strftime('%H%M%S')
        user1_data = {
            "email": f"linked1_{timestamp}@example.com",
            "name": "LinkedUser1",
            "password": "testpass123"
        }
        user2_data = {
            "email": f"linked2_{timestamp}@example.com",
            "name": "LinkedUser2", 
            "password": "testpass123"
        }
        
        # Register and link users
        success1, response1 = self.make_request('POST', 'auth/register', user1_data)
        success2, response2 = self.make_request('POST', 'auth/register', user2_data)
        
        if not (success1 and success2):
            print("❌ Failed to register users for linking test")
            return
        
        user1_token = response1.get('access_token')
        user2_token = response2.get('access_token')
        
        # Get pairing code and link
        success, response = self.make_request('GET', 'pairing/code', token=user1_token)
        if not success:
            print("❌ Failed to get pairing code")
            return
        
        pairing_code = response.get('pairing_code')
        pairing_data = {"pairing_code": pairing_code}
        
        success, response = self.make_request('POST', 'pairing/link', pairing_data, user2_token)
        self.log_test("Initial pairing", success, str(response) if not success else "")
        
        # Test that already linked users can't get new pairing codes
        success, response = self.make_request('GET', 'pairing/code', token=user1_token, expected_status=400)
        self.log_test("Prevent pairing code for linked user", success, str(response) if not success else "")
        
        success, response = self.make_request('POST', 'pairing/generate', token=user1_token, expected_status=400)
        self.log_test("Prevent pairing generate for linked user", success, str(response) if not success else "")
        
        # Test that already linked users can't link again
        success, response = self.make_request('POST', 'pairing/link', pairing_data, user2_token, expected_status=400)
        self.log_test("Prevent double linking", success, str(response) if not success else "")

    def run_all_tests(self):
        """Run all pairing system tests"""
        print("🚀 COMPREHENSIVE PAIRING SYSTEM TEST")
        print("=" * 50)
        
        self.test_pairing_performance()
        self.test_edge_cases()
        self.test_already_linked_users()
        
        # Print summary
        print(f"\n📊 PAIRING SYSTEM TEST RESULTS")
        print(f"Tests passed: {self.tests_passed}/{self.tests_total}")
        success_rate = (self.tests_passed / self.tests_total) * 100 if self.tests_total > 0 else 0
        print(f"Success rate: {success_rate:.1f}%")
        
        if success_rate >= 90:
            print("🎉 Pairing system is working excellently!")
            return True
        elif success_rate >= 80:
            print("✅ Pairing system is working well with minor issues")
            return True
        else:
            print("❌ Pairing system has significant issues")
            return False

def main():
    tester = PairingSystemTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)