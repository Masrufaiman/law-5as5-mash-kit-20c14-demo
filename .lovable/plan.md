
# LawKit AI — Phase A: Foundation Implementation Plan

## Overview
Building a legal AI SaaS with React + Supabase, implementing the complete database schema, auth system, file management, and basic vault UI. This phase establishes the foundation for all AI features.

## Database Architecture (15 Tables + RLS)
**Complete Supabase migration implementing the specification:**

### Core Tables:
1. **organizations** - Multi-tenant org structure with plan limits
2. **profiles** - Extended user data (links to auth.users)
3. **vaults** - Document organization containers per org
4. **files** - File metadata with Supabase Storage integration
5. **file_chunks** - RAG preparation (text chunks for future AI processing)
6. **conversations** - Chat sessions with AI
7. **messages** - Individual chat messages with sources/citations
8. **review_tables** - Spreadsheet-like data extraction tables
9. **review_columns** - Column definitions for extraction queries
10. **review_rows** - Extracted data rows per document
11. **documents** - Tiptap documents with versioning
12. **document_versions** - Version history tracking
13. **red_flag_analyses** - Contract risk analysis results
14. **llm_configs** - Admin-configured AI providers (encrypted keys)
15. **knowledge_entries** - Firm-specific AI instructions
16. **api_integrations** - External API connections
17. **audit_logs** - Security audit trail

**Security: RLS enabled on all tables with org isolation**

## Authentication & Authorization
- Supabase Auth with email/password
- Profile creation trigger on user signup
- Role-based access: member/admin/superadmin
- Seed mashcatg@gmail.com as superadmin after first login
- Org-scoped data access via RLS policies

## File Management System
- **Supabase Storage** with secure file uploads
- Supported formats: PDF, DOCX, DOC, XLSX, TXT, MD
- File processing pipeline via Edge Functions:
  1. Upload → Storage bucket
  2. Background extraction (pdf-parse, mammoth)
  3. Text chunking for future RAG
  4. Status updates via Realtime
- Drag & drop upload with progress indicators

## UI/UX Implementation
**Design System (Exact Specification):**
- Colors: #2596be (primary), #f8ffde (light bg), #e7fd7e (accent)
- Fonts: Playfair Display (headings), Instrument Sans (body), IBM Plex Mono (code)
- No box shadows — 1px borders only
- Skeleton loading animations everywhere

**3-Panel Layout:**
- Left sidebar: Navigation (64px wide)
- Center panel: Main content area
- Right panel: Collapsible (360-560px, resizable)

**Vault UI:**
- File grid/list view toggle
- Full-screen drag & drop overlay
- File cards: icon, name, size, status badge
- Real-time status: Processing → Ready → Error
- Tag system with inline editing
- Instant client-side search/filtering

## Edge Functions Architecture
**Key Functions:**
1. **document-processor** - Extract text, create chunks (waitUntil pattern)
2. **llm-router** - Central AI routing with encrypted API keys
3. **admin-config** - Secure API key management
4. **file-operations** - Upload handling and processing

## Admin Panel Foundation
**Secure Configuration System:**
- LLM provider management (Anthropic, OpenAI, etc.)
- AES-256 API key encryption
- Per-org and global configurations
- Use case routing (chat, analysis, extraction)
- Connection testing endpoints

## Real-time Features
**Supabase Realtime subscriptions:**
- File processing status updates
- Chat message streaming (future)
- Table cell population (future)

## Development Approach
1. **Database Migration** - All 15 tables with proper RLS
2. **Auth Flow** - Complete signup/login with org creation
3. **File System** - Upload pipeline with background processing
4. **Vault UI** - Modern file browser with skeleton states
5. **Admin Setup** - Basic admin panel for LLM configuration
6. **Security** - Encrypted secrets, rate limiting, audit logging

## Technical Stack Adaptations
- ✅ Supabase Edge Functions (instead of Express/BullMQ)
- ✅ Supabase Storage (instead of Cloudflare R2)
- ✅ EdgeRuntime.waitUntil() (instead of job queues)
- ✅ Supabase Realtime (for live updates)
- ✅ React + TypeScript + Tailwind (as specified)
- ✅ Admin-configured AI APIs (encrypted in DB)

## Success Criteria
After Phase A completion:
- ✅ Complete auth system with org isolation
- ✅ File upload → processing → ready pipeline working
- ✅ Vault UI with real-time status updates
- ✅ Admin can configure AI providers securely
- ✅ All skeleton loading states implemented
- ✅ Superadmin seeded and functional

This foundation supports all Phase B-D features (AI chat, red flag analysis, review tables, document editor) without architectural changes.
