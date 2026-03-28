# GigAlertPro

A freelancer tool that helps users find and win gigs faster by monitoring Reddit and Discord communities for matching keywords.

## Features

- **Dashboard** – Track keywords, monitored sources, and latest gig opportunities at a glance
- **Gig Alerts** – Add/remove keywords and see matching gigs from 14+ Reddit & Discord sources
- **AI Proposal Helper** – Generate tailored proposals with one click; copy, edit, and save drafts
- **Profile Hub** – Build an editable portfolio with skills, testimonials, and links; preview public profile
- **Auth** – Sign in / sign up flow with persistent session

## Tech Stack

- **Frontend:** React 19 + Vite + TailwindCSS v4
- **Icons:** Lucide React
- **Backend/DB:** Supabase (mock for MVP)
- **Deployment:** Vercel-ready

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Supabase Setup (Optional for MVP)

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `.env.example` to `.env` and fill in your credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The MVP runs entirely with mock data and localStorage — Supabase is wired up but not required.

## Deploy to Vercel

```bash
npm run build
# Upload the `dist` folder or connect the repo to Vercel
```

## Design System

| Token  | Value   |
| ------ | ------- |
| Blue   | #2563EB |
| Purple | #7C3AED |
| Green  | #22C55E |
| Dark   | #020617 |
| Font   | Inter   |
