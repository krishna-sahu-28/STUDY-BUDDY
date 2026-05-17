import streamlit as st
import os
import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
import tempfile

# ==========================================
# STUDY BUDDY RAG - STREAMLIT BACKEND
# ==========================================

st.set_page_config(page_title="Study Buddy RAG", page_icon="🤖", layout="wide")
st.title("🤖 Study Buddy RAG (Python Backend)")
st.markdown("Upload your study materials (PDFs) and ask questions. The AI will answer based strictly on the uploaded content.")

# API Key Setup
api_key = st.sidebar.text_input("Enter Gemini API Key", value="AIzaSyC5ZntQ93fKqk8-qkfUJOdy91v4O22BxN4", type="password")

if not api_key:
    st.warning("Please enter your Google Gemini API Key in the sidebar to continue.")
    st.stop()

# Configure Google GenAI
os.environ["GOOGLE_API_KEY"] = api_key
genai.configure(api_key=api_key)

# Sidebar: File Upload
st.sidebar.header("📁 Upload Materials")
uploaded_files = st.sidebar.file_uploader("Upload PDF Documents", type=["pdf"], accept_multiple_files=True)

# Initialize Session State
if "vector_store" not in st.session_state:
    st.session_state.vector_store = None
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

def process_pdfs(files):
    documents = []
    for file in files:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            temp_file.write(file.read())
            temp_path = temp_file.name
        
        loader = PyPDFLoader(temp_path)
        documents.extend(loader.load())
        os.remove(temp_path)
    
    # Split text into chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_documents(documents)
    
    # Create Embeddings and FAISS Vector Store
    embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
    vector_store = FAISS.from_documents(chunks, embeddings)
    return vector_store

if st.sidebar.button("Process & Index PDFs"):
    if uploaded_files:
        with st.spinner("Processing documents and creating vector embeddings..."):
            try:
                st.session_state.vector_store = process_pdfs(uploaded_files)
                st.sidebar.success("PDFs processed successfully!")
            except Exception as e:
                st.sidebar.error(f"Error processing PDFs: {e}")
    else:
        st.sidebar.warning("Please upload at least one PDF.")

# Chat Interface
st.subheader("💬 Ask a Question")
user_query = st.chat_input("Ask a question about your documents...")

if user_query:
    st.session_state.chat_history.append({"role": "user", "content": user_query})

# Display Chat History
for msg in st.session_state.chat_history:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

if user_query and st.session_state.vector_store:
    with st.chat_message("assistant"):
        with st.spinner("Searching for answers..."):
            try:
                # Setup LLM
                llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.2)
                
                # Setup Prompt
                system_prompt = (
                    "You are a helpful study assistant. Use the following retrieved context to answer the user's question. "
                    "If you don't know the answer based on the context, say exactly: 'The answer is not available in uploaded documents.' "
                    "Context: {context}"
                )
                prompt = ChatPromptTemplate.from_messages([
                    ("system", system_prompt),
                    ("human", "{input}")
                ])
                
                # Create Chains
                question_answer_chain = create_stuff_documents_chain(llm, prompt)
                retriever = st.session_state.vector_store.as_retriever(search_kwargs={"k": 5})
                rag_chain = create_retrieval_chain(retriever, question_answer_chain)
                
                # Get Response
                response = rag_chain.invoke({"input": user_query})
                answer = response["answer"]
                
                st.markdown(answer)
                st.session_state.chat_history.append({"role": "assistant", "content": answer})
                
            except Exception as e:
                st.error(f"Error generating answer: {e}")

elif user_query and not st.session_state.vector_store:
    st.warning("Please upload and process PDFs before asking questions.")
