# Evidens Clinic Assistant

A full-stack clinic management system and appointment booking assistant powered by AI, featuring an administrative dashboard and CRM synchronization.

---

## Overview
This application automates patient scheduling and clinic administrative workflows. Patients can book appointments through a conversational interface (supporting both text and voice input), while staff manage bookings and records through an interactive dashboard connected to external CRM platforms.

---

## Core Features
* **Automated Booking:** Handles patient scheduling and initial intake conversations automatically.
* **Voice Input Support:** Includes audio transcription to process voice notes into appointments.
* **Admin Dashboard:** Provides an interface to view, filter, and track daily appointment pipelines.
* **CRM Integration:** Syncs patient details and booking events with GoHighLevel and external webhooks.

---

## Tech Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS, Shadcn UI
* **Backend:** Node.js, Express, tRPC
* **Database:** PostgreSQL, Supabase, Drizzle ORM
* **External Services:** LLM API, Audio Transcription, GoHighLevel (GHL)

---

## Getting Started

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone [https://github.com/anasashqar/clinic-appointment-assistant.git](https://github.com/anasashqar/clinic-appointment-assistant.git)
cd clinic-appointment-assistant
pnpm install
