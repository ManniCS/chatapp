import fs from 'fs/promises';
import { extractTextFromFile } from './lib/documents/processor.ts';

async function testPDFExtraction() {
  console.log('Creating a test text file...');
  
  // Create a simple test file
  const testContent = 'This is a test document. It contains sample text to verify the text extraction works correctly.';
  await fs.writeFile('/tmp/test.txt', testContent);
  
  console.log('Testing text extraction...');
  const extractedText = await extractTextFromFile('/tmp/test.txt', 'text/plain');
  
  console.log('Extracted text:', extractedText);
  console.log('Expected text:', testContent);
  
  if (extractedText === testContent) {
    console.log('✓ Text extraction works!');
  } else {
    console.log('✗ Text extraction failed');
  }
  
  // Cleanup
  await fs.unlink('/tmp/test.txt');
}

testPDFExtraction().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
