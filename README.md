# ChatApp - AI-Powered Document Chat Platform

A full-stack Next.js application that enables businesses to upload documents and provides customers with an AI-powered chat interface to search and interact with those documents using natural language.

## Features

### Admin Console
- **Authentication**: Secure signup/login for company administrators
- **Document Management**: Upload and manage business documents (PDF, TXT, DOC, DOCX)
- **Automatic Processing**: Documents are automatically processed, chunked, and vectorized for efficient searching
- **Document List**: View all uploaded documents with metadata

### Customer Chat Interface
- **Natural Language Chat**: Customers can ask questions in plain English
- **AI-Powered Responses**: GPT-3.5 generates contextual answers based on uploaded documents
- **Semantic Search**: Uses OpenAI embeddings and vector similarity search to find relevant information
- **Session Management**: Chat history is maintained across conversations

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL with pgvector extension)
- **Authentication**: Supabase Auth
- **AI/ML**: 
  - OpenAI GPT-3.5 Turbo for chat responses
  - OpenAI text-embedding-ada-002 for document embeddings
- **Document Processing**: pdf-parse, mammoth

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- A Supabase account ([sign up here](https://supabase.com))
- An OpenAI API key ([get one here](https://platform.openai.com/api-keys))

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd chatapp
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings** → **API** and copy:
   - Project URL
   - Anon/Public key
   - Service Role key
3. Go to **SQL Editor** and run the SQL script from `supabase-schema.sql`
   - This creates all necessary tables, indexes, and functions
   - Enables pgvector extension for vector similarity search
   - Sets up Row Level Security policies

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
```

Replace the placeholder values with your actual credentials.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Guide

### For Administrators

1. **Sign Up**: Navigate to `/auth/signup` to create a company account
2. **Login**: Use `/auth/login` to access the admin console
3. **Upload Documents**: 
   - Click "Choose file" and select a PDF, TXT, DOC, or DOCX file
   - The document will be automatically processed and indexed
4. **Share Chat Link**: Copy the customer chat link and share it with your customers

### For Customers

1. Visit the chat link provided by the business (e.g., `/chat/[company-id]`)
2. Type questions about the business's documents
3. Receive AI-generated responses based on the uploaded content

## Project Structure

```
chatapp/
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── chat/         # Chat endpoint
│   │   └── documents/    # Document management endpoints
│   ├── admin/            # Admin console pages
│   ├── auth/             # Authentication pages
│   ├── chat/             # Customer chat interface
│   └── page.tsx          # Home page
├── lib/
│   ├── supabase/         # Supabase client configuration
│   ├── chat/             # OpenAI integration
│   └── documents/        # Document processing utilities
├── components/           # Reusable React components
├── uploads/              # Local file storage (gitignored)
└── supabase-schema.sql   # Database schema
```

## How It Works

### Document Processing Pipeline

1. **Upload**: Admin uploads a document via the admin console
2. **Storage**: File is saved locally in the `uploads/` directory
3. **Text Extraction**: Content is extracted using appropriate parser (pdf-parse, mammoth)
4. **Chunking**: Text is split into overlapping chunks (~1000 chars with 200 char overlap)
5. **Embedding**: Each chunk is converted to a vector using OpenAI's embedding model
6. **Storage**: Chunks and embeddings are stored in Supabase

### Chat Flow

1. **Query**: Customer sends a message
2. **Embedding**: Message is converted to a vector embedding
3. **Search**: Vector similarity search finds relevant document chunks
4. **Context**: Top matching chunks are assembled as context
5. **Generation**: GPT-3.5 generates a response using the context
6. **Response**: Answer is sent back to the customer

## Database Schema

- **companies**: Stores company/admin information (extends Supabase auth.users)
- **documents**: Metadata for uploaded documents
- **document_chunks**: Text chunks with vector embeddings
- **chat_sessions**: Chat session tracking
- **chat_messages**: Individual messages in conversations

## Security

- **Authentication**: Supabase handles secure authentication with JWT tokens
- **Row Level Security**: Database policies ensure companies only access their own data
- **File Validation**: Only allowed file types (PDF, TXT, DOC, DOCX) can be uploaded
- **API Protection**: Document management endpoints require authentication

## Customization

### Adjust Chunk Size

Edit `lib/documents/processor.ts`:

```typescript
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200)
```

### Change AI Model

Edit `lib/chat/openai.ts`:

```typescript
model: 'gpt-4' // or 'gpt-3.5-turbo-16k'
```

### Modify Search Parameters

Edit `app/api/chat/route.ts`:

```typescript
match_threshold: 0.7,  // Similarity threshold (0-1)
match_count: 5,        // Number of chunks to retrieve
```

## Troubleshooting

### "Unauthorized" errors
- Ensure you're logged in as an admin
- Check that your Supabase credentials are correct in `.env.local`

### Documents not being found in chat
- Verify the pgvector extension is enabled in Supabase
- Check that embeddings were generated during upload
- Try lowering the `match_threshold` value

### File upload fails
- Ensure the `uploads/` directory exists and is writable
- Check file size limits (default is usually 10MB)
- Verify the file type is supported

## Production Deployment

### Recommended: Vercel + Supabase

1. Push your code to GitHub
2. Import the repository to [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

### Important Production Considerations

- Use Supabase Storage instead of local file storage for scalability
- Enable rate limiting on API routes
- Set up proper error monitoring (e.g., Sentry)
- Configure CORS appropriately
- Use environment-specific Supabase projects

## Cost Considerations

### Supabase
- **Free Tier**: 500MB database, 1GB file storage, 2GB bandwidth
- **Pro Plan**: $25/month for more resources
- Your usage will depend on document volume and chat frequency

### OpenAI API Costs

**Current Pricing (as of Jan 2025):**
- **Embeddings** (text-embedding-ada-002): $0.0001 per 1K tokens
- **Chat** (GPT-3.5 Turbo): $0.0015 per 1K input tokens, $0.002 per 1K output tokens

**Cost Per Document (Processing):**

Assumptions for cost calculations:
- **Small document**: ~2,000 words (3 pages) = ~2,700 tokens = ~3.4 chunks
- **Medium document**: ~5,000 words (7 pages) = ~6,700 tokens = ~8.4 chunks  
- **Large document**: ~10,000 words (15 pages) = ~13,400 tokens = ~16.8 chunks

*Note: Chunks are 1000 characters (~750 tokens) with 200 character overlap*

| Document Size | Tokens | Chunks | Embedding Cost | Estimated Total |
|--------------|--------|--------|----------------|-----------------|
| Small (3 pages) | 2,700 | ~3.4 | $0.00027 | $0.003 - $0.01 |
| Medium (7 pages) | 6,700 | ~8.4 | $0.00067 | $0.007 - $0.02 |
| Large (15 pages) | 13,400 | ~16.8 | $0.00134 | $0.013 - $0.04 |

**Cost Per Chat Query:**
- Query embedding: ~$0.00002 (20 tokens)
- Response generation: ~$0.002 - $0.008 (depends on context and response length)
- **Average per chat**: ~$0.003 - $0.01

**Monthly Cost Estimates:**

*Example: Small business (50 documents, 500 chats/month)*
- Document processing (one-time): 50 docs × $0.01 = **$0.50**
- Monthly chats: 500 × $0.005 = **$2.50/month**

*Example: Medium business (200 documents, 2000 chats/month)*
- Document processing (one-time): 200 docs × $0.02 = **$4.00**
- Monthly chats: 2000 × $0.005 = **$10/month**

💡 **Tip**: The initial document processing is a one-time cost. Ongoing costs are primarily chat queries.

## License

ISC

## Support

For issues or questions, please open an issue on GitHub or contact support.
