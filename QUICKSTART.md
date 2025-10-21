# Quick Start Guide

## 1. Setup Supabase (5 minutes)

### Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name**: ChatApp
   - **Database Password**: (create a strong password)
   - **Region**: Choose closest to you
4. Wait for the project to be created (~2 minutes)

### Get Your API Keys
1. Go to **Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...`)

### Run the Database Schema
1. Go to **SQL Editor** (left sidebar)
2. Click "New Query"
3. Copy the entire contents of `supabase-schema.sql` file
4. Paste it into the query editor
5. Click "Run" or press Cmd/Ctrl + Enter
6. You should see "Success. No rows returned"

## 2. Setup OpenAI (2 minutes)

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or login
3. Navigate to **API Keys** section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-...`)
6. **Important**: You need to add credits to your OpenAI account

## 3. Configure Environment Variables

1. Open `.env.local` in the project root
2. Replace the placeholders with your actual values:

```bash
# Supabase (from step 1)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# OpenAI (from step 2)
OPENAI_API_KEY=sk-...
```

## 4. Run the Application

```bash
# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 5. Test the Application

### Test Admin Console
1. Click "Admin Login"
2. Click "Sign up" 
3. Create an account:
   - **Company Name**: Test Company
   - **Email**: test@example.com
   - **Password**: password123
4. You should be redirected to the admin console
5. Upload a test document (PDF, TXT, DOC, or DOCX)
6. Wait for it to process (~10-30 seconds depending on file size)
7. Copy the "Customer Chat Link" from the bottom of the page

### Test Customer Chat
1. Open the customer chat link in a new browser tab
2. Ask a question about your uploaded document
3. The AI should respond with information from the document

## Common Issues

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Supabase connection errors
- Double-check your environment variables
- Make sure the SQL schema was run successfully
- Verify your project is active in the Supabase dashboard

### OpenAI errors
- Ensure you have credits in your OpenAI account
- Verify your API key is correct
- Check you didn't include extra spaces in the `.env.local` file

### File upload fails
```bash
mkdir uploads
chmod 755 uploads
```

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Customize the UI in the `app/` directory
- Adjust AI parameters in `lib/chat/openai.ts`
- Deploy to production (see README.md)

## Need Help?

- Check the [README.md](README.md) for troubleshooting
- Review the Supabase logs in the dashboard
- Check browser console for errors (F12)
