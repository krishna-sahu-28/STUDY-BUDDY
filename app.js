/**
 * Study Buddy RAG - Main Application Controller
 * Fully client-side processing, high-fidelity animations, and intelligent retrieval.
 */

// ============================================
// SECURE API KEY CONFIGURATION
// Never expose this in the frontend UI.
// ============================================
const GEMINI_API_KEY = "AIzaSyC5ZntQ93fKqk8-qkfUJOdy91v4O22BxN4";

// Helper to resolve active API Key (priority to user's custom key, otherwise demo key)
function getActiveApiKey() {
  const custom = localStorage.getItem('study_buddy_custom_key');
  if (custom && custom.trim().length > 0) {
    return custom.trim();
  }
  return GEMINI_API_KEY;
}

// Safe Markdown renderer - graceful fallback if CDN fails
function renderMarkdown(text) {
  if (typeof marked !== 'undefined' && marked.parse) {
    return marked.parse(text);
  }
  // Fallback: basic HTML escaping and line breaks
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// Safe Prism highlighter - no-op if CDN fails
function safeHighlight(element) {
  if (typeof Prism !== 'undefined' && Prism.highlightAllUnder) {
    try { Prism.highlightAllUnder(element); } catch(e) {}
  }
}

// Premium Toast Notification System (replaces all alert() popups)
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const icons = { info: 'fa-circle-info', success: 'fa-circle-check', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark' };
  const colors = { info: '#0ea5e9', success: '#10b981', warn: '#eab308', error: '#ec4899' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:rgba(13,13,29,0.95);backdrop-filter:blur(16px);border:1px solid ${colors[type]}44;border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:12px;color:#f8fafc;font-size:13px;font-family:'Inter',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 15px ${colors[type]}33;pointer-events:auto;animation:toastIn 0.35s cubic-bezier(0.4,0,0.2,1);max-width:380px;line-height:1.5;`;
  toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="font-size:18px;color:${colors[type]};filter:drop-shadow(0 0 6px ${colors[type]});flex-shrink:0;"></i><span>${message}</span>`;
  container.appendChild(toast);
  // Auto-dismiss
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Inject toast animation keyframes
(function() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes toastIn { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }
    @keyframes toastOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(40px); } }
  `;
  document.head.appendChild(style);
})();

// Global App State
const state = {
  apiKey: getActiveApiKey(),
  documents: [], // List of { name, text, pages: [ { pageNum, text } ], size, totalPages }
  chunks: [], // List of { text, docName, pageNum, id }
  chatHistory: [],
  ragEngine: null,
  speechRate: parseFloat(localStorage.getItem('study_buddy_speech_rate')) || 1.0,
  chunkSize: parseInt(localStorage.getItem('study_buddy_chunk_size')) || 800,
  chunkOverlap: parseInt(localStorage.getItem('study_buddy_chunk_overlap')) || 200,
  topK: parseInt(localStorage.getItem('study_buddy_top_k')) || 4,
  isRecording: false,
  recognition: null,
  activeView: 'dashboard',
  quizData: [],
  currentQuizIndex: 0,
  quizScore: 0,
  quizAnswers: [], // stores user selections
  stats: {
    questionsAsked: parseInt(localStorage.getItem('study_buddy_stats_q')) || 0,
    streak: parseInt(localStorage.getItem('study_buddy_stats_streak')) || 1
  }
};

// Custom Stop Words list to optimize TF-IDF search accuracy
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
  'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
  'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into',
  'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shant',
  'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were',
  'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why',
  'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself',
  'yourselves'
]);

// Helper: Tokenize text
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

// ----------------------------------------------------
// CLIENT-SIDE TF-IDF COSINE SIMILARITY RAG ENGINE
// ----------------------------------------------------
class ClientRAGEngine {
  constructor() {
    this.chunks = []; // list of { text, docName, pageNum }
    this.vocab = new Set();
    this.docFreqs = {}; // term -> number of chunks containing term
    this.chunkTFs = []; // term counts per chunk
  }

  addChunks(newChunks) {
    this.chunks.push(...newChunks);
    this.reindex();
  }

  reindex() {
    this.vocab.clear();
    this.docFreqs = {};
    this.chunkTFs = [];
    const N = this.chunks.length;
    if (N === 0) return;

    // Calculate TFs and DFs
    for (let i = 0; i < N; i++) {
      const tokens = tokenize(this.chunks[i].text);
      const tf = {};
      const uniqueInChunk = new Set();

      for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1;
        this.vocab.add(token);
        uniqueInChunk.add(token);
      }

      this.chunkTFs.push(tf);

      for (const token of uniqueInChunk) {
        this.docFreqs[token] = (this.docFreqs[token] || 0) + 1;
      }
    }
  }

  retrieve(query, k = 4) {
    const N = this.chunks.length;
    if (N === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Construct Query Vector Weight map
    const queryTF = {};
    for (const token of queryTokens) {
      queryTF[token] = (queryTF[token] || 0) + 1;
    }

    const queryWeights = {};
    let queryLengthSq = 0;

    for (const token of Object.keys(queryTF)) {
      if (this.vocab.has(token)) {
        const tf = queryTF[token];
        const df = this.docFreqs[token] || 0;
        // Smoothed IDF
        const idf = Math.log(1 + N / (df + 1)) + 1;
        const weight = tf * idf;
        queryWeights[token] = weight;
        queryLengthSq += weight * weight;
      }
    }
    const queryLength = Math.sqrt(queryLengthSq);
    if (queryLength === 0) return [];

    // Score chunks using Cosine Similarity
    const scores = [];
    for (let i = 0; i < N; i++) {
      const tf = this.chunkTFs[i];
      let dotProduct = 0;
      let docLengthSq = 0;

      for (const token of Object.keys(tf)) {
        const df = this.docFreqs[token] || 0;
        const idf = Math.log(1 + N / (df + 1)) + 1;
        const weight = tf[token] * idf;
        docLengthSq += weight * weight;

        if (queryWeights[token]) {
          dotProduct += queryWeights[token] * weight;
        }
      }

      const docLength = Math.sqrt(docLengthSq);
      let similarity = 0;
      if (queryLength > 0 && docLength > 0) {
        similarity = dotProduct / (queryLength * docLength);
      }

      scores.push({
        chunk: this.chunks[i],
        score: similarity
      });
    }

    // Sort by descending similarity score
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

// ----------------------------------------------------
// HIGH-FIDELITY INTERACTIVE BACKGROUND PARTICLES
// ----------------------------------------------------
function initParticlesBackground() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let particlesArray = [];
  const colors = ['#8b5cf6', '#0ea5e9', '#ec4899', '#10b981'];

  function setSize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  setSize();
  window.addEventListener('resize', setSize);

  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 1;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.alpha = Math.random() * 0.5 + 0.1;
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
      if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }

    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.fill();
      ctx.restore();
    }
  }

  function init() {
    particlesArray = [];
    const count = Math.min(60, Math.floor((canvas.width * canvas.height) / 22000));
    for (let i = 0; i < count; i++) {
      particlesArray.push(new Particle());
    }
  }
  init();
  window.addEventListener('resize', init);

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw connections (neural net constellation effect)
    for (let i = 0; i < particlesArray.length; i++) {
      for (let j = i + 1; j < particlesArray.length; j++) {
        const dx = particlesArray[i].x - particlesArray[j].x;
        const dy = particlesArray[i].y - particlesArray[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(139, 92, 246, ${0.12 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particlesArray[i].x, particlesArray[i].y);
          ctx.lineTo(particlesArray[j].x, particlesArray[j].y);
          ctx.stroke();
        }
      }
    }

    particlesArray.forEach(p => {
      p.update();
      p.draw();
    });

    requestAnimationFrame(animate);
  }
  animate();
}

// ----------------------------------------------------
// RESPONSIVE SIDEBAR NAVIGATION CONTROLS
// ----------------------------------------------------
function initSidebarController() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const toggleIcon = toggleBtn.querySelector('i');
  const menuItems = document.querySelectorAll('.menu-item');
  const sections = document.querySelectorAll('.view-section');

  // Collapse/Expand toggling
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
      toggleIcon.className = 'fa-solid fa-angle-right';
    } else {
      toggleIcon.className = 'fa-solid fa-angle-left';
    }
  });

  // Tab switching
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      state.activeView = view;
      
      // Update sidebar visual indicator
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      // Swap view section visibility
      sections.forEach(sec => sec.classList.remove('active'));
      document.getElementById(`view-${view}`).classList.add('active');

      // Trigger analytics bar layout recalculations if visible
      if (view === 'analytics') {
        renderKnowledgeChart();
      }
    });
  });

  // Welcome Screen Activate PDF Manager shortcut
  const activateUploadBtn = document.getElementById('activate-upload-btn');
  if (activateUploadBtn) {
    activateUploadBtn.addEventListener('click', () => {
      document.getElementById('nav-upload').click();
    });
  }
}

// ----------------------------------------------------
// PDF INGESTION & TEXT CHUNKING ENGINE (PDF.js)
// ----------------------------------------------------
function initPDFUploader() {
  const dragZone = document.getElementById('pdf-drag-zone');
  const fileInput = document.getElementById('pdf-file-input');
  const scannerBar = document.getElementById('drag-scanner');
  const filesQueue = document.getElementById('uploaded-files-queue');

  // Trigger browser dialog click
  dragZone.addEventListener('click', () => fileInput.click());

  // Prevent defaults on drag states
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evtName => {
    dragZone.addEventListener(evtName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // Visual glows on hover drag
  dragZone.addEventListener('dragover', () => dragZone.classList.add('dragover'));
  dragZone.addEventListener('dragleave', () => dragZone.classList.remove('dragover'));
  
  dragZone.addEventListener('drop', (e) => {
    dragZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processFiles(files);
    }
  });

  async function processFiles(files) {
    scannerBar.style.display = 'block';
    
    for (const file of files) {
      if (file.type !== 'application/pdf') {
        alert(`File "${file.name}" is not a valid PDF.`);
        continue;
      }
      
      // Create file processing card indicator
      const fileCardId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      
      const fileHTML = `
        <div class="file-card" id="${fileCardId}">
          <i class="fa-solid fa-file-pdf file-icon"></i>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
              <span id="${fileCardId}-size">${sizeMB} MB</span>
              <span id="${fileCardId}-status" style="color: var(--neon-blue);">Reading...</span>
            </div>
          </div>
          <div class="file-progress-bar" id="${fileCardId}-progress"></div>
          <button class="file-remove" id="${fileCardId}-remove" style="display:none;"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;
      filesQueue.insertAdjacentHTML('beforeend', fileHTML);
      
      try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const docTextObj = await extractTextFromPDF(arrayBuffer, fileCardId);
        
        // Save parsed document
        const parsedDoc = {
          id: fileCardId,
          name: file.name,
          pages: docTextObj.pages,
          totalPages: docTextObj.totalPages,
          size: sizeMB,
          text: docTextObj.fullText
        };
        
        state.documents.push(parsedDoc);
        
        // Generate chunk models from the document text
        chunkAndIndexDocument(parsedDoc);
        
        // Visual success callback
        document.getElementById(`${fileCardId}-status`).innerText = `${docTextObj.totalPages} Pages parsed`;
        document.getElementById(`${fileCardId}-status`).style.color = 'var(--neon-green)';
        const removeBtn = document.getElementById(`${fileCardId}-remove`);
        removeBtn.style.display = 'block';
        removeBtn.addEventListener('click', () => removeDocument(fileCardId));

        // Update overall stats counters
        updateAppStats();
        
      } catch (err) {
        console.error(err);
        document.getElementById(`${fileCardId}-status`).innerText = `Scan Error`;
        document.getElementById(`${fileCardId}-status`).style.color = 'var(--neon-pink)';
      }
    }
    
    scannerBar.style.display = 'none';
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function extractTextFromPDF(arrayBuffer, fileCardId) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const pages = [];
    let fullText = '';
    
    const progressFill = document.getElementById(`${fileCardId}-progress`);
    const statusText = document.getElementById(`${fileCardId}-status`);
    
    for (let pNum = 1; pNum <= totalPages; pNum++) {
      const page = await pdf.getPage(pNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      
      pages.push({ pageNum: pNum, text: pageText });
      fullText += pageText + ' ';
      
      // Update processing ratio
      const pct = Math.round((pNum / totalPages) * 100);
      progressFill.style.width = `${pct}%`;
      statusText.innerText = `Scanning: ${pct}%`;
    }
    
    return { pages, totalPages, fullText };
  }
}

// ----------------------------------------------------
// SMART OVERLAPPING CHUNKER & VECTOR INDEXER
// ----------------------------------------------------
function chunkAndIndexDocument(doc) {
  const size = state.chunkSize;
  const overlap = state.chunkOverlap;
  const newChunks = [];

  // Iterate over extracted pages to ensure precise page reference citations!
  doc.pages.forEach(p => {
    const text = p.text;
    if (text.trim().length === 0) return;

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + size, text.length);
      const chunkText = text.substring(start, end);
      
      newChunks.push({
        text: chunkText,
        docName: doc.name,
        pageNum: p.pageNum,
        id: `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
      });

      start += (size - overlap);
      if (start >= text.length || size <= overlap) break;
    }
  });

  state.chunks.push(...newChunks);
  
  // Initialize RAG Engine on demand
  if (!state.ragEngine) {
    state.ragEngine = new ClientRAGEngine();
  }
  state.ragEngine.addChunks(newChunks);
  
  console.log(`Document "${doc.name}" successfully chunked into ${newChunks.length} segments. Total indexed chunks: ${state.chunks.length}`);
}

function removeDocument(id) {
  const card = document.getElementById(id);
  if (card) card.remove();

  // Filter out doc
  state.documents = state.documents.filter(d => d.id !== id);
  
  // Re-generate vector store index with remaining documents
  state.chunks = [];
  state.ragEngine = null;
  
  state.documents.forEach(doc => {
    chunkAndIndexDocument(doc);
  });

  updateAppStats();
}

function updateAppStats() {
  const landing = document.getElementById('landing-experience');
  const workspace = document.getElementById('rag-workspace');
  const statusDot = document.getElementById('rag-status-dot');
  const statusText = document.getElementById('rag-status-text');

  const count = state.documents.length;
  const totalPages = state.documents.reduce((acc, d) => acc + d.totalPages, 0);

  // Switch UI mode based on files loaded
  if (count > 0) {
    if (landing) landing.style.display = 'none';
    if (workspace) workspace.style.display = 'flex';
    statusDot.classList.remove('inactive');
    statusText.innerText = `RAG Active • ${count} Document${count > 1 ? 's' : ''} (${totalPages} Pages)`;
  } else {
    if (landing) landing.style.display = 'flex';
    if (workspace) workspace.style.display = 'none';
    statusDot.classList.add('inactive');
    statusText.innerText = `RAG Core Offline`;
  }

  // Update numbers in Analytics panel
  document.getElementById('stat-pages').innerText = totalPages;
  document.getElementById('stat-chunks').innerText = state.chunks.length;
}

// ----------------------------------------------------
// SYSTEM PRESETS & CONFIGURATIONS SAVER
// ----------------------------------------------------
function initSettingsPanel() {
  const keyInput = document.getElementById('settings-api-key');
  const toggleKeyBtn = document.getElementById('toggle-key-visibility-btn');
  const speechRate = document.getElementById('settings-speech-rate');
  const speechRateVal = document.getElementById('settings-speech-rate-val');
  const chunkSize = document.getElementById('settings-chunk-size');
  const chunkSizeVal = document.getElementById('settings-chunk-size-val');
  const chunkOverlap = document.getElementById('settings-chunk-overlap');
  const chunkOverlapVal = document.getElementById('settings-chunk-overlap-val');
  const topK = document.getElementById('settings-top-k');
  const topKVal = document.getElementById('settings-top-k-val');
  const wipeBtn = document.getElementById('clear-all-data-btn');

  // Load state on startup
  const savedCustomKey = localStorage.getItem('study_buddy_custom_key') || '';
  keyInput.value = savedCustomKey;
  
  speechRate.value = state.speechRate;
  speechRateVal.innerText = `${state.speechRate.toFixed(1)}x`;
  chunkSize.value = state.chunkSize;
  chunkSizeVal.innerText = `${state.chunkSize} chars`;
  chunkOverlap.value = state.chunkOverlap;
  chunkOverlapVal.innerText = `${state.chunkOverlap} chars`;
  topK.value = state.topK;
  topKVal.innerText = `${state.topK} chunks`;

  // Eye toggle visibility for custom API key override
  toggleKeyBtn.addEventListener('click', () => {
    const eye = toggleKeyBtn.querySelector('i');
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      eye.className = 'fa-solid fa-eye';
    } else {
      keyInput.type = 'password';
      eye.className = 'fa-solid fa-eye-slash';
    }
  });

  // Save custom key change
  keyInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    localStorage.setItem('study_buddy_custom_key', val);
    state.apiKey = getActiveApiKey();
  });

  speechRate.addEventListener('input', (e) => {
    state.speechRate = parseFloat(e.target.value);
    speechRateVal.innerText = `${state.speechRate.toFixed(1)}x`;
    localStorage.setItem('study_buddy_speech_rate', state.speechRate);
  });

  chunkSize.addEventListener('input', (e) => {
    state.chunkSize = parseInt(e.target.value);
    chunkSizeVal.innerText = `${state.chunkSize} chars`;
    localStorage.setItem('study_buddy_chunk_size', state.chunkSize);
  });

  chunkOverlap.addEventListener('input', (e) => {
    state.chunkOverlap = parseInt(e.target.value);
    chunkOverlapVal.innerText = `${state.chunkOverlap} chars`;
    localStorage.setItem('study_buddy_chunk_overlap', state.chunkOverlap);
  });

  topK.addEventListener('input', (e) => {
    state.topK = parseInt(e.target.value);
    topKVal.innerText = `${state.topK} chunks`;
    localStorage.setItem('study_buddy_top_k', state.topK);
  });

  wipeBtn.addEventListener('click', () => {
    if (confirm('Are you absolutely sure you want to clear your local database, uploaded documents, chat transcripts, and configurations?')) {
      localStorage.clear();
      window.location.reload();
    }
  });
}

// ----------------------------------------------------
// STREAMING GEMINI CHAT CLIENT & RAG PROMPTING
// ----------------------------------------------------
function initChatWorkspace() {
  const userInput = document.getElementById('chat-user-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const clearBtn = document.getElementById('clear-chat-btn');
  const downloadBtn = document.getElementById('download-chat-btn');
  const voiceBtn = document.getElementById('voice-input-btn');
  const messagesBox = document.getElementById('chat-messages-container');
  
  // Citation Toggle Drawer elements
  const toggleSourcesBtn = document.getElementById('toggle-sources-btn');
  const closeSourcesBtn = document.getElementById('close-sources-btn');
  const sourcesPanel = document.getElementById('sources-citation-panel');

  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitQuestion();
  });
  sendBtn.addEventListener('click', submitQuestion);

  clearBtn.addEventListener('click', () => {
    if (confirm('Wipe current chat history?')) {
      messagesBox.innerHTML = `
        <div class="msg ai">
          <div class="avatar"><i class="fa-solid fa-robot"></i></div>
          <div class="bubble">
            <p>Chat cleared. Send a query to activate the RAG retrieval pipeline.</p>
          </div>
        </div>
      `;
      state.chatHistory = [];
    }
  });

  downloadBtn.addEventListener('click', downloadChatTranscript);

  // Collapsible panel switches
  toggleSourcesBtn.addEventListener('click', () => {
    sourcesPanel.classList.toggle('active');
    toggleSourcesBtn.classList.toggle('active');
  });
  closeSourcesBtn.addEventListener('click', () => {
    sourcesPanel.classList.remove('active');
    toggleSourcesBtn.classList.remove('active');
  });

  // Speech input implementation (STT)
  initSpeechToText(voiceBtn, userInput);

  async function submitQuestion() {
    const query = userInput.value.trim();
    if (query.length === 0) return;



    if (state.chunks.length === 0) {
      appendMessage('ai', '⚠️ **No study materials loaded yet.** Please upload your PDFs, textbooks, or notes in the **PDF Manager** tab first. I can only answer questions based on your uploaded documents.', []);
      return;
    }

    // Insert User Message Bubble
    appendMessage('user', query);
    userInput.value = '';
    
    // Increment statistics
    state.stats.questionsAsked++;
    localStorage.setItem('study_buddy_stats_q', state.stats.questionsAsked);
    document.getElementById('stat-questions').innerText = state.stats.questionsAsked;

    // Start RAG Retrieval Pipeline
    appendTypingLoader();
    
    try {
      const topMatches = state.ragEngine.retrieve(query, state.topK);
      console.log('Retrieved grounding segments:', topMatches);
      
      // Inject retrieved segments into visual citations panel
      renderSourceCitations(topMatches);
      
      // Ensure strict boundary match: Check if highest matched score satisfies relevance
      // An extremely low similarity score (e.g. < 0.02) represents a completely irrelevant prompt.
      const bestMatchScore = topMatches.length > 0 ? topMatches[0].score : 0;
      
      if (bestMatchScore < 0.015) {
        removeTypingLoader();
        appendMessage('ai', 'The answer is not available in uploaded documents.', []);
        return;
      }

      // Context grounding content construction
      const contextString = topMatches
        .map((m, idx) => `[Grounding Segment ${idx + 1}] Source: ${m.chunk.docName}, Page: ${m.chunk.pageNum}\nText content: ${m.chunk.text}`)
        .join('\n\n');

      // Strict prompt engineering configuration to prohibit hallucinations
      const systemPrompt = `You are "Study Buddy RAG", a futuristic and super-intelligent academic study assistant.
Your task is to answer the user's question STRICTLY using the provided context chunks extracted from the uploaded study documents.

Rules:
1. Direct Answers: Answer the question clearly, concisely, and in student-friendly language.
2. Strict Context Match: Rely ONLY on the clear facts mentioned in the context. Do NOT make up, assume, or extrapolate any information. If the context does not contain the answer, you MUST respond exactly with: "The answer is not available in uploaded documents."
3. No Hallucinations: Do not use any outside knowledge or general training data to answer questions unless it is explicitly mentioned in the context.
4. Language: Answer in the same language as the user's question (supports both English and Hindi). If the question is in Hindi, explain in simple, natural Hindi.
5. Formatting: Use neat markdown with bullet points, bold text, and code formatting where necessary. Ensure citations like [Page X] are used naturally in text when referencing details.`;

      const userPrompt = `Context chunks extracted from files:
---------------------------------------------
${contextString}
---------------------------------------------

User Question: ${query}`;

      removeTypingLoader();
      await streamGeminiResponse(systemPrompt, userPrompt, topMatches);
      
    } catch (err) {
      console.error(err);
      removeTypingLoader();
      appendMessage('ai', `System retrieval error occurred: ${err.message}`, []);
    }
  }

  function appendMessage(sender, text, citations = []) {
    const msgId = `msg-${Date.now()}`;
    const citationBadges = citations
      .map(c => `<span class="citation-badge" onclick="showSourceCitation('${c.id}')">p. ${c.page}</span>`)
      .join(' ');

    const html = `
      <div class="msg ${sender}" id="${msgId}">
        <div class="avatar"><i class="fa-solid ${sender === 'user' ? 'fa-user-graduate' : 'fa-robot'}"></i></div>
        <div class="bubble">
          <div class="bubble-content">${sender === 'user' ? text : renderMarkdown(text)}</div>
          ${sender === 'ai' ? `
            <div class="bubble-footer">
              <div class="citations-list">${citationBadges}</div>
              <div class="bubble-controls">
                <button class="btn-bubble-action" onclick="copyBubbleText('${msgId}')" title="Copy answer"><i class="fa-regular fa-copy"></i></button>
                <button class="btn-bubble-action" onclick="readBubbleText('${msgId}')" title="Read answer (Text-to-Speech)"><i class="fa-solid fa-volume-high"></i></button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
    
    messagesBox.insertAdjacentHTML('beforeend', html);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    
    if (sender === 'ai') {
      safeHighlight(document.getElementById(msgId));
    }
    
    state.chatHistory.push({ sender, text, citations });
    return msgId;
  }

  function appendTypingLoader() {
    const html = `
      <div class="msg ai" id="chat-typing-loader">
        <div class="avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="bubble">
          <div class="typing-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      </div>
    `;
    messagesBox.insertAdjacentHTML('beforeend', html);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function removeTypingLoader() {
    const loader = document.getElementById('chat-typing-loader');
    if (loader) loader.remove();
  }

  // ----------------------------------------------------
  // GEMINI REAL-TIME SSE RESPONSE STREAM DECODER
  // ----------------------------------------------------
  async function streamGeminiResponse(systemPrompt, userPrompt, matches) {
    const msgId = `msg-${Date.now()}`;
    
    // Build citation structures
    const citations = matches.map((m, idx) => ({
      id: m.chunk.id,
      page: m.chunk.pageNum,
      docName: m.chunk.docName,
      text: m.chunk.text,
      score: Math.round(m.score * 100)
    }));

    const citationBadges = citations
      .map(c => `<span class="citation-badge" onclick="showSourceCitation('${c.id}')">${c.docName.substr(0,8)}.. p.${c.page}</span>`)
      .join(' ');

    const html = `
      <div class="msg ai" id="${msgId}">
        <div class="avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="bubble">
          <div class="bubble-content" id="${msgId}-content"></div>
          <div class="bubble-footer">
            <div class="citations-list">${citationBadges}</div>
            <div class="bubble-controls">
              <button class="btn-bubble-action" onclick="copyBubbleText('${msgId}')" title="Copy answer"><i class="fa-regular fa-copy"></i></button>
              <button class="btn-bubble-action" onclick="readBubbleText('${msgId}')" title="Read answer (Text-to-Speech)"><i class="fa-solid fa-volume-high"></i></button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    messagesBox.insertAdjacentHTML('beforeend', html);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    
    const contentBox = document.getElementById(`${msgId}-content`);
    let generatedText = '';

    try {
      let model = "gemini-2.0-flash";
      console.log("Gemini Request Started");
      console.log("Using Model:", model);

      const currentKey = getActiveApiKey();
      let url = `https://generativelanguage.googleapis.com/v1/models/${model}:streamGenerateContent?key=${currentKey}`;
      
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        })
      };

      let response = await fetch(url, requestOptions);

      if (response.status === 404) {
        console.warn(`Model ${model} not found (404). Falling back to gemini-1.5-flash...`);
        model = "gemini-1.5-flash";
        console.log("Using Model:", model);
        url = `https://generativelanguage.googleapis.com/v1/models/${model}:streamGenerateContent?key=${currentKey}`;
        response = await fetch(url, requestOptions);
      }

      if (!response.ok) {
        let errorMsg = `HTTP Error Status ${response.status}`;
        if (response.status === 400) errorMsg = "Invalid API request or unsupported model.";
        if (response.status === 401 || response.status === 403) errorMsg = "Invalid API Key or unauthorized access.";
        if (response.status === 404) errorMsg = "API Endpoint or Model not found (404).";
        if (response.status === 429) {
          errorMsg = "Demo Key Quota Exceeded (429). The shared demo key is rate-limited. Please get your own FREE Gemini API Key from Google AI Studio and configure it in the Settings panel to get unlimited personal access.";
          showToast("Shared Key Quota Exceeded! Configure your own key in Settings.", "warn");
        }
        throw new Error(errorMsg);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse complete JSON array blocks in SSE chunks
        // The API sends chunks separated by commas inside a JSON array.
        // A robust way to parse them client-side without full array completion
        // is to locate complete JSON objects {"candidates":...}
        
        let startIdx = 0;
        while (true) {
          const start = buffer.indexOf('{"candidates"', startIdx);
          if (start === -1) break;
          
          // Locate the matching closing brace. Simple matching algorithm:
          let braceCount = 0;
          let end = -1;
          for (let i = start; i < buffer.length; i++) {
            if (buffer[i] === '{') braceCount++;
            else if (buffer[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                end = i;
                break;
              }
            }
          }
          
          if (end === -1) {
            // Incomplete object, wait for next buffer chunk
            startIdx = start;
            break;
          }
          
          const jsonStr = buffer.substring(start, end + 1);
          try {
            const data = JSON.parse(jsonStr);
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
              const textPiece = data.candidates[0].content.parts[0].text;
              generatedText += textPiece;
              contentBox.innerHTML = renderMarkdown(generatedText);
              messagesBox.scrollTop = messagesBox.scrollHeight;
              safeHighlight(document.getElementById(msgId));
            }
          } catch (e) {
            // Skip parse errors on dirty buffer cuts
          }
          
          startIdx = end + 1;
        }
        
        // Truncate processed buffer sections
        if (startIdx > 0) {
          buffer = buffer.substring(startIdx);
        }
      }

      // Check for empty generation
      if (!generatedText) {
        generatedText = "AI response unavailable. Please try again.";
        contentBox.innerHTML = renderMarkdown(generatedText);
      } else {
        console.log("API Response Stream Completed. Total Length:", generatedText.length);
      }

      state.chatHistory.push({ sender: 'ai', text: generatedText, citations });
      
    } catch (err) {
      console.error(err);
      let errMsg = err.message;
      if (!navigator.onLine || err.name === 'TypeError') {
        errMsg = "No internet connection or network error.";
      }
      generatedText = `RAG Stream connection failed: ${errMsg}`;
      contentBox.innerHTML = `<span style="color: var(--neon-pink);">${generatedText}</span>`;
    }
  }

  function renderSourceCitations(matches) {
    const list = document.getElementById('sources-list-container');
    list.innerHTML = '';
    
    if (matches.length === 0) {
      list.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center;">No matching chunks.</p>`;
      return;
    }

    matches.forEach((m, idx) => {
      const pct = Math.round(m.score * 100);
      const text = m.chunk.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = `
        <div class="source-item" id="source-ref-${m.chunk.id}">
          <div class="source-item-meta">
            <span>[#${idx + 1}] ${m.chunk.docName.substr(0,18)} (p. ${m.chunk.pageNum})</span>
            <span class="source-item-score">Match: ${pct}%</span>
          </div>
          <div class="source-item-text">"${text}"</div>
        </div>
      `;
      list.insertAdjacentHTML('beforeend', html);
    });
  }

  function downloadChatTranscript() {
    if (state.chatHistory.length === 0) return;
    
    let text = "========================================================\n";
    text += "       STUDY BUDDY RAG - REVISION SESSION TRANSCRIPT     \n";
    text += "========================================================\n\n";

    state.chatHistory.forEach(msg => {
      const role = msg.sender === 'user' ? 'STUDENT' : 'STUDY BUDDY AI';
      text += `[${role}]: ${msg.text}\n`;
      if (msg.citations && msg.citations.length > 0) {
        text += "Citations used: " + msg.citations.map(c => `[${c.docName}, p. ${c.page} (${c.score}% similarity)]`).join(', ') + "\n";
      }
      text += "\n--------------------------------------------------------\n\n";
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `StudyBuddyRAG_Session_${Date.now()}.txt`;
    link.click();
  }
}

// ----------------------------------------------------
// DYNAMIC EXTRAS: CITATION JUMPS & VOICE & CLIPBOARD
// ----------------------------------------------------
function showSourceCitation(chunkId) {
  // Ensure the citation panel drawer is opened
  const sourcesPanel = document.getElementById('sources-citation-panel');
  const toggleBtn = document.getElementById('toggle-sources-btn');
  sourcesPanel.classList.add('active');
  toggleBtn.classList.add('active');

  // Find source element and scroll to it with vertical flashing indicator!
  const target = document.getElementById(`source-ref-${chunkId}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.style.borderColor = 'var(--neon-purple)';
    target.style.boxShadow = '0 0 15px var(--neon-purple)';
    setTimeout(() => {
      target.style.borderColor = 'var(--glass-border)';
      target.style.boxShadow = 'none';
    }, 2000);
  }
}

function copyBubbleText(msgId) {
  const bubble = document.getElementById(`${msgId}-content`) || document.querySelector(`#${msgId} .bubble`);
  const text = bubble.innerText;
  
  navigator.clipboard.writeText(text).then(() => {
    alert('Answer transcript copied to clipboard!');
  }).catch(err => {
    console.error('Clipboard write failed:', err);
  });
}

function readBubbleText(msgId) {
  const bubble = document.getElementById(`${msgId}-content`) || document.querySelector(`#${msgId} .bubble`);
  const text = bubble.innerText;

  // Stop previous voices
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = state.speechRate;
  
  // Find appropriate localized voice
  const voices = window.speechSynthesis.getVoices();
  const engVoice = voices.find(v => v.lang.includes('en'));
  if (engVoice) utterance.voice = engVoice;

  window.speechSynthesis.speak(utterance);
}

// Speech to text browser recognition integration (STT)
function initSpeechToText(voiceBtn, userInput) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    state.isRecording = true;
    voiceBtn.classList.add('pulsing');
    userInput.placeholder = "Listening... Speak now!";
  };

  recognition.onend = () => {
    state.isRecording = false;
    voiceBtn.classList.remove('pulsing');
    userInput.placeholder = "Ask a question about your uploaded materials...";
  };

  recognition.onerror = (e) => {
    console.error('STT Voice recognition error:', e.error);
    state.isRecording = false;
    voiceBtn.classList.remove('pulsing');
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    userInput.value = transcript;
    // Auto submit transcription!
    document.getElementById('chat-send-btn').click();
  };

  voiceBtn.addEventListener('click', () => {
    if (state.isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });

  state.recognition = recognition;
}

// ----------------------------------------------------
// INTELLIGENT STUDY HUB TAB PANEL SYSTEMS
// ----------------------------------------------------
function initStudyHub() {
  const tabButtons = document.querySelectorAll('.hub-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanes.forEach(pane => pane.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });

  // Action buttons
  const genSummaryBtn = document.getElementById('generate-summary-btn');
  const genQuestionsBtn = document.getElementById('generate-questions-btn');
  const genQuizBtn = document.getElementById('generate-quiz-btn');

  genSummaryBtn.addEventListener('click', generateDocumentSummary);
  genQuestionsBtn.addEventListener('click', generateDocumentQuestions);
  genQuizBtn.addEventListener('click', initializeRevisionQuiz);

  // Advanced synthesis loaders
  async function generateDocumentSummary() {
    if (state.chunks.length === 0) {
      alert('Please upload materials inside the PDF Manager first.');
      return;
    }

    const banner = document.getElementById('summary-banner');
    const resultBox = document.getElementById('summary-result-container');
    
    banner.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">Synthesizing Core Concepts...</div>
      </div>
    `;
    
    try {
      // Pick a representative cross section of text chunks to avoid prompt limit
      const sampledChunks = sampleChunksForGeneralTasks();
      const prompt = `Synthesize a comprehensive, clean, and highly educational chapter-by-chapter study summary of the provided text material.
Focus on primary definitions, crucial concepts, formulas, and bulleted takeaways. Use beautiful bold formatting.

Text material:
---------------------------
${sampledChunks}
---------------------------`;

      const responseText = await callGeminiAPI(prompt);
      
      banner.style.display = 'none';
      resultBox.style.display = 'block';
      resultBox.innerHTML = renderMarkdown(responseText);
      
    } catch (err) {
      console.error(err);
      banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 30px; color: var(--neon-pink);"></i>
        <h3>Synthesis Failed</h3>
        <p class="banner-desc">${err.message}</p>
        <button class="btn-futuristic" onclick="window.location.reload()"><i class="fa-solid fa-rotate"></i> Retry</button>
      `;
    }
  }

  async function generateDocumentQuestions() {
    if (state.chunks.length === 0) {
      alert('Please upload materials inside the PDF Manager first.');
      return;
    }

    const banner = document.getElementById('questions-banner');
    const grid = document.getElementById('questions-result-grid');

    banner.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">Analyzing Key Concepts & Drafting Questions...</div>
      </div>
    `;

    try {
      const sampledChunks = sampleChunksForGeneralTasks();
      const prompt = `Analyze the provided educational material and extract exactly 6 highly critical, conceptual questions that a teacher is most likely to ask in an exam.
Provide ONLY the questions as a simple numbered list, one question per line. Do not write any other filler text.

Text material:
---------------------------
${sampledChunks}
---------------------------`;

      const responseText = await callGeminiAPI(prompt);
      
      // Parse questions lines
      const questions = responseText
        .split('\n')
        .map(q => q.replace(/^\d+[\.\s\-]+/, '').trim())
        .filter(q => q.length > 5)
        .slice(0, 6);

      banner.style.display = 'none';
      grid.style.display = 'grid';
      grid.innerHTML = '';

      questions.forEach(q => {
        const cardHTML = `
          <div class="question-card" onclick="askHubQuestion(this)">
            <div class="question-card-text">${q}</div>
            <i class="fa-solid fa-arrow-right"></i>
          </div>
        `;
        grid.insertAdjacentHTML('beforeend', cardHTML);
      });

    } catch (err) {
      console.error(err);
      banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 30px; color: var(--neon-pink);"></i>
        <h3>Extraction Failed</h3>
        <p class="banner-desc">${err.message}</p>
      `;
    }
  }

  // ----------------------------------------------------
  // INTERACTIVE MCQ REVISION GAME SYSTEM
  // ----------------------------------------------------
  async function initializeRevisionQuiz() {
    if (state.chunks.length === 0) {
      alert('Please upload materials inside the PDF Manager first.');
      return;
    }

    const banner = document.getElementById('quiz-banner');
    const gameWrapper = document.getElementById('quiz-game-container');
    const scoreBoard = document.getElementById('quiz-score-container');

    scoreBoard.style.display = 'none';
    banner.style.display = 'flex';
    banner.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">Generating Dynamic MCQ Quiz Cards...</div>
      </div>
    `;

    try {
      const sampledChunks = sampleChunksForGeneralTasks();
      const prompt = `Based strictly on the provided context, generate a multiple choice quiz of exactly 5 questions to evaluate the user's conceptual recall.
Output the result strictly as a raw JSON array inside a \`\`\`json \`\`\` code block. Do not write any other text.

JSON Schema format:
[
  {
    "question": "Crucial concept question?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": 1, // index of correct option (0-3)
    "explanation": "Reasoning explaining why Option B is correct."
  }
]

Text material:
---------------------------
${sampledChunks}
---------------------------`;

      const responseText = await callGeminiAPI(prompt);
      
      // Parse JSON from code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to parse quiz response block.');
      }
      
      state.quizData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      state.currentQuizIndex = 0;
      state.quizScore = 0;
      state.quizAnswers = [];

      banner.style.display = 'none';
      gameWrapper.style.display = 'block';
      
      renderQuizQuestion();

    } catch (err) {
      console.error(err);
      banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 30px; color: var(--neon-pink);"></i>
        <h3>Quiz Generation Failed</h3>
        <p class="banner-desc">${err.message}</p>
        <button class="btn-futuristic" onclick="initializeRevisionQuiz()"><i class="fa-solid fa-rotate"></i> Retry</button>
      `;
    }
  }

  function renderQuizQuestion() {
    const qData = state.quizData[state.currentQuizIndex];
    
    // Update progress progress ratio bar
    const progressFill = document.getElementById('quiz-progress-fill-bar');
    const progressText = document.getElementById('quiz-question-number');
    const timerText = document.getElementById('quiz-timer');
    
    const total = state.quizData.length;
    const progressPct = Math.round((state.currentQuizIndex / total) * 100);
    progressFill.style.width = `${progressPct}%`;
    
    progressText.innerText = `Question ${state.currentQuizIndex + 1} of ${total}`;
    timerText.innerText = `Score: ${state.quizScore} / ${total}`;

    // Question body text
    document.getElementById('quiz-question-text-area').innerText = qData.question;
    
    // Option boxes list
    const container = document.getElementById('quiz-options-container');
    container.innerHTML = '';

    // Explanation panel hides
    const explanationArea = document.getElementById('quiz-explanation-area');
    explanationArea.style.display = 'none';

    // Next button hides
    const nextBtn = document.getElementById('quiz-next-btn');
    nextBtn.style.display = 'none';

    qData.options.forEach((opt, idx) => {
      const label = String.fromCharCode(65 + idx); // A, B, C, D
      const optHTML = `
        <div class="quiz-option" data-idx="${idx}" onclick="selectQuizOption(this, ${idx})">
          <div class="quiz-option-index">${label}</div>
          <div class="quiz-option-text">${opt}</div>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', optHTML);
    });
  }

  window.selectQuizOption = function(element, selectedIdx) {
    const qData = state.quizData[state.currentQuizIndex];
    const correctIdx = qData.answer;
    
    // Disable all options clicks
    const options = document.querySelectorAll('.quiz-option');
    options.forEach(opt => opt.removeAttribute('onclick'));

    const explanationArea = document.getElementById('quiz-explanation-area');
    const nextBtn = document.getElementById('quiz-next-btn');

    if (selectedIdx === correctIdx) {
      element.classList.add('correct');
      state.quizScore++;
    } else {
      element.classList.add('incorrect');
      // Highlight correct option too
      const correctOption = document.querySelector(`.quiz-option[data-idx="${correctIdx}"]`);
      if (correctOption) correctOption.classList.add('correct');
    }

    // Reveal explanation text
    explanationArea.style.display = 'block';
    explanationArea.innerHTML = `
      <strong>${selectedIdx === correctIdx ? '✓ Correct Answer!' : '✗ Inconsistent Selection.'}</strong>
      ${qData.explanation}
    `;

    // Reveal next button
    nextBtn.style.display = 'block';
    if (state.currentQuizIndex === state.quizData.length - 1) {
      nextBtn.innerHTML = `Finish Quiz <i class="fa-solid fa-award"></i>`;
    } else {
      nextBtn.innerHTML = `Next Question <i class="fa-solid fa-chevron-right"></i>`;
    }
  };

  // Next question triggers
  const nextBtn = document.getElementById('quiz-next-btn');
  nextBtn.addEventListener('click', () => {
    if (state.currentQuizIndex < state.quizData.length - 1) {
      state.currentQuizIndex++;
      renderQuizQuestion();
    } else {
      // Trigger ending scoreboard view
      renderQuizScoreboard();
    }
  });

  function renderQuizScoreboard() {
    const gameWrapper = document.getElementById('quiz-game-container');
    const scoreBoard = document.getElementById('quiz-score-container');
    
    gameWrapper.style.display = 'none';
    scoreBoard.style.display = 'block';

    const total = state.quizData.length;
    const finalScore = state.quizScore;
    const ratio = finalScore / total;
    
    document.getElementById('score-value-text').innerText = `${finalScore}/${total}`;

    // SVG radial animate stroke length
    // Dasharray circumference: 440
    const stroke = document.getElementById('score-radial-stroke');
    const offset = 440 - (440 * ratio);
    
    // Trigger paint layout frame delay for animation
    setTimeout(() => {
      stroke.style.strokeDashoffset = offset;
    }, 100);

    const message = document.getElementById('score-message-text');
    const advice = document.getElementById('score-advice-text');

    if (ratio === 1) {
      message.innerText = `Perfect Comprehension!`;
      advice.innerText = `Sensational score! RAG indexing has perfectly accelerated your active memory capacity. Let's start a new subject.`;
    } else if (ratio >= 0.7) {
      message.innerText = `Excellent Command!`;
      advice.innerText = `You have achieved deep grasp of primary takeaways. Re-read highlighted context references to perfect your score!`;
    } else {
      message.innerText = `Keep Refining!`;
      advice.innerText = `Focus on active recall reading. Try asking specific conceptual clarification queries to RAG chat.`;
    }
  }

  // Restart quiz game callback
  document.getElementById('quiz-restart-btn').addEventListener('click', () => {
    initializeRevisionQuiz();
  });
}

function askHubQuestion(cardElement) {
  const query = cardElement.querySelector('.question-card-text').innerText;
  
  // Go to Chat view
  document.getElementById('nav-dashboard').click();
  
  // Input query and submit
  const input = document.getElementById('chat-user-input');
  input.value = query;
  document.getElementById('chat-send-btn').click();
}

// ----------------------------------------------------
// SYSTEM UTILITIES: GENERAL APIS & GENERALIZERS
// ----------------------------------------------------
async function callGeminiAPI(prompt, isRetry = false) {
  let model = isRetry ? "gemini-1.5-flash" : "gemini-2.0-flash";
  const currentKey = getActiveApiKey();
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${currentKey}`;
  
  console.log("Gemini Request Started");
  console.log("Using Model:", model);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      })
    });

    if (!response.ok) {
      if (response.status === 404 && !isRetry) {
        console.warn(`Model ${model} not found (404). Falling back to gemini-1.5-flash...`);
        return await callGeminiAPI(prompt, true);
      }
      
      let errorMsg = `Gemini Server Error Status: ${response.status}`;
      if (response.status === 400) errorMsg = "Invalid API request or unsupported model.";
      if (response.status === 401 || response.status === 403) errorMsg = "Invalid API Key or unauthorized access.";
      if (response.status === 404) errorMsg = "API Endpoint or Model not found (404).";
      if (response.status === 429) {
        errorMsg = "Demo Key Quota Exceeded (429). The shared demo key is rate-limited. Please get your own FREE Gemini API Key from Google AI Studio and configure it in the Settings panel to get unlimited personal access.";
        showToast("Shared Key Quota Exceeded! Configure your own key in Settings.", "warn");
      }
      
      throw new Error(errorMsg);
    }

    const data = await response.json();
    console.log("API Response:", data);

    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text;
    }
    
    throw new Error('AI response unavailable. Please try again.');
  } catch (error) {
    if (!navigator.onLine || error.name === 'TypeError') {
      throw new Error("No internet connection or network error.");
    }
    throw error;
  }
}

// Helper: Pick a representative cross section of text chunks to avoid prompt limit
function sampleChunksForGeneralTasks() {
  const step = Math.max(1, Math.floor(state.chunks.length / 8));
  const samples = [];
  for (let i = 0; i < state.chunks.length; i += step) {
    samples.push(state.chunks[i].text);
    if (samples.length >= 8) break;
  }
  return samples.join('\n\n');
}

// ----------------------------------------------------
// ANALYTICS KNOWLEDGE CHARTS SYSTEM
// ----------------------------------------------------
function renderKnowledgeChart() {
  const container = document.getElementById('bar-chart-container-area');
  container.innerHTML = '';
  
  if (state.documents.length === 0) {
    container.innerHTML = `
      <div class="loading-container" style="flex-grow: 1; height: 100%; justify-content: center;">
        <p style="font-size: 11px; color: var(--text-muted);">Please upload PDF files to generate knowledge charts.</p>
      </div>
    `;
    return;
  }

  // Calculate chunks per document
  const counts = {};
  state.chunks.forEach(c => {
    counts[c.docName] = (counts[c.docName] || 0) + 1;
  });

  const maxVal = Math.max(...Object.values(counts));

  Object.entries(counts).forEach(([docName, val]) => {
    const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
    const barHTML = `
      <div class="chart-bar-wrapper">
        <div class="chart-bar" style="height: ${pct}%;">
          <div class="chart-bar-tooltip">${val} chunks</div>
        </div>
        <div class="chart-bar-label" title="${docName}">${docName.substr(0, 10)}..</div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', barHTML);
  });
}

// ----------------------------------------------------
// EXAM PREPARATION ASSISTANT ENGINE
// ----------------------------------------------------
function initExamPrep() {
  const generateBtn = document.getElementById('generate-exam-btn');
  const categorySelect = document.getElementById('exam-category-select');
  const difficultySelect = document.getElementById('exam-difficulty-select');
  const langSelect = document.getElementById('exam-lang-select');
  const banner = document.getElementById('exam-prep-banner');
  const resultsContainer = document.getElementById('exam-results-container');
  const downloadBtn = document.getElementById('exam-download-txt-btn');
  const copyBtn = document.getElementById('exam-copy-btn');

  let lastGeneratedText = '';

  generateBtn.addEventListener('click', generateExamQuestions);
  downloadBtn.addEventListener('click', downloadExamResults);
  copyBtn.addEventListener('click', copyExamResults);

  // Prompt templates mapped by category
  const CATEGORY_PROMPTS = {
    'all': `You are an expert university exam preparation AI. Analyze the provided study material and generate a COMPREHENSIVE exam preparation guide covering ALL of the following sections. Use clear markdown formatting with headings, bullet points, and numbering.

## 📚 Unit-Wise Important Questions
(Group questions by topic/unit found in the material. Include 2-mark, 5-mark and 10-mark questions for each unit.)

## 🔥 Most Important Topics
(List the topics that appear most critical based on depth of coverage and conceptual density.)

## 📝 Expected Long Answer Questions (10 marks)
(Generate 6-8 detailed long-answer questions that a university examiner would likely ask.)

## ⚡ Expected Short Answer Questions (2-5 marks)
(Generate 10-12 concise short-answer questions.)

## 📋 Quick Revision Notes
(Create bullet-point revision notes covering all key definitions, formulas, and concepts.)

## ❓ Viva Questions
(Generate 8-10 conceptual viva/oral exam questions.)

## 🧠 MCQ Bank
(Generate 10 multiple-choice questions with options A-D. Mark the correct answer for each.)

## 📖 Important Definitions
(List all critical definitions found in the material.)`,

    'unit-wise': `You are an expert exam preparation AI. Analyze the study material and generate UNIT-WISE IMPORTANT QUESTIONS. Group the questions by topic/chapter/unit as found in the material. For each unit, generate:
- 2-3 one-mark questions
- 2-3 short-answer questions (2-5 marks)
- 2-3 long-answer questions (10 marks)
Use proper markdown formatting with ## headings for each unit.`,

    'most-important': `You are an expert exam preparation AI. Analyze the study material and identify the MOST IMPORTANT AND MOST REPEATED TOPICS for exams. For each topic:
1. Explain WHY it is important (high weightage, frequently tested, foundational concept)
2. List the key sub-topics to study
3. Suggest what type of question could come from this topic
Format as a numbered list with clear headings.`,

    'long-answer': `You are an expert exam preparation AI. Generate 8-10 EXPECTED LONG ANSWER QUESTIONS (10 marks each) from the study material. These should be:
- University exam style questions
- Requiring detailed explanations
- Covering major concepts and theories
- Including "Explain", "Describe", "Compare", "Discuss" type questions
For each question, add a brief hint of key points to cover in the answer.`,

    'short-answer': `You are an expert exam preparation AI. Generate 15 EXPECTED SHORT ANSWER QUESTIONS (2-5 marks) from the study material. These should be:
- Concise and specific
- Covering definitions, differences, examples, and brief explanations
- University exam pattern style
For each question, mention the expected marks (2 or 5).`,

    'mcq': `You are an expert exam preparation AI. Generate 15 MULTIPLE CHOICE QUESTIONS (MCQs) from the study material. Format each as:

**Q1.** Question text
- A) Option A
- B) Option B
- C) Option C
- D) Option D

**Answer:** B) Option B
**Explanation:** Brief explanation of why this is correct.

Ensure questions cover a mix of conceptual, factual, and application-based types.`,

    'viva': `You are an expert exam preparation AI. Generate 12 VIVA / ORAL EXAM QUESTIONS from the study material. These should be:
- Conceptual and thought-provoking
- Testing deep understanding, not just memorization
- Including follow-up style questions
- Covering "Why", "How", "What if" patterns
For each question, provide a brief model answer hint.`,

    'revision': `You are an expert exam preparation AI. Create QUICK LAST-MINUTE REVISION NOTES from the study material. Structure them as:
- Key definitions (one-liners)
- Important formulas (if any)
- Critical concepts in bullet points
- Common comparisons/differences
- Mnemonics or memory aids if applicable
Keep it extremely concise and scannable. A student should be able to revise everything in 15 minutes.`,

    'definitions': `You are an expert exam preparation AI. Extract ALL IMPORTANT DEFINITIONS from the study material. Format each as:

**Term:** Definition text

Group them by topic/chapter if possible. Include only definitions that are likely to appear in university exams.`,

    'numerical': `You are an expert exam preparation AI. Generate NUMERICAL AND PROBLEM-SOLVING QUESTIONS from the study material (if applicable). For each problem:
1. State the problem clearly
2. Mention the expected approach/formula
3. If the material contains solved examples, generate similar practice problems
If the material does not contain numerical content, state that and instead generate application-based analytical questions.`
  };

  async function generateExamQuestions() {
    const category = categorySelect.value;
    const difficulty = difficultySelect.value;
    const lang = langSelect.value;


    if (state.chunks.length === 0) {
      alert('No study material loaded. Please upload PDFs in PDF Manager first.');
      document.getElementById('nav-upload').click();
      return;
    }

    // Show loading state
    banner.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">AI is analyzing your study material and predicting exam questions...</div>
      </div>
    `;
    banner.style.display = 'flex';
    resultsContainer.style.display = 'none';

    try {
      // Get a broad sample of chunks for exam analysis
      const sampledText = sampleChunksForExamPrep();
      
      // Build the prompt
      let basePrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS['all'];

      // Add difficulty filter
      let difficultyInstruction = '';
      if (difficulty === 'easy') {
        difficultyInstruction = '\n\nDifficulty Level: Generate EASY level questions only — basic recall, definitions, simple concepts.';
      } else if (difficulty === 'medium') {
        difficultyInstruction = '\n\nDifficulty Level: Generate MEDIUM level questions — conceptual understanding, comparisons, applications.';
      } else if (difficulty === 'hard') {
        difficultyInstruction = '\n\nDifficulty Level: Generate HARD level questions — analytical, critical thinking, multi-concept integration, case studies.';
      }

      // Add language instruction
      let langInstruction = '';
      if (lang === 'hindi') {
        langInstruction = '\n\nIMPORTANT: Generate ALL questions and content in Hindi language (Devanagari script).';
      } else if (lang === 'hinglish') {
        langInstruction = '\n\nIMPORTANT: Generate ALL questions and content in Hinglish (mix of Hindi and English, Roman script).';
      }

      const fullPrompt = `${basePrompt}${difficultyInstruction}${langInstruction}

CRITICAL RULES:
1. Generate questions ONLY from the provided study material below. Do NOT use any external knowledge.
2. If the material does not contain enough information for a section, write "Not enough content available for this category."
3. Use university exam pattern and student-friendly language.
4. Format beautifully with markdown headings (##), bullet points, bold text, and numbering.

Study Material (extracted from uploaded PDFs):
==============================================
${sampledText}
==============================================`;

      const responseText = await callGeminiAPI(fullPrompt);
      
      lastGeneratedText = responseText;

      // Render results
      banner.style.display = 'none';
      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = `<div class="exam-result-section">${renderMarkdown(responseText)}</div>`;

    } catch (err) {
      console.error(err);
      banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 30px; color: var(--neon-pink);"></i>
        <h3 style="margin-top: 10px;">Generation Failed</h3>
        <p class="banner-desc">${err.message}</p>
        <button class="btn-futuristic" onclick="document.getElementById('generate-exam-btn').click()">
          <i class="fa-solid fa-rotate"></i> Retry
        </button>
      `;
    }
  }

  function downloadExamResults() {
    if (!lastGeneratedText) {
      alert('Generate exam questions first before downloading.');
      return;
    }
    
    const header = `================================================================\n       STUDY BUDDY RAG - AI EXAM PREPARATION QUESTIONS\n       Generated: ${new Date().toLocaleString()}\n================================================================\n\n`;
    const blob = new Blob([header + lastGeneratedText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Exam_Prep_${categorySelect.value}_${Date.now()}.txt`;
    link.click();
  }

  function copyExamResults() {
    if (!lastGeneratedText) {
      alert('Generate exam questions first before copying.');
      return;
    }
    navigator.clipboard.writeText(lastGeneratedText).then(() => {
      alert('All exam questions copied to clipboard!');
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  }
}

// Helper: broader chunk sampling for exam prep (uses more chunks than general tasks)
function sampleChunksForExamPrep() {
  if (state.chunks.length <= 12) {
    return state.chunks.map(c => c.text).join('\n\n');
  }
  const step = Math.max(1, Math.floor(state.chunks.length / 12));
  const samples = [];
  for (let i = 0; i < state.chunks.length; i += step) {
    samples.push(state.chunks[i].text);
    if (samples.length >= 12) break;
  }
  return samples.join('\n\n');
}

// ----------------------------------------------------
// APPLICATION BOOTSTRAP INITIALIZATION
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Initialize dynamic canvas background
  initParticlesBackground();
  
  // Initialize responsive sidebar tabs
  initSidebarController();
  
  // Initialize PDF drag & drop zones
  initPDFUploader();

  // Initialize settings model persistent storage variables
  initSettingsPanel();

  // Initialize chat workspace
  initChatWorkspace();

  // Initialize Study Hub advanced controllers
  initStudyHub();

  // Initialize Exam Preparation Assistant
  initExamPrep();
  
  // Force clean stats
  document.getElementById('stat-questions').innerText = state.stats.questionsAsked;
});
