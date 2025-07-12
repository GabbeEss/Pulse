#!/usr/bin/env python3
"""
Quick test for unauthorized access
"""

import requests

def test_unauthorized():
    base_url = "https://ab68f583-e369-494f-b7f6-93bb401f8c1b.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    # Test unauthorized access to tasks endpoint
    response = requests.get(f"{api_url}/tasks")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    test_unauthorized()