# PayAid WhatsApp Module

**Status:** ⏳ **IN PROGRESS**  
**Purpose:** WhatsApp Business API functionality including accounts, sessions, templates, messages, and conversations

This is the WhatsApp module that will be extracted into a separate repository (`payaid-whatsapp`) in Phase 2.

---

## 📁 **Structure**

```
whatsapp-module/
├── app/
│   ├── api/
│   │   └── whatsapp/            # WhatsApp endpoints
│   │       ├── accounts/        # WhatsApp account management
│   │       ├── sessions/        # Session management
│   │       ├── templates/       # Template management
│   │       ├── messages/        # Message sending
│   │       ├── conversations/   # Conversation management
│   │       └── analytics/       # WhatsApp analytics
│   └── dashboard/
│       └── whatsapp/            # WhatsApp pages
└── lib/
    └── whatsapp/                # WhatsApp-specific utilities
```

---

## 🔧 **Setup**

This module uses shared packages from `packages/@payaid/*`.

**Note:** This is a template structure. In the actual Phase 2 implementation, this will be a separate Next.js repository.

---

## 📋 **Routes**

### **Account Routes:**
- `GET /api/whatsapp/accounts` - List all WhatsApp accounts
- `POST /api/whatsapp/accounts` - Create a new WhatsApp account
- `GET /api/whatsapp/accounts/[id]` - Get an account
- `PATCH /api/whatsapp/accounts/[id]` - Update an account
- `DELETE /api/whatsapp/accounts/[id]` - Delete an account

### **Session Routes:**
- `GET /api/whatsapp/sessions` - List all sessions
- `POST /api/whatsapp/sessions` - Create a new session
- `GET /api/whatsapp/sessions/[id]` - Get a session
- `DELETE /api/whatsapp/sessions/[id]` - Delete a session

### **Template Routes:**
- `GET /api/whatsapp/templates` - List all templates
- `POST /api/whatsapp/templates` - Create a new template
- `GET /api/whatsapp/templates/[id]` - Get a template
- `DELETE /api/whatsapp/templates/[id]` - Delete a template

### **Message Routes:**
- `POST /api/whatsapp/messages/send` - Send a message
- `GET /api/whatsapp/messages` - List messages

### **Conversation Routes:**
- `GET /api/whatsapp/conversations` - List all conversations
- `GET /api/whatsapp/conversations/[id]` - Get a conversation
- `GET /api/whatsapp/conversations/[id]/messages` - Get conversation messages
- `POST /api/whatsapp/conversations/[id]/messages` - Send message in conversation

### **Analytics Routes:**
- `GET /api/whatsapp/analytics` - Get WhatsApp analytics

---

## 🔐 **Module Access**

All routes require the `whatsapp` or `marketing` module license. Routes use `requireModuleAccess(request, 'whatsapp')` or `requireModuleAccess(request, 'marketing')` from `@payaid/auth`.

---

**Status:** ⏳ **IN PROGRESS**

