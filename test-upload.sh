#!/bin/bash

BASE_URL="http://localhost:3000"

echo "=== Testing ChatApp Upload ==="
echo ""

# Step 1: Create test file
echo "Step 1: Creating test text file..."
cat > /tmp/test-doc.txt << 'EOF'
This is a test document for the ChatApp system.
It contains multiple lines of text to test the document processing pipeline.
The system should extract this text, chunk it, and generate embeddings.
This will verify that the entire upload workflow is functioning correctly.
EOF

echo "✓ Test file created"
echo ""

# Step 2: Signup
echo "Step 2: Creating test user account..."
SIGNUP_RESPONSE=$(curl -s -c /tmp/cookies.txt -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-'$(date +%s)'@example.com","password":"testpass123","name":"Test Company"}')

echo "Signup response: $SIGNUP_RESPONSE"
echo ""

# Step 3: Login
echo "Step 3: Logging in..."
LOGIN_RESPONSE=$(curl -s -c /tmp/cookies.txt -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-'$(date +%s)'@example.com","password":"testpass123"}')

echo "Login response: $LOGIN_RESPONSE"
echo ""

# Wait a moment
sleep 2

# Step 4: Upload document
echo "Step 4: Uploading test document..."
UPLOAD_RESPONSE=$(curl -s -b /tmp/cookies.txt -X POST "$BASE_URL/api/documents/upload" \
  -F "file=@/tmp/test-doc.txt")

echo "Upload response: $UPLOAD_RESPONSE"
echo ""

# Step 5: Check documents list
echo "Step 5: Fetching documents list..."
DOCS_RESPONSE=$(curl -s -b /tmp/cookies.txt "$BASE_URL/api/documents")

echo "Documents response: $DOCS_RESPONSE"
echo ""

# Cleanup
rm -f /tmp/test-doc.txt /tmp/cookies.txt

echo "=== Test Complete ==="
