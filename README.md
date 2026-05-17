<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Gemini_API-1.5_Flash-orange?style=for-the-badge" alt="Gemini API">
  <img src="https://img.shields.io/badge/Frontend-HTML/CSS/JS-yellow?style=for-the-badge" alt="Frontend">
</div>

<br>

<div align="center">
  <h1>🚀 Study Buddy RAG</h1>
  <p><b>A futuristic, high-performance RAG-based PDF question-answering AI assistant.</b></p>
  <p>Built for college AI hackathons and RAG competitions, this application turns any syllabus, textbook, or lecture notes into an interactive learning hub using Google's Gemini API.</p>
</div>

---

## 🌟 Overview

**Study Buddy RAG** is an intelligent web application designed to help students accelerate their learning. By uploading study materials (PDFs), the AI extracts text, intelligently chunks it, and uses **Retrieval-Augmented Generation (RAG)** to provide highly accurate, citation-backed answers.

It strictly adheres to an anti-hallucination prompt architecture: if the answer is not in the uploaded document, it will explicitly state that the answer is unavailable, making it a perfectly reliable tool for exam preparation.

---

## ✨ Features

- **📄 Multi-PDF Ingestion**: Drag & drop multiple textbooks, notes, and previous year papers using robust PDF.js parsing.
- **🧠 Advanced RAG Engine**: Intelligent text chunking, overlap preservation, and cosine similarity vector retrieval.
- **⚡ Google Gemini Powered**: Integrates `gemini-1.5-flash` with automatic fallback logic and high-speed streaming generation.
- **🛡️ Hallucination Prevention**: Strictly limits AI answers to the context found inside the uploaded documents.
- **🎓 AI Exam Predictor**: Automatically generate unit-wise questions, MCQs, Viva questions, and Long/Short answer predictions from your syllabus.
- **🎯 Smart Revision Hub**: Generate instant study summaries and test your knowledge with dynamic interactive revision quizzes.
- **🎙️ Voice Integration**: Features Speech-to-Text (Ask questions via mic) and Text-to-Speech (AI reads answers out loud).
- **🎨 Premium Cyberpunk UI**: Built with modern Glassmorphism, animated neon glows, dynamic particles, and dark mode aesthetics.

---

## 🛠️ Tech Stack

- **Frontend**: Pure HTML5, Vanilla JavaScript (ES6+), Vanilla CSS3
- **Document Processing**: `PDF.js`
- **LLM Integration**: Google Gemini API (`gemini-1.5-flash` and `gemini-2.0-flash`)
- **Icons & Styling**: FontAwesome 6, Google Fonts (Orbitron, Inter)
- **Markdown Parsing**: `marked.js`
- **Syntax Highlighting**: `Prism.js`



---

## 📸 Screenshots

*(Add your screenshots here before submitting to a competition!)*

- **Dashboard & RAG Chat**: `![Dashboard](path-to-image)`
- **PDF Manager**: `![Upload](path-to-image)`
- **Exam Predictor**: `![Exam Prep](path-to-image)`

---

## 🚀 Installation & Setup

Since this application is primarily a highly optimized client-side application, you don't need complex Node.js or Python environments to run the core UI.

### Prerequisites
- A modern web browser (Chrome, Edge, Firefox, Safari)
- A local web server (Python `http.server` or VS Code Live Server extension)
- A **Google Gemini API Key** (Get one free at [Google AI Studio](https://aistudio.google.com/))

### Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/krishna-sahu-28/Study-Buddy-RAG.git
   cd Study-Buddy-RAG
   ```

2. **Add Your API Key**:
   Open `app.js` and locate the secure configuration variable at the top of the file:
   ```javascript
   const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
   ```
   *Note: Never commit your actual API key to GitHub. The `.gitignore` file is configured to help prevent accidental secret commits, but you should always be careful.*

3. **Serve the Application**:
   Using Python's built-in server (recommended):
   ```bash
   python -m http.server 8000
   ```
   *Alternatively, use the "Live Server" extension in VS Code.*

4. **Open in Browser**:
   Navigate to `http://localhost:8000`

---

## 📁 Repository Structure

```text
Study-Buddy-RAG/
├── index.html          # Main application interface
├── style.css           # Premium Cyberpunk UI styling
├── app.js              # Core logic, RAG engine, Gemini API integration
├── .gitignore          # Git exclusion rules
└── README.md           # Project documentation
```

---

## 🔮 Future Improvements

- [ ] Transition client-side RAG engine to a Python backend using **LangChain** and **FAISS**.
- [ ] Add support for `.docx`, `.pptx`, and image OCR (`Tesseract`).
- [ ] Implement user authentication and cloud vector database storage (`Pinecone` or `ChromaDB`).
- [ ] Add conversation branching and multi-session memory.

---

<div align="center">
  <b>Built with ❤️ by Krishna Sahu</b>
</div>
