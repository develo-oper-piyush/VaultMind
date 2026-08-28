# 🗂️ Drive Project

A modern cloud storage solution that allows users to securely store, manage, and access files from anywhere. Built with Express.js, MongoDB, and Supabase Storage.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

## ✨ Features

-   🔐 **Secure Authentication** - JWT-based user authentication with encrypted passwords
-   📁 **File Upload & Storage** - Upload files securely to Supabase cloud storage
-   👁️ **File Preview** - View uploaded files directly in the browser
-   📥 **File Download** - Download your files anytime
-   ✏️ **Rename Files** - Easily rename your uploaded files
-   🗑️ **Delete Files** - Remove unwanted files from storage
-   🔍 **Smart Semantic Search** - Search files by meaning and content, not just filename (AI-powered with TF-IDF)
-   🏷️ **Auto-Tagging & Categorization** - AI automatically tags and categorizes uploaded files using Claude API
-   📄 **Smart Summaries** - AI-generated 2-3 sentence summaries for text-based files (PDFs, docs, txt)
-   🔎 **Advanced Filters** - Filter files by type, category, tags with sorting options
-   👤 **User Profile** - View account info and change password
-   📊 **Storage Limits** - 12 files per user, 5MB max per file
-   🎨 **Modern UI** - Beautiful dark theme with glassmorphism and smooth animations
-   ⏳ **Real-time Processing Status** - Live indicators showing AI processing progress with auto-refresh
-   🔔 **Toast Notifications** - Real-time feedback for all actions
-   📱 **Responsive Design** - Works on all devices

---

## 🛠️ Tech Stack

### Backend

-   **Node.js** - Runtime environment
-   **Express.js** - Web framework
-   **MongoDB** - Database for user data and file metadata
-   **Mongoose** - MongoDB ODM
-   **JWT** - Authentication tokens
-   **bcrypt** - Password hashing
-   **express-validator** - Input validation
-   **@anthropic-ai/sdk** - Claude API for AI features
-   **pdf-parse** - PDF text extraction
-   **mammoth** - Word document text extraction

### Frontend

-   **EJS** - Templating engine
-   **Tailwind CSS v4** - Styling
-   **Vanilla JavaScript** - Client-side interactions with real-time polling

### Cloud Storage

-   **Supabase Storage** - File storage solution

### AI Features

-   **Claude API (Anthropic)** - AI-powered tagging, categorization, and summarization
-   **TF-IDF Search** - Semantic search using keyword extraction and cosine similarity

---

## 📦 Installation

### Prerequisites

-   Node.js (v16 or higher)
-   MongoDB database
-   Supabase account
-   Anthropic API key (for AI features)

### Steps

1. **Clone the repository**

    ```bash
    git clone https://github.com/develo-oper-piyush/Drive-Project.git
    cd Drive-Project
    ```

2. **Install dependencies**

    ```bash
    npm install
    ```

3. **Create environment file**

    Create a `.env` file in the root directory:

    ```env
    MONGODB_URI=your_mongodb_connection_string
    JWT_SECRET=your_jwt_secret_key
    SUPABASE_URL=your_supabase_project_url
    SUPABASE_KEY=your_supabase_anon_key
    SUPABASE_BUCKET=your_bucket_name
    ANTHROPIC_API_KEY=your_anthropic_api_key
    ```

    **Getting your Anthropic API key:**
    - Sign up at [console.anthropic.com](https://console.anthropic.com)
    - Navigate to API Keys section
    - Create a new API key
    - Copy and paste it into your `.env` file

4. **Run the application**

    ```bash
    node app.js
    ```

5. **Open in browser**
    ```
    http://localhost:3000
    ```

---

## 🔧 Set Environment Variables

---

## 📁 Project Structure

```
Drive/
├── config/
│   ├── db.js               # MongoDB connection
│   └── supabase.js         # Supabase client setup
├── models/
│   ├── user.model.js       # User schema
│   └── file.model.js       # File metadata schema (NEW)
├── routes/
│   ├── index.routes.js     # Main routes (home, upload, delete, search, etc.)
│   └── user.routes.js      # Auth routes (login, register, profile)
├── utils/                  # NEW - AI utilities
│   ├── textExtractor.js    # PDF/Word text extraction
│   ├── aiTagger.js         # AI tagging with Claude API
│   ├── aiSummarizer.js     # AI summarization with Claude API
│   └── searchEngine.js     # TF-IDF semantic search
├── views/
│   ├── home.ejs            # Dashboard with AI features
│   ├── index.ejs           # Landing page
│   ├── login.ejs           # Login page
│   ├── register.ejs        # Register page
│   ├── profile.ejs         # User profile
│   └── error.ejs           # Error page
├── public/                 # Static assets
├── app.js                  # Entry point
├── package.json
└── .env                    # Environment variables (not in repo)
```

---

## 🚀 Deployment

This app can be deployed on **Render.com**:

1. Push code to GitHub
2. Connect repository to Render
3. Set environment variables in Render dashboard
4. Deploy!

---

## 📸 Screenshots

### Landing Page

-   Animated welcome text with fluid cursor effect
-   Modern glassmorphism design

### Dashboard

-   File grid with hover effects
-   Upload, view, rename, and delete functionality
-   Real-time file count display

### Profile Page

-   View account information
-   Change password functionality

---

## 🔒 Security Features

-   Passwords hashed with bcrypt (10 salt rounds)
-   JWT tokens stored in HTTP-only cookies
-   Input validation on all forms
-   File type and size restrictions
-   User-specific file isolation

---

## 📝 API Routes

### Authentication

| Method | Route                   | Description       |
| ------ | ----------------------- | ----------------- |
| GET    | `/user/register`        | Registration page |
| POST   | `/user/register`        | Create new user   |
| GET    | `/user/login`           | Login page        |
| POST   | `/user/login`           | Authenticate user |
| GET    | `/user/logout`          | Logout user       |
| GET    | `/user/profile`         | Profile page      |
| POST   | `/user/change-password` | Update password   |

### File Operations

| Method | Route                      | Description                    |
| ------ | -------------------------- | ------------------------------ |
| GET    | `/home`                    | Dashboard with files           |
| POST   | `/upload-file`             | Upload a file                  |
| POST   | `/delete-file`             | Delete a file                  |
| POST   | `/rename-file`             | Rename a file                  |
| GET    | `/secure-file/:fileName`   | Securely serve a file          |
| GET    | `/view-file/:fileName`     | View file with signed URL      |

### AI-Powered Features (NEW)

| Method | Route                        | Description                                |
| ------ | ---------------------------- | ------------------------------------------ |
| POST   | `/search`                    | Semantic search files by meaning/content   |
| GET    | `/api/file-status/:fileId`   | Poll AI processing status for a file       |

---

## 🤖 AI Features Explained

### 1. **Semantic Search**
When you search for files, the system doesn't just match filenames. It understands the **meaning** of your query and searches through:
- File content (extracted text from PDFs, Word docs, txt files)
- Auto-generated tags
- File categories
- Keywords

**Example:** Searching for "invoice from last month" will find relevant invoice files even if the filename doesn't contain those exact words.

**Technical Details:**
- Uses TF-IDF (Term Frequency-Inverse Document Frequency) algorithm
- Computes cosine similarity between search query and file content
- Boosts results for filename matches
- Real-time search with skeleton loaders

### 2. **Auto-Tagging & Categorization**
When you upload a file, Claude AI automatically:
- Generates 3-5 relevant tags based on content and context
- Assigns a category (Invoice, Resume, Contract, Photo, Screenshot, Report, Presentation, Spreadsheet, Document, Video, Audio, Other)
- Processes in the background without blocking the upload

**Technical Details:**
- Uses Claude 3.5 Sonnet API
- Analyzes filename, file type, and first 500 characters of content
- Falls back to mimetype-based categorization if AI fails
- Tags displayed as pills/badges on file cards
- Filter files by category alongside existing type filters

### 3. **Smart Summaries**
For text-based files (PDFs, Word docs, plain text), Claude AI generates a concise 2-3 sentence summary that appears:
- As a tooltip when hovering over the info icon
- Helps you quickly understand file contents without opening

**Technical Details:**
- Uses Claude 3.5 Sonnet API
- Analyzes first 2000 characters (or full content for small files)
- Focuses on main points and purpose
- Skips gracefully for images/videos/audio files
- Displayed in glassmorphism tooltip matching your dark theme

### Background Processing
All AI operations happen asynchronously:
1. File uploads complete immediately
2. AI processing (text extraction → tagging → summarization) happens in the background
3. Real-time status indicators show "⏳ Processing..." badge
4. Page auto-refreshes when processing completes (polls every 3 seconds)
5. Partial failures handled gracefully - upload never fails due to AI errors

---

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👨‍💻 Author

**Piyush Chaudhary**

-   GitHub: [@develo-oper-piyush](https://github.com/develo-oper-piyush)

---

⭐ **Star this repo if you found it helpful!**