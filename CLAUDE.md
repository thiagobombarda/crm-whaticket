# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhaTicket é um sistema CRM de gerenciamento de tickets de suporte via WhatsApp. Permite múltiplos usuários gerenciando a mesma conta WhatsApp, suporte a múltiplas contas simultâneas e filas de atendimento.

## Architecture

Monorepo com `backend/` (Node.js/TypeScript) e `frontend/` (React/JavaScript).

**Stack:**
- Backend: Express.js + TypeScript + Sequelize 6 + PostgreSQL 17 + Socket.io 4 + Node 22
- Frontend: React 18 + Vite 6 + Material-UI v4 + Socket.io-client 4
- WhatsApp: @whiskeysockets/baileys (WebSocket-based, sem Puppeteer)
- Cache: Redis 8

**Request flow:** `HTTP → Routes → Controllers → Services → Models → DB`

Real-time updates via Socket.io (ticket changes, new messages, connection status).

### Key Data Models

- **Ticket** — atribuído a User, Contact, Whatsapp e Queue
- **Message** — pertence a Ticket e Contact
- **Whatsapp** — conta WhatsApp conectada; associada a Queues via WhatsappQueue
- **User** — associado a Queues via UserQueue
- **Queue** — fila de atendimento para roteamento de tickets

### Backend Structure

```
backend/src/
├── routes/        # Express router definitions
├── controllers/   # HTTP request handlers
├── services/      # Business logic (WbotServices/, TicketServices/, etc.)
├── models/        # Sequelize ORM models (12 models)
├── database/      # Config, migrations (41), seeds
├── libs/          # Socket.io and Redis setup
└── middleware/    # Auth, error handling
```

### Frontend Structure

```
frontend/src/
├── components/    # 44+ reusable components
├── pages/         # Full-page route components
├── context/       # React Context for state (Auth, Tickets, etc.)
├── hooks/         # Custom hooks
├── services/      # Axios API calls to backend
└── translate/     # i18next localization
```

## Development Commands

### Backend

```bash
cd backend
npm run dev          # Desenvolvimento com hot reload (ts-node-dev)
npm run build        # Compila TypeScript para dist/
npm start            # Produção com nodemon
npm run format       # Formata com Prettier
npm test             # Jest (inclui setup/teardown do banco de testes)

# Banco de dados
npm run db:migrate
npm run db:seed
```

### Frontend

```bash
cd frontend
npm run dev          # Vite dev server na porta 3000
npm run build        # Build de produção para build/
npm run preview      # Preview do build de produção
```

## Environment Configuration

**Backend** (`backend/.env` baseado em `.env.example`):
- `BACKEND_PORT` — porta do servidor (padrão 8080)
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — segredos JWT
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` — credenciais PostgreSQL
- `PROXY_PORT` — porta do proxy reverso (CORS)
- `BAILEYS_LOG_LEVEL` — nível de log do Baileys (padrão: error)

**Frontend** (`frontend/.env` baseado em `frontend/.env.example`):
- `VITE_BACKEND_URL` — URL do backend (padrão `http://localhost:8080/`)
- `VITE_HOURS_CLOSE_TICKETS_AUTO` — horas para fechar tickets automaticamente

## Database

Sequelize 6 com PostgreSQL 17. Timezone: `America/Sao_Paulo`.

Migrations em `backend/src/database/migrations/` (nomenclatura timestamp sequencial).

```bash
# Rollback
npx sequelize db:migrate:undo:all
```

## Testing (Backend)

O Jest está configurado no backend com hooks de pre/post test que fazem setup e teardown do banco de testes. Para rodar um teste específico:

```bash
cd backend
npx jest --testPathPattern=NomeDoArquivo
```

## Default Credentials

Após rodar as seeds: `admin@whaticket.com` / `admin`

## Docker

`docker-compose.yaml` na raiz orquestra backend, frontend, PostgreSQL 17, Redis 8 e Nginx como proxy reverso.
`docker-compose.phpmyadmin.yaml` fornece pgAdmin4 para administração do PostgreSQL.
