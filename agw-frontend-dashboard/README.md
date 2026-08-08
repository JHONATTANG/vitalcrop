# agw-frontend-dashboard

Next.js 14 (App Router) dashboard for **VitalCrop AGW** — real-time IoT monitoring and actuator control.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript 5 |
| Styling | Tailwind CSS (always-dark) |
| Charts | Recharts |
| Auth | NextAuth.js v5 (Credentials + JWT) |
| State | Zustand |
| Data fetching | TanStack Query v5 (30s polling) |
| HTTP client | Axios with JWT interceptor |
| Icons | Lucide React |
| Animations | Framer Motion |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000   # VitalCrop Cloud API
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
API_URL=http://localhost:8000               # Server-side only
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/dashboard`.

### 4. Default credentials (from seed data)

| Field | Value |
|---|---|
| Email | `admin@vitalcrop.io` |
| Password | `VitalCrop2024!` |

---

## Project Structure

```
agw-frontend-dashboard/
├── app/
│   ├── layout.tsx              # Root layout: Inter font + Providers
│   ├── providers.tsx           # SessionProvider + QueryClientProvider
│   ├── globals.css             # Dark theme CSS vars + glassmorphism
│   ├── page.tsx                # → redirect /dashboard
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   └── login/page.tsx      # JWT login form
│   └── (dashboard)/
│       ├── layout.tsx          # Sidebar + Header shell
│       ├── dashboard/page.tsx  # Overview: metrics, grid, charts
│       ├── devices/
│       │   ├── page.tsx        # Device list
│       │   └── [deviceId]/page.tsx  # Detail + actuators + history
│       ├── commands/page.tsx   # Command center
│       └── alerts/page.tsx     # Alert center
├── components/
│   ├── layout/    Sidebar, Header, PageContainer
│   ├── dashboard/ MetricCard, DeviceStatusGrid, LiveChart, AlertsBanner
│   ├── devices/   DeviceCard, DeviceStatusBadge, SensorReadings, TelemetryChart
│   ├── commands/  CommandPanel, ActuatorControl, CommandHistory
│   └── alerts/    AlertsList, AlertItem
├── hooks/         useDevices, useLatestTelemetry, useTelemetryHistory, useCommands, useAlerts
├── lib/           api.ts (Axios), auth.ts (NextAuth), utils.ts
├── store/         useAppStore.ts (Zustand)
└── types/         device.ts, telemetry.ts, command.ts, alert.ts
```

---

## Design System

All colors are defined via Tailwind custom tokens (`tailwind.config.ts`):

| Token | Value | Usage |
|---|---|---|
| `bg.primary` | `#0A0F1E` | Page background |
| `bg.secondary` | `#111827` | Sidebar, header |
| `bg.card` | `#1A2235` | Elevated cards |
| `brand.border` | `#1F2D45` | All borders |
| `brand.green` | `#10B981` | Online, normal |
| `brand.blue` | `#3B82F6` | Actions, active links |
| `brand.yellow` | `#F59E0B` | Warnings |
| `brand.red` | `#EF4444` | Critical, errors |

### Glassmorphism

Use the `.glass` utility class (defined in `globals.css`) on any card or panel:

```css
.glass {
  backdrop-filter: blur(8px);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}
```

---

## Key Features

- **Live polling** — Telemetry cards refresh every 30s via TanStack Query
- **Partitioned time-range charts** — 1h / 6h / 24h / 7d / 30d with automatic bucket sizing
- **Actuator confirmation modal** — prevents accidental pump/valve commands
- **Critical alerts banner** — auto-dismisses on mark-read
- **Collapsible sidebar** — icon-only mode, state persisted in localStorage
- **Loading skeletons** — shimmer placeholders on every async section
- **Empty states** — illustrated zero-data screens

---

## Production Build

```bash
npm run build
npm start
```

---

## Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```
