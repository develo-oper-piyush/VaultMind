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
- 💬 **Ask VaultMind RAG Assistant** - Grounded document Q&A engine with sliding-window chunking, keyword extraction, and cited evidence references.
- 🖼️ **Multi-Layout Photo Gallery** - Switch seamlessly between **5 distinct responsive gallery layouts**:
  - **Pinterest Masonry Grid**: Waterfall columns naturally honoring native aspect ratios (9:16, 16:9, 1:1).
  - **Square Feed Grid**: Uniform square feed (Instagram & Unsplash style) with rapid hover zoom.
  - **Cinema Spotlight & Filmstrip**: Full-screen stage focus with ambient glow backdrop, keyboard navigation (`←` / `→`), and an interactive thumbnail filmstrip rail.
  - **Editorial Magazine Mosaic**: Dynamic composition with alternating 2x2 hero cards and responsive grid spans.
  - **3D Depth Deck**: Fluid 3D perspective deck with spatial physics and gestures.
- 🎨 **Built-in Photo Studio (Visual Editor)**:
  - **Freehand Drawing**: Dual-mode pen brush and eraser on an isolated drawing buffer with palette selection and stroke width sliders.
  - **Draggable Text Captions**: Place custom text annotations anywhere on the canvas with color and font size controls.
  - **Fine Property Adjustments**: Real-time hardware-accelerated sliders for Brightness, Contrast, Saturation, Soft Blur, Sepia, Grayscale, and Hue Rotation.
  - **Built-in & Custom Presets**: Apply instant aesthetic profiles (Vivid, Sunset, Noir, Cyberpunk, Vintage, Dramatic) or create and persist up to **3 custom user presets**.
  - **Direct Drive Save**: Merge filters, brush marks, and captions into an uncompressed PNG and save a copy directly into your VaultMind Drive.
- 🔗 **Secure Shareable Links (`/share/:token`)** - Generate unguessable 128-bit cryptographic links with custom expiration times, optional 6-digit PIN / password protection, view count limits, and direct download toggles.
- 📄 **Quota-Optimized OCR Intelligence** - Extract printed and handwritten text from images using `gemini-3.5-flash-lite`, permanently cached in MongoDB (0 API calls on repeat visits) and indexed into Ask VaultMind.
- ♻️ **Recycle Bin & Soft Deletion** - 30-day retention countdown, file restore with collision resolution, and permanent purge.
- 🕒 **Immutable Version History** - Automatic version tracking across file renames and uploads with size delta calculation and one-click rollback.
- ⏱️ **Debounced Search Filter** - Real-time delay searching that buffers user keystrokes for high-efficiency querying.
- 🛡️ **Rate Limiting & Security** - Brute-force protection on authentication and password-protected share links using `express-rate-limit`.
- 🎨 **WebGL PixelBlast Background** - Interactive Three.js particle canvas background on the landing page.
- 🌓 **Persistent Dark Mode** - Default Dark mode theme with instant toggle switching preserved in `localStorage`.

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
- **Security & Rate Limiting**: `express-rate-limit`, `bcrypt`, `jsonwebtoken`
- **Parsers**: `pdf-parse` (PDFs) & `mammoth` (Word Documents)

---

## 📁 Project Structure

```
VaultMind/
├── Frontend/                 # Next.js 15 Frontend (Port 3001)
│   ├── app/                  # App Router pages (Home, Dashboard, Photos, Profile, Share, Login, Register)
│   ├── components/           # UI Components (FileCard, PhotoEditorModal, ShareModal, OcrModal, DepthCarousel, PixelBlast)
│   ├── contexts/             # AuthContext & ThemeContext
│   ├── lib/                  # API client & utility helpers
│   ├── tests/                # Frontend integration & logic test suite
│   └── package.json
│
└── Backend/                  # Express.js REST API (Port 3000)
    ├── config/               # MongoDB, Supabase, and RAG configuration
    ├── middlewares/          # JWT auth & rate limiters
    ├── models/               # User, File, Share, Version, and Chunk schemas
    ├── routes/               # REST API endpoints (/files, /user, /chat, /share)
    ├── services/             # Duplicate, OCR, Share, and Version services
    ├── utils/                # AI Tagger, AI Summarizer, Text Extractor, RAG retrieval
    ├── tests/                # Comprehensive unit & integration tests
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

## 📝 API Endpoints

### User & Authentication

| Method | Endpoint                | Description                                         |
| :----- | :---------------------- | :-------------------------------------------------- |
| `POST` | `/user/register`        | Register a new user account                         |
| `POST` | `/user/login`           | Authenticate user with rate limiting (5 attempts/15m) |
| `GET`  | `/user/logout`          | Clear user session cookie                           |
| `GET`  | `/user/profile`         | Fetch authenticated profile details                 |
| `POST` | `/user/change-password` | Update account password                             |

### File & Storage Management

| Method   | Endpoint                             | Description                                         |
| :------- | :----------------------------------- | :-------------------------------------------------- |
| `GET`    | `/files`                             | List all active workspace files                     |
| `POST`   | `/files/upload`                      | Upload a file to Supabase & trigger AI pipeline     |
| `DELETE` | `/files/delete/:fileName`            | Soft-delete file to Recycle Bin                     |
| `GET`    | `/files/secure-file/:fileName`       | Stream secure file inline with authentication       |
| `POST`   | `/files/rename-file`                 | Rename file and update version history              |
| `GET`    | `/files/:fileId/ocr`                 | Extract or fetch cached OCR text intelligence       |
| `POST`   | `/files/check-duplicate`             | Pre-upload duplicate detection and collision check  |

### Secure Share Links

| Method   | Endpoint                    | Description                                         |
| :------- | :-------------------------- | :-------------------------------------------------- |
| `POST`   | `/api/share/create`         | Create revocable link with expiry & optional PIN    |
| `GET`    | `/api/share/file/:fileId`   | List active share links for a file                  |
| `DELETE` | `/api/share/:token`         | Instantly revoke an active share link               |
| `GET`    | `/api/share/view/:token`    | Public view endpoint with PIN lock verification     |
| `GET`    | `/api/share/download/:token`| Public direct download endpoint                     |

---

## 🚀 Future Scope & Roadmap

- 📉 **Automatic Client-Side Image Compression**:
  - Implement browser-level canvas compression (`image/webp` and high-efficiency `.jpeg` at 85% quality) prior to uploading, reducing 15MB photos to ~900KB with zero visible fidelity loss.
  - Maximizes user storage headroom without consuming cloud bucket limits or exhausting backend memory.
- 📊 **Dynamic Capacity-Based Vault Quotas**:
  - Transition from fixed file-count limits to a flexible storage volume capacity bar (e.g., 50MB–100MB per user vault).
- 🏷️ **User Subscription Tiers (Free vs. Pro)**:
  - Role-based quota allocation allowing verified or upgraded accounts higher upload thresholds and custom API allowances.
- ⚡ **Direct-to-Storage Presigned Uploads**:
  - Stream large files directly from the browser to cloud bucket storage, eliminating server-side buffering.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).

---

## 👨‍💻 Author

**Piyush Chaudhary**

- GitHub: [@develo-oper-piyush](https://github.com/develo-oper-piyush)
