const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testUpload() {
  const BASE_URL = 'http://localhost:3000';
  
  console.log('Step 1: Creating test file...');
  // Create a simple test text file
  const testContent = 'This is a test document for the chat app. It contains some sample text to test the document upload and processing functionality.';
  fs.writeFileSync('/tmp/test-upload.txt', testContent);
  
  console.log('Step 2: Logging in...');
  // Login (you'll need to use your actual credentials)
  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com', // Replace with your email
      password: 'password123'     // Replace with your password
    })
  });
  
  if (!loginResponse.ok) {
    console.error('Login failed:', await loginResponse.text());
    return;
  }
  
  const cookies = loginResponse.headers.raw()['set-cookie'];
  console.log('✓ Login successful');
  
  console.log('Step 3: Uploading test file...');
  // Upload the test file
  const form = new FormData();
  form.append('file', fs.createReadStream('/tmp/test-upload.txt'));
  
  const uploadResponse = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      'Cookie': cookies.join('; ')
    },
    body: form
  });
  
  const uploadResult = await uploadResponse.json();
  
  if (!uploadResponse.ok) {
    console.error('✗ Upload failed:', uploadResult);
    return;
  }
  
  console.log('✓ Upload successful:', uploadResult);
  
  console.log('Step 4: Checking documents list...');
  const docsResponse = await fetch(`${BASE_URL}/api/documents`, {
    headers: {
      'Cookie': cookies.join('; ')
    }
  });
  
  const docs = await docsResponse.json();
  console.log('✓ Documents:', docs);
  
  console.log('\n✓ All tests passed!');
  
  // Cleanup
  fs.unlinkSync('/tmp/test-upload.txt');
}

testUpload().catch(console.error);
