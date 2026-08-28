# 🌌 VaultMind - Next-Gen AI-Powered Cloud Storage

> An intelligent, high-performance cloud storage and document workspace. Built with **Next.js 15**, **React 19**, **Express.js**, **MongoDB**, **Supabase Storage**, **Google Gemini AI**, and **Lenis Smooth Scroll**.

![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Google Gemini AI](https://img.shields.io/badge/Google_Gemini_AI-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)

---

## ✨ Features

- 🧠 **Google Gemini AI Engine** - Automated document categorization, smart multi-tag generation, and instant 2-3 sentence summarization with automated model fallback chains (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`).
- 🎨 **WebGL PixelBlast Background** - Interactive Three.js particle canvas background on the landing page.
- 🖼️ **Parallax File Cards** - Dedicated card design with image hover zoom, themed HSL glow shadows, and dynamic gradient overlays.
- 📜 **Lenis Smooth Scroll** - Inertia-based smooth scrolling across all pages.
- 🌓 **Persistent Dark Mode** - Default Dark mode theme with instant toggle switching preserved in `localStorage`.
- 🗂️ **DaisyUI Dropdown Controls** - Sleek interactive filter dropdown buttons for File Types, Categories, Sort Ordering, and Card Actions.
- 💀 **ShadCN Skeleton UI** - Loading placeholders for perceived performance while fetching files or processing uploads.
- 🔍 **TF-IDF Semantic Search** - Natural language search matching file content, tags, categories, and names.
- 🔒 **Secure Auth & Cloud Storage** - JWT session authentication with HTTP-only cookies, password hashing (bcrypt), and Supabase Storage integration.
- 🔤 **Radix UI Iconography** - Minimalist vector iconography across all workspace interfaces.

---

## 🛠️ Tech Stack

### Frontend (`/Frontend`)
- **Framework**: Next.js 15 (App Router) & React 19
- **Styling**: Tailwind CSS v4, OKLCH Design Tokens, DaisyUI v5
- **3D Graphics & Canvas**: Three.js & Postprocessing (`PixelBlast`)
- **Scroll Engine**: Lenis (`lenis/react`)
- **Icons**: Radix UI Icons (`@radix-ui/react-icons`)
- **Language**: TypeScript

### Backend (`/Backend`)
- **Runtime**: Node.js & Express.js REST API
- **Database**: MongoDB Atlas & Mongoose ODM
- **Cloud Bucket**: Supabase Storage
- **AI Processing**: Google Generative AI SDK (`@google/genai` / `@google/generative-ai`)
- **Parsers**: `pdf-parse` (PDFs) & `mammoth` (Word Documents)
- **Auth**: JWT & bcrypt

---

## 📁 Project Structure

```
Drive-Project/
├── Frontend/                 # Next.js 15 Frontend (Port 3001)
│   ├── app/                  # App Router pages (Home, Dashboard, Profile, Login, Register)
│   ├── components/           # UI Components (FileCard, PixelBlast, ThemeToggle, Skeleton, SmoothScroll)
│   ├── contexts/             # AuthContext & ThemeContext
│   ├── lib/                  # API client & utility helpers
│   ├── public/               # Static assets
│   └── package.json
│
└── Backend/                  # Express.js REST API (Port 3000)
    ├── config/               # MongoDB & Supabase initialization (with DNS SRV resolution fixes)
    ├── middlewares/          # JWT authentication middleware
    ├── models/               # User & File Mongoose schemas
    ├── routes/               # REST API endpoints (/files, /user, /api)
    ├── utils/                # AI Tagger, AI Summarizer, Text Extractor, TF-IDF Search Engine
    ├── app.js                # Server entry point
    └── package.json
```

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v18+)
- MongoDB connection string (MongoDB Atlas)
- Supabase project URL & Service Role Key
- Google Gemini API key ([Get Free Key](https://aistudio.google.com/app/apikey))

### 1. Backend Setup

```bash
cd Backend
npm install
```

Create a `.env` file in `Backend/`:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/drive-db
JWT_SECRET=your_jwt_secret_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key
SUPABASE_BUCKET=Files-upload
GEMINI_API_KEY=your_gemini_api_key
CLIENT_URL=http://localhost:3001
```

Start the backend server:
```bash
npm run dev
```

### 2. Frontend Setup

Open a new terminal window:

```bash
cd Frontend
npm install
npm run dev -- -p 3001
```

Open **`http://localhost:3001`** in your browser!

---

## 🌐 Deployment (Vercel & Render)

Both **Frontend** and **Backend** can be deployed from this single repository by configuring the **Root Directory** setting:

### 1. Frontend to **Vercel**
- Connect your GitHub repository to Vercel.
- Set **Root Directory** to `Frontend`.
- Set Environment Variable: `NEXT_PUBLIC_API_URL` = `https://your-backend.onrender.com`

### 2. Backend to **Render**
- Create a new **Web Service** on Render connected to your repository.
- Set **Root Directory** to `Backend`.
- Set **Build Command**: `npm install`
- Set **Start Command**: `node app.js`
- Add environment variables (`MONGODB_URI`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, `GEMINI_API_KEY`, `CLIENT_URL`).

---

## 📝 API Endpoints

### User & Authentication

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/user/register` | Register a new user account |
| `POST` | `/user/login` | Authenticate user & receive JWT token |
| `GET` | `/user/logout` | Clear user session cookie |
| `GET` | `/user/profile` | Fetch authenticated profile details |
| `POST` | `/user/change-password` | Update account password |

### File & Storage Management

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/files` | List all files for the authenticated user |
| `POST` | `/files/upload` | Upload a file to Supabase & trigger AI pipeline |
| `DELETE` | `/files/delete/:fileName` | Delete file from Supabase & database |
| `GET` | `/files/secure-file/:fileName` | Stream secure file inline with authentication |
| `GET` | `/files/file-status/:fileId` | Poll background AI processing status |

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).

---

## 👨‍💻 Author

**Piyush Chaudhary**
- GitHub: [@develo-oper-piyush](https://github.com/develo-oper-piyush)