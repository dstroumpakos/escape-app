# Escape Room Business Portal — Complete Production Specification

> **Purpose:** Give this document to ChatGPT (or any AI assistant) to build a production-ready web-based business portal for the "UNLOCKED" escape room platform. The web portal shares the same Convex backend as the existing React Native mobile app — no backend changes needed.

---

## Table of Contents
1. [Tech Stack](#1-tech-stack)
2. [Environment & Convex Setup](#2-environment--convex-setup)
3. [Full Database Schema](#3-full-database-schema)
4. [Complete Convex API Reference (Exact Signatures)](#4-complete-convex-api-reference)
5. [Authentication & Session Management](#5-authentication--session-management)
6. [Design System & Theme](#6-design-system--theme)
7. [Internationalization (i18n)](#7-internationalization-i18n)
8. [Pages — Full Specification](#8-pages--full-specification)
9. [Business Logic Rules](#9-business-logic-rules)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Production Checklist](#11-production-checklist)
12. [File Structure](#12-file-structure)
13. [Implementation Order](#13-implementation-order)

---

## 1. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 14+** (App Router) | TypeScript, server components where possible |
| Styling | **Tailwind CSS** + **shadcn/ui** | Dark theme matching mobile app |
| Backend | **Convex** (already deployed) | Shared with mobile app — do NOT create new functions |
| Auth | Custom email/password | Uses `companies.loginCompany` mutation |
| Charts | **Recharts** | Dashboard analytics |
| Calendar | **react-day-picker** | Date picking throughout |
| Maps | **Google Maps** (`@react-google-maps/api`) or **Leaflet** | Room location picker |
| QR Scanner | **html5-qrcode** | Browser camera-based scanning |
| Form Validation | **zod** + **react-hook-form** | All forms need proper validation |
| Toasts | **sonner** (comes with shadcn) | Replace mobile Alert.alert() calls |
| State Management | Convex real-time queries | No additional state library needed |

---

## 2. Environment & Convex Setup

### Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-google-maps-api-key
```

The mobile app uses `EXPO_PUBLIC_CONVEX_URL` — the web portal must use the **same Convex deployment URL** but with the `NEXT_PUBLIC_` prefix for Next.js.

### Convex Client Setup

```typescript
// lib/convex.ts
import { ConvexReactClient } from "convex/react";

export const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!
);
```

### Root Layout Provider

```tsx
// app/layout.tsx
"use client";
import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convex";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ConvexProvider client={convex}>
          {children}
        </ConvexProvider>
      </body>
    </html>
  );
}
```

### Sharing the Convex Backend

The web portal needs access to the Convex functions. Two options:

**Option A (recommended):** Copy (or symlink) the `/convex` folder from the mobile app into the web project root. The `_generated` folder contains the typed API.

**Option B:** If using a monorepo, import from the shared `convex/` directory.

The import pattern:
```typescript
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
```

---

## 3. Full Database Schema

```typescript
// ─── companies ───
{
  _id: Id<"companies">,
  name: string,
  email: string,
  phone: string,
  logo: string,                    // URL or empty string ""
  address: string,
  city: string,
  vatNumber?: string,
  description: string,
  password: string,                // plain text (legacy — hash in production!)
  verified: boolean,
  createdAt: number,               // Date.now() timestamp
  // Subscription offering (to players, not for the company itself)
  subscriptionEnabled: boolean,
  subscriptionMonthlyPrice?: number,
  subscriptionYearlyPrice?: number,
  subscriptionPerks?: string[],
  // Onboarding
  onboardingStatus?: "pending_terms" | "pending_plan" | "pending_review" | "approved" | "declined",
  termsAcceptedAt?: number,
  platformPlan?: "starter" | "pro" | "enterprise",
  platformSubscribedAt?: number,
  adminNotes?: string,             // Set by admin on decline
  reviewedAt?: number,
}
// Index: by_email

// ─── rooms ───
{
  _id: Id<"rooms">,
  title: string,
  location: string,                // Human-readable address
  image: string,                   // Cover image URL
  images?: string[],               // Additional photo URLs
  rating: number,                  // 0-5, starts at 0
  reviews: number,                 // Count, starts at 0
  duration: number,                // Minutes (e.g., 60, 90)
  difficulty: number,              // 1-5
  maxDifficulty: number,           // Usually 5
  players: string,                 // Display string like "2-6"
  playersMin: number,              // e.g., 2
  playersMax: number,              // e.g., 6
  price: number,                   // Base price per person in €
  pricePerGroup?: { players: number, price: number }[], // Per-player-count pricing
  theme: string,                   // "Horror" | "Sci-Fi" | "Mystery" | "Historical" | "Fantasy" | "Adventure"
  tags: string[],                  // e.g., ["Team Building", "Scary", "Puzzle Heavy"]
  description: string,
  story: string,                   // Backstory / narrative
  isNew?: boolean,
  isFeatured?: boolean,
  isTrending?: boolean,
  companyId?: Id<"companies">,
  paymentTerms?: ("full" | "deposit_20" | "pay_on_arrival")[] | "full" | "deposit_20" | "pay_on_arrival",
  termsOfUse?: string,
  isSubscriptionOnly?: boolean,
  isActive?: boolean,              // true = live, false = paused
  bookingMode?: "unlocked_primary" | "external_primary",
  latitude?: number,
  longitude?: number,
  operatingDays?: number[],        // 0=Sunday, 1=Monday, ..., 6=Saturday
  defaultTimeSlots?: { time: string, price: number }[],
  overflowSlot?: {
    time: string,
    price: number,
    pricePerGroup?: { players: number, price: number }[],
    days: number[],                // Which days overflow applies
  },
}
// Indexes: by_theme, by_featured, by_trending, by_company

// ─── timeSlots ───
{
  _id: Id<"timeSlots">,
  roomId: Id<"rooms">,
  date: string,                    // "YYYY-MM-DD" format
  time: string,                    // "HH:MM" 24-hour format
  available: boolean,
  price: number,                   // Can differ from room base price (discounts)
  pricePerGroup?: { players: number, price: number }[],
}
// Index: by_room_date [roomId, date]

// ─── bookings ───
{
  _id: Id<"bookings">,
  userId?: Id<"users">,            // Optional — external bookings don't have one
  roomId: Id<"rooms">,
  date: string,                    // "YYYY-MM-DD"
  time: string,                    // "HH:MM"
  players: number,
  total: number,                   // Total price in €
  status: "upcoming" | "completed" | "cancelled",
  bookingCode: string,             // "UNL-XXXXXX" or "EXT-XXXXXX"
  createdAt: number,               // Date.now()
  depositPaid?: number,            // Amount paid as deposit
  paymentTerms?: "full" | "deposit_20" | "pay_on_arrival",
  companyId?: Id<"companies">,
  source?: "unlocked" | "external",
  externalSource?: string,         // "EscapeAll" | "Phone" | "Walk-in" | "Private Event"
  playerName?: string,
  playerContact?: string,          // Email or phone
  notes?: string,
  paymentStatus?: "paid" | "deposit" | "unpaid" | "na",
}
// Indexes: by_user, by_user_status, by_room, by_company, by_room_date

// ─── users ─── (read-only from portal — these are players)
{
  _id: Id<"users">,
  name: string,
  email: string,
  avatar: string,
  title: string,
  memberSince: string,
  played: number,
  escaped: number,
  awards: number,
  wishlist: Id<"rooms">[],
}

// ─── playerSubscriptions ───
{
  _id: Id<"playerSubscriptions">,
  userId: Id<"users">,
  companyId: Id<"companies">,
  plan: "monthly" | "yearly",
  price: number,
  startDate: string,
  endDate: string,
  isActive: boolean,
}

// ─── posts ─── (social feed — company can post)
{
  _id: Id<"posts">,
  authorType: "user" | "company",
  authorUserId?: Id<"users">,
  authorCompanyId?: Id<"companies">,
  text: string,
  media: { type: "image" | "video", url: string, storageId?: Id<"_storage"> }[],
  roomId?: Id<"rooms">,
  rating?: number,
  likes: number,
  createdAt: number,
}

// ─── notifications ─── (player notifications — portal reads only)
// ─── slotAlerts ─── (player slot alerts — portal doesn't interact)
```

---

## 4. Complete Convex API Reference

### Every function the portal must use, with exact argument types:

```typescript
// ═══════════════════════════════════════════════════════════════
// AUTH & PROFILE
// ═══════════════════════════════════════════════════════════════

// Login — mutation (not query!) — throws on bad credentials
api.companies.loginCompany
  Args: { email: string, password: string }
  Returns: { _id: Id<"companies">, name: string, onboardingStatus: string }
  Errors: "No business account found with this email" | "Incorrect password"

// Register
api.companies.register
  Args: { name: string, email: string, phone: string, address: string, city: string, vatNumber?: string, description: string, password: string }
  Returns: { id: Id<"companies"> } | { error: "Email already registered" }

// Get company by ID
api.companies.getById
  Args: { id: Id<"companies"> }
  Returns: Company doc (with onboardingStatus defaulting to "approved" if missing) | null

// Update profile
api.companies.updateProfile
  Args: { id: Id<"companies">, name: string, phone: string, address: string, city: string, vatNumber?: string, description: string, logo?: string }

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════

// Step 1: Accept terms → status becomes "pending_plan"
api.companies.acceptTerms
  Args: { companyId: Id<"companies"> }

// Step 2: Select plan → status becomes "pending_review"  
api.companies.selectPlan
  Args: { companyId: Id<"companies">, plan: "starter" | "pro" | "enterprise" }

// Resubmit after decline → status becomes "pending_review"
api.companies.resubmitForReview
  Args: { companyId: Id<"companies"> }

// ═══════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════

// Overall stats (all time)
api.companies.getDashboardStats
  Args: { companyId: Id<"companies"> }
  Returns: { totalRooms, activeRooms, totalBookings, upcomingBookings, totalRevenue, subscribers }

// Today's stats (pass today's date)
api.companies.getTodayStats
  Args: { companyId: Id<"companies">, date: string }  // date = "YYYY-MM-DD"
  Returns: { totalBookings, unlockedBookings, externalBookings, revenue, totalSlots, availableSlots, activeRooms }

// ═══════════════════════════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// List all rooms for company
api.companies.getRooms
  Args: { companyId: Id<"companies"> }
  Returns: Room[]

// Create room (all required fields)
api.companies.createRoom
  Args: {
    companyId: Id<"companies">,
    title: string,
    location: string,
    image: string,
    images?: string[],
    duration: number,
    difficulty: number,
    maxDifficulty: number,         // Usually set to 5
    players: string,               // Display string like "2-6"
    playersMin: number,
    playersMax: number,
    price: number,
    pricePerGroup?: { players: number, price: number }[],
    theme: string,
    tags: string[],
    description: string,
    story: string,
    paymentTerms: ("full" | "deposit_20" | "pay_on_arrival")[],  // Array, NOT single value
    termsOfUse?: string,
    isSubscriptionOnly?: boolean,
    bookingMode?: "unlocked_primary" | "external_primary",
    latitude?: number,
    longitude?: number,
    operatingDays?: number[],
    defaultTimeSlots?: { time: string, price: number }[],
    overflowSlot?: { time: string, price: number, pricePerGroup?: { players: number, price: number }[], days: number[] },
  }
  Returns: Id<"rooms">
  Note: Auto-sets rating=0, reviews=0, isNew=true, isFeatured=false, isTrending=false, isActive=true

// Update room (all fields optional except roomId)
api.companies.updateRoom
  Args: {
    roomId: Id<"rooms">,
    title?: string,
    location?: string,
    image?: string,
    images?: string[],
    duration?: number,
    difficulty?: number,
    players?: string,
    playersMin?: number,
    playersMax?: number,
    price?: number,
    pricePerGroup?: { players: number, price: number }[],
    theme?: string,
    tags?: string[],
    description?: string,
    story?: string,
    paymentTerms?: ("full" | "deposit_20" | "pay_on_arrival")[],
    termsOfUse?: string,
    isSubscriptionOnly?: boolean,
    bookingMode?: "unlocked_primary" | "external_primary",
    latitude?: number,
    longitude?: number,
    operatingDays?: number[],
    defaultTimeSlots?: { time: string, price: number }[],
    overflowSlot?: { time: string, price: number, pricePerGroup?: { players: number, price: number }[], days: number[] },
    isActive?: boolean,
  }

// Delete room (also deletes all its time slots)
api.companies.deleteRoom
  Args: { roomId: Id<"rooms"> }

// Get single room
api.rooms.getById
  Args: { id: Id<"rooms"> }
  Returns: Room | null

// ═══════════════════════════════════════════════════════════════
// TIME SLOT / AVAILABILITY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// Get slots for a room on a specific date
api.companies.getRoomSlots
  Args: { roomId: Id<"rooms">, date: string }
  Returns: TimeSlot[]

// Replace all slots for a room+date (delete existing, insert new)
api.companies.setSlots
  Args: {
    roomId: Id<"rooms">,
    date: string,
    slots: { time: string, price: number, available: boolean, pricePerGroup?: { players: number, price: number }[] }[]
  }

// ═══════════════════════════════════════════════════════════════
// BOOKING MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// Get all bookings for a date (enriched with room title + player name)
api.companies.getBookingsByDate
  Args: { companyId: Id<"companies">, date: string }
  Returns: Booking[] (sorted by time, enriched with roomTitle, playerName, source)

// Get full booking detail
api.companies.getBookingDetail
  Args: { bookingId: Id<"bookings"> }
  Returns: { ...booking, roomTitle, roomImage, playerName, playerContact, source } | null

// Create unlocked booking (admin manual)
api.companies.createAdminBooking
  Args: {
    companyId: Id<"companies">,
    roomId: Id<"rooms">,
    date: string,
    time: string,
    players: number,
    playerName: string,
    playerContact?: string,
    notes?: string,
    total: number,
  }
  Returns: { id: Id<"bookings">, bookingCode: string }
  Errors: "This time slot is already booked" | "Access denied: room does not belong to your company"

// Create external block (EscapeAll, Phone, Walk-in, Private Event)
api.companies.createExternalBlock
  Args: {
    companyId: Id<"companies">,
    roomId: Id<"rooms">,
    date: string,
    time: string,
    externalSource: string,        // "EscapeAll" | "Phone" | "Walk-in" | "Private Event"
    playerName?: string,
    players?: number,
    notes?: string,
  }
  Returns: { id: Id<"bookings">, bookingCode: string }
  Errors: "This time slot is already booked or blocked"

// Cancel booking (with ownership guard)
api.companies.adminCancelBooking
  Args: { companyId: Id<"companies">, bookingId: Id<"bookings"> }
  Errors: "Access denied: booking does not belong to your company"

// Reschedule booking (with conflict check)
api.companies.adminRescheduleBooking
  Args: { companyId: Id<"companies">, bookingId: Id<"bookings">, newDate: string, newTime: string }
  Errors: "The new time slot is already booked"

// Update booking notes
api.companies.updateBookingNotes
  Args: { companyId: Id<"companies">, bookingId: Id<"bookings">, notes: string }

// ═══════════════════════════════════════════════════════════════
// QR SCANNER
// ═══════════════════════════════════════════════════════════════

// Look up booking by code (for QR validation)
api.bookings.getByCode
  Args: { bookingCode: string }
  Returns: { ...booking, room: Room, playerName: string } | null

// Mark booking as completed
api.bookings.complete
  Args: { id: Id<"bookings"> }

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT (for players)
// ═══════════════════════════════════════════════════════════════

// Update subscription settings
api.companies.updateSubscription
  Args: { companyId: Id<"companies">, subscriptionEnabled: boolean, subscriptionMonthlyPrice?: number, subscriptionYearlyPrice?: number, subscriptionPerks?: string[] }

// Get subscriber list
api.companies.getSubscribers
  Args: { companyId: Id<"companies"> }
  Returns: { ...subscription, userName: string, userEmail: string }[]

// ═══════════════════════════════════════════════════════════════
// ADMIN PANEL (super-admin only)
// ═══════════════════════════════════════════════════════════════

// List all companies
api.companies.getAllCompanies
  Args: {} (no arguments)
  Returns: Company[] (with onboardingStatus defaulting to "approved" if missing)

// Approve company
api.companies.approveCompany
  Args: { companyId: Id<"companies"> }

// Decline company with notes
api.companies.declineCompany
  Args: { companyId: Id<"companies">, notes: string }

// ═══════════════════════════════════════════════════════════════
// ALSO AVAILABLE (may be useful)
// ═══════════════════════════════════════════════════════════════

// Get booked times for a room+date (array of time strings)
api.bookings.getBookedTimes
  Args: { roomId: Id<"rooms">, date: string }
  Returns: string[]   // e.g., ["14:00", "16:00"]

// Get all company bookings (all time, sorted by newest)
api.companies.getBookings
  Args: { companyId: Id<"companies"> }
  Returns: Array<Booking & { roomTitle: string }>

// Get slots for a room+date (player-facing, same data as companies.getRoomSlots)
api.timeSlots.getByRoomAndDate
  Args: { roomId: Id<"rooms">, date: string }
  Returns: TimeSlot[]

// Toggle a single slot's availability (simple toggle without replacing all slots)
api.timeSlots.setAvailability
  Args: { id: Id<"timeSlots">, available: boolean }
```

---

## 5. Authentication & Session Management

### Login Flow
1. User enters email + password on `/login`
2. Call `companies.loginCompany` mutation
3. On success, receive `{ _id, name, onboardingStatus }`
4. Store in **localStorage**:
   ```typescript
   localStorage.setItem('companyId', result._id);
   localStorage.setItem('companyName', result.name);
   ```
5. **Redirect** based on `onboardingStatus`:
   - `"approved"` → `/dashboard`
   - `"pending_terms"` | `"pending_plan"` | `"pending_review"` | `"declined"` → `/onboarding`

### Session Persistence
```typescript
// lib/auth.ts
export function getCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('companyId');
}

export function getCompanyName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('companyName');
}

export function logout() {
  localStorage.removeItem('companyId');
  localStorage.removeItem('companyName');
  window.location.href = '/login';
}

export function isLoggedIn(): boolean {
  return !!getCompanyId();
}
```

### Auth Guard Component
```tsx
// components/AuthGuard.tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCompanyId } from "@/lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  
  useEffect(() => {
    if (!getCompanyId()) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, []);
  
  if (!ready) return null; // or loading spinner
  return <>{children}</>;
}
```

### Admin Access
In the mobile app, admin access is granted to a **hardcoded Apple private relay email**: `apple_001386.f@private.relay`. For the web portal, use a different approach:

```typescript
// lib/auth.ts
const ADMIN_EMAILS = ['your-admin-email@example.com']; // Set your actual admin email

export function isAdmin(companyEmail: string): boolean {
  return ADMIN_EMAILS.includes(companyEmail.toLowerCase());
}
```

The admin panel (`/admin`) should only be visible in the sidebar and accessible if the logged-in company email matches an admin email. The Convex functions `getAllCompanies`, `approveCompany`, and `declineCompany` have **no server-side admin check** — they rely on the client hiding the UI. You may want to add server-side checks later.

---

## 6. Design System & Theme

The mobile app uses a **dark red/crimson** theme. Here are the exact values from the mobile app:

```typescript
// Mobile app theme (src/theme.ts)
const mobileTheme = {
  colors: {
    bgPrimary: '#1A0D0D',        // Deep dark burgundy
    bgSecondary: '#300909',      // Slightly lighter dark red
    bgCard: 'rgba(50, 20, 20, 0.8)', // Card with transparency
    bgCardSolid: '#2A1212',      // Solid card background
    redPrimary: '#FF1E1E',       // Primary action color (bright red)
    redDark: '#CC1818',          // Darker red variant
    redGlow: 'rgba(255, 30, 30, 0.4)',
    redSubtle: 'rgba(255, 30, 30, 0.15)',
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
    textMuted: '#666666',
    success: '#4CAF50',
    warning: '#FFA726',
    border: 'rgba(255, 255, 255, 0.08)',
    glass: 'rgba(255, 255, 255, 0.05)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
    gold: '#FFD700',
  },
};
```

### Web Portal Tailwind Config

Translate the mobile theme to Tailwind CSS custom colors:

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: '#1A0D0D',
        'bg-secondary': '#300909',
        'bg-card': '#2A1212',
        primary: '#FF1E1E',
        'primary-dark': '#CC1818',
        'primary-subtle': 'rgba(255, 30, 30, 0.15)',
        'text-primary': '#FFFFFF',
        'text-secondary': '#A0A0A0',
        'text-muted': '#666666',
        success: '#4CAF50',
        warning: '#FFA726',
        gold: '#FFD700',
        border: 'rgba(255, 255, 255, 0.08)',
        glass: 'rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

### Typography
- **Font:** Inter (Google Fonts) — clean sans-serif
- **Headers:** Bold, white
- **Body:** Regular, white or secondary gray
- **Muted labels:** `#666666`

### Component Styling Rules
- Cards: `bg-bg-card rounded-xl border border-border p-4`
- Buttons (primary): `bg-primary hover:bg-primary-dark text-white rounded-lg`
- Inputs: Dark background, subtle border, white text
- Badges: Colored background with matching text (green/success, orange/warning, red/error)
- Sidebar: Fixed left, `bg-bg-secondary`, active item highlighted with primary color

---

## 7. Internationalization (i18n)

The mobile app supports **English (en)** and **Greek (el)**, defaulting to Greek. The web portal should support the same:

### Translation System
```typescript
// lib/i18n.ts
type Language = 'en' | 'el';

const translations: Record<Language, Record<string, string>> = {
  en: {
    // All English strings — see full key dump below
    'dashboard.welcome': 'Welcome back,',
    'dashboard.todaySchedule': "Today's Schedule",
    // ... 800+ keys (complete list in next section)
  },
  el: {
    'dashboard.welcome': 'Καλώς ήρθες,',
    'dashboard.todaySchedule': 'Σημερινό Πρόγραμμα',
    // ... Greek translations — copy from mobile app's src/i18n/translations.ts
  },
};
```

### Complete i18n Keys for Company/Portal Screens

Below is **every** English translation key used by company screens. Copy these exactly. The Greek translations are in the mobile app's `src/i18n/translations.ts` (lines 800–1588).

```typescript
// ── Themes ──
'theme.horror': 'Horror',
'theme.sciFi': 'Sci-Fi',
'theme.mystery': 'Mystery',
'theme.historical': 'Historical',
'theme.fantasy': 'Fantasy',
'theme.adventure': 'Adventure',

// ── Experience Tags ──
'tag.horrorTheme': 'Horror Theme',
'tag.sciFiTheme': 'Sci-Fi Theme',
'tag.mysteryTheme': 'Mystery Theme',
'tag.historicalTheme': 'Historical Theme',
'tag.liveActor': 'Live Actor',
'tag.physicalPuzzles': 'Physical Puzzles',
'tag.multiRoom': 'Multi-room',
'tag.highTech': 'High-Tech Puzzles',
'tag.neon': 'Neon Atmosphere',
'tag.teamChallenge': 'Team Challenge',
'tag.atmospheric': 'Atmospheric',
'tag.beginnerFriendly': 'Beginner Friendly',
'tag.enchanted': 'Enchanted',
'tag.storyDriven': 'Story-Driven',
'tag.zeroG': 'Zero-G Simulation',
'tag.immersiveSound': 'Immersive Sound',
'tag.darkTheme': 'Dark Theme',
'tag.familyFriendly': 'Family Friendly',
'tag.vrEnhanced': 'VR Enhanced',
'tag.timePressure': 'Time Pressure',

// ── Days of week ──
'day.sun': 'Sun',
'day.mon': 'Mon',
'day.tue': 'Tue',
'day.wed': 'Wed',
'day.thu': 'Thu',
'day.fri': 'Fri',
'day.sat': 'Sat',

// ── Difficulty ──
'difficulty.1': 'Easy',
'difficulty.2': 'Medium',
'difficulty.3': 'Hard',
'difficulty.4': 'Expert',
'difficulty.5': 'Expert',

// ── Generic ──
'cancel': 'Cancel',
'ok': 'OK',
'save': 'Save',
'delete': 'Delete',
'error': 'Error',
'success': 'Success',
'loading': 'Loading...',
'saving': 'Saving...',
'confirm': 'Confirm',
'done': 'Done',
'players': 'players',

// ── CompanyAuth ──
'companyAuth.title': 'Business Portal',
'companyAuth.subtitle': 'Manage your escape rooms',
'companyAuth.signIn': 'Sign In',
'companyAuth.register': 'Register',
'companyAuth.companyName': 'Company Name *',
'companyAuth.companyPlaceholder': 'Your escape room business name',
'companyAuth.phone': 'Phone *',
'companyAuth.phonePlaceholder': '+1 (555) 000-0000',
'companyAuth.city': 'City *',
'companyAuth.cityPlaceholder': 'San Francisco, CA',
'companyAuth.address': 'Address',
'companyAuth.addressPlaceholder': '123 Main St',
'companyAuth.vatNumber': 'ΑΦΜ (Tax ID)',
'companyAuth.vatPlaceholder': '123456789',
'companyAuth.about': 'About Your Business',
'companyAuth.aboutPlaceholder': 'Tell players about your escape room business...',
'companyAuth.email': 'Email *',
'companyAuth.emailPlaceholder': 'business@example.com',
'companyAuth.password': 'Password *',
'companyAuth.passwordPlaceholder': 'Enter your password',
'companyAuth.pleaseWait': 'Please wait...',
'companyAuth.createAccount': 'Create Account',
'companyAuth.emailPassRequired': 'Please enter email and password.',
'companyAuth.loginFailed': 'Login failed. Please try again.',
'companyAuth.fillRequired': 'Please fill in all required fields.',
'companyAuth.accountCreated': 'Account created! Complete the onboarding steps to get started.',
'companyAuth.registrationFailed': 'Registration failed. Please try again.',

// ── Dashboard ──
'dashboard.welcome': 'Welcome back,',
'dashboard.overview': 'Overview',
'dashboard.totalBookings': 'Total Bookings',
'dashboard.upcoming': 'Upcoming',
'dashboard.totalRevenue': 'Total Revenue',
'dashboard.todayStats': "Today's Stats",
'dashboard.bookings': 'Bookings',
'dashboard.available': 'Available',
'dashboard.revenue': 'Revenue',
'dashboard.unlockedSource': '{{n}} UNLOCKED',
'dashboard.externalSource': '{{n}} External',
'dashboard.activeRooms': '{{n}} Active Rooms',
'dashboard.todaySchedule': "Today's Schedule",
'dashboard.noBookingsToday': 'No Bookings Today',
'dashboard.noBookingsHint': 'Tap + to add a booking or block a slot',
'dashboard.unlocked': 'UNLOCKED',
'dashboard.paid': 'PAID',
'dashboard.deposit': 'DEPOSIT',
'dashboard.unpaid': 'UNPAID',

// ── QR Scanner ──
'scanner.title': 'Scan Booking QR',
'scanner.cameraRequired': 'Camera Access Required',
'scanner.cameraRequiredMsg': 'We need camera access to scan booking QR codes.',
'scanner.grantAccess': 'Grant Camera Access',
'scanner.close': 'Close',
'scanner.scanHint': 'Point camera at the booking QR code',
'scanner.lookingUp': 'Looking up booking…',
'scanner.notFound': 'Booking Not Found',
'scanner.notFoundMsg': 'No booking matches this QR code. It may be invalid or expired.',
'scanner.statusValid': 'VALID',
'scanner.statusUsed': 'ALREADY USED',
'scanner.statusCancelled': 'CANCELLED',
'scanner.validate': 'Validate & Mark Arrived',
'scanner.scanAgain': 'Scan Another',
'scanner.validated': 'Booking Validated!',
'scanner.validatedMsg': 'The booking has been marked as completed.',
'scanner.alreadyUsed': 'Already Validated',
'scanner.alreadyUsedMsg': 'This booking has already been used.',
'scanner.cancelled': 'Booking Cancelled',
'scanner.cancelledMsg': 'This booking was cancelled and cannot be validated.',
'scanner.error': 'Error',
'scanner.notYourBooking': 'This booking belongs to a different company.',
'scanner.validateFailed': 'Failed to validate booking. Please try again.',

// ── CompanyRoomsList ──
'roomsList.title': 'My Rooms',
'roomsList.noRooms': 'No Rooms Yet',
'roomsList.noRoomsHint': 'Tap + to add your first escape room',
'roomsList.subOnly': 'Sub Only',
'roomsList.deposit': '20% deposit',
'roomsList.payOnArrival': 'Pay on arrival',
'roomsList.fullPayment': 'Full payment',
'roomsList.slots': '{{n}} slots',
'roomsList.edit': 'Edit',
'roomsList.slotsBtn': 'Slots',
'roomsList.pause': 'Pause',
'roomsList.activate': 'Activate',
'roomsList.deleteTitle': 'Delete Room',
'roomsList.deleteMessage': 'Are you sure you want to delete "{{title}}"? This cannot be undone.',

// ── CompanyRoomEditor ──
'roomEditor.editTitle': 'Edit Room',
'roomEditor.addTitle': 'Add New Room',
'roomEditor.basicInfo': 'Basic Information',
'roomEditor.roomName': 'Room Name *',
'roomEditor.roomNamePlaceholder': 'e.g. The Haunted Manor',
'roomEditor.location': 'Location *',
'roomEditor.locationPlaceholder': 'San Francisco, CA',
'roomEditor.pinLocation': 'Pin Location on Map',
'roomEditor.tapMap': 'Tap the map to place a pin',
'roomEditor.coverImage': 'Cover Image URL',
'roomEditor.coverPlaceholder': 'https://...',
'roomEditor.description': 'Description',
'roomEditor.descPlaceholder': 'A brief description of the room...',
'roomEditor.story': 'The Story',
'roomEditor.storyPlaceholder': 'The immersive backstory players will read...',
'roomEditor.roomDetails': 'Room Details',
'roomEditor.duration': 'Duration (min)',
'roomEditor.basePrice': 'Base Price (€) *',
'roomEditor.minPlayers': 'Min Players',
'roomEditor.maxPlayers': 'Max Players',
'roomEditor.groupPrice': 'Price per Group Size',
'roomEditor.groupPriceHint': 'Set different prices for each group size. Leave empty to use base price.',
'roomEditor.difficulty': 'Difficulty ({{n}}/5)',
'roomEditor.themeSection': 'Theme',
'roomEditor.tagsSection': 'Experience Tags',
'roomEditor.operatingDays': 'Operating Days',
'roomEditor.operatingDaysHint': 'Select which days of the week this room is open',
'roomEditor.defaultSlots': 'Default Time Slots',
'roomEditor.slotsHint': 'Group pricing from Room Details applies to all slots. Set a different base price on a slot to offer a discount — players will see the % off.',
'roomEditor.slotPlaceholder': 'e.g. 9:00 AM',
'roomEditor.add': 'Add',
'roomEditor.slotError': 'Enter a time for the new slot (e.g. 9:00 AM)',
'roomEditor.overflowSlot': 'Overflow Slot',
'roomEditor.overflowHint': 'A bonus time slot that automatically opens when all regular slots for a date are fully booked.',
'roomEditor.enabled': 'Enabled',
'roomEditor.disabled': 'Disabled',
'roomEditor.activeDays': 'Active Days',
'roomEditor.time': 'Time',
'roomEditor.timePlaceholder': 'e.g. 10:00 PM',
'roomEditor.overflowBasePrice': 'Base Price',
'roomEditor.overflowGroupPrice': 'Price per Group Size',
'roomEditor.overflowGroupHint': 'Leave empty to use base overflow price.',
'roomEditor.paymentTerms': 'Payment Terms (select up to 2)',
'roomEditor.fullPaymentTitle': 'Full Payment',
'roomEditor.fullPaymentDesc': 'Players pay 100% when booking',
'roomEditor.depositTitle': '20% Deposit',
'roomEditor.depositDesc': 'Players pay 20% now, rest on arrival',
'roomEditor.payOnArrivalTitle': 'Pay on Arrival',
'roomEditor.payOnArrivalDesc': 'No online payment — players pay at the venue',
'roomEditor.termsOfUse': 'Terms of Use',
'roomEditor.termsPlaceholder': 'Enter your room\'s terms and conditions...',
'roomEditor.termsTemplates': 'Quick Templates',
'roomEditor.tplStandard': 'Standard',
'roomEditor.tplStrict': 'Strict',
'roomEditor.tplFlexible': 'Flexible',
'roomEditor.tplMinors': 'Minors Policy',
'roomEditor.bookingMode': 'Booking Mode',
'roomEditor.unlockedPrimary': 'UNLOCKED Primary',
'roomEditor.unlockedPrimaryDesc': 'Bookings come through the UNLOCKED app. You can also add external blocks manually.',
'roomEditor.externalPrimary': 'External Primary',
'roomEditor.externalPrimaryDesc': 'You manage bookings externally (EscapeAll, phone, etc.) and block slots here. Transition mode.',
'roomEditor.subscriptionAccess': 'Subscription Access',
'roomEditor.subOnly': 'Subscription Only',
'roomEditor.subOnlyDesc': 'Only subscribers can see and book this room. Great for exclusive experiences.',
'roomEditor.requiredFields': 'Title, location and price are required.',
'roomEditor.paymentRequired': 'Please select at least one payment term.',
'roomEditor.roomUpdated': 'Room updated!',
'roomEditor.roomCreated': 'Room created!',
'roomEditor.saveFailed': 'Failed to save room. Please try again.',
'roomEditor.updateRoom': 'Update Room',
'roomEditor.createRoom': 'Create Room',

// ── CompanyBookings ──
'companyBookings.title': 'Calendar',
'companyBookings.bookings': '{{n}} bookings',
'companyBookings.noActiveRooms': 'No Active Rooms',
'companyBookings.noActiveRoomsHint': 'Add rooms to start managing bookings',
'companyBookings.bookedCount': '{{n}} booked',
'companyBookings.noBookings': 'No bookings',
'companyBookings.add': '+ Add',
'companyBookings.unlocked': 'UNLOCKED',
'companyBookings.playersCount': '{{n}} players',

// ── CompanyBookingDetail ──
'bookingDetail.title': 'Booking Detail',
'bookingDetail.externalBadge': 'External — {{source}}',
'bookingDetail.unlockedBadge': 'UNLOCKED Booking',
'bookingDetail.room': 'Room',
'bookingDetail.date': 'Date',
'bookingDetail.time': 'Time',
'bookingDetail.playerInfo': 'Player Information',
'bookingDetail.playersCount': '{{n}} players',
'bookingDetail.payment': 'Payment',
'bookingDetail.depositNote': '20% deposit terms',
'bookingDetail.payOnArrivalNote': 'Pay on arrival',
'bookingDetail.bookingCode': 'Booking Code',
'bookingDetail.notes': 'Internal Notes',
'bookingDetail.notesPlaceholder': 'Add internal notes about this booking...',
'bookingDetail.saveNotes': 'Save Notes',
'bookingDetail.reschedule': 'Reschedule',
'bookingDetail.rescheduleTo': 'Reschedule To',
'bookingDetail.datePlaceholder': 'YYYY-MM-DD',
'bookingDetail.timePlaceholder': '3:00 PM',
'bookingDetail.cancelBookingTitle': 'Cancel Booking',
'bookingDetail.cancelMessage': 'Cancel this {{type}}? This cannot be undone.',
'bookingDetail.keep': 'Keep',
'bookingDetail.cancelBookingBtn': 'Cancel Booking',
'bookingDetail.bookingCancelled': 'Booking cancelled.',
'bookingDetail.cancelFailed': 'Failed to cancel.',
'bookingDetail.enterBothFields': 'Enter both new date (YYYY-MM-DD) and time.',
'bookingDetail.rescheduled': 'Booking rescheduled.',
'bookingDetail.rescheduleFailed': 'Failed to reschedule.',
'bookingDetail.notesSaved': 'Notes updated.',
'bookingDetail.notesFailed': 'Failed to save notes.',
'bookingDetail.externalBlock': 'external block',
'bookingDetail.booking': 'booking',

// ── CompanyAvailability ──
'availability.title': 'Availability',
'availability.slotsTitle': 'Time Slots — {{month}} {{day}}',
'availability.overflowBanner': 'All slots booked — overflow slot ({{time}} · €{{price}}) is now visible to players',
'availability.discountBreakdown': 'Discount Breakdown',
'availability.playersCount': '{{n}} players',
'availability.copyWeek': 'Copy to next 7 days',
'availability.saveSlots': 'Save Slots',
'availability.saved': 'Saved',
'availability.savedMessage': 'Time slots for {{month}} {{day}} saved.',
'availability.saveFailed': 'Failed to save slots.',
'availability.copied': 'Slots copied to the next 7 days.',
'availability.copyFailed': 'Failed to copy slots.',

// ── CompanyAddBooking ──
'addBooking.title': 'Add Booking',
'addBooking.unlockedBooking': 'UNLOCKED Booking',
'addBooking.externalBlock': 'External Block',
'addBooking.externalInfo': 'External blocks reserve the slot without collecting payment. Use for EscapeAll, phone, or walk-in bookings.',
'addBooking.source': 'Booking Source',
'addBooking.escapeAll': 'EscapeAll',
'addBooking.phone': 'Phone',
'addBooking.walkIn': 'Walk-in',
'addBooking.privateEvent': 'Private Event',
'addBooking.room': 'Room *',
'addBooking.date': 'Date *',
'addBooking.datePlaceholder': 'YYYY-MM-DD',
'addBooking.time': 'Time *',
'addBooking.timePlaceholder': 'e.g. 3:00 PM',
'addBooking.playerName': 'Player Name *',
'addBooking.nameOptional': 'Name (optional)',
'addBooking.namePlaceholder': 'Enter player name',
'addBooking.contact': 'Contact (email/phone)',
'addBooking.contactPlaceholder': 'player@email.com',
'addBooking.players': 'Players',
'addBooking.totalPrice': 'Total (€)',
'addBooking.totalPlaceholder': '0.00',
'addBooking.notes': 'Notes',
'addBooking.notesPlaceholder': 'Internal notes…',
'addBooking.blockSlot': 'Block Slot',
'addBooking.createBooking': 'Create Booking',
'addBooking.selectRoom': 'Select a room.',
'addBooking.enterDate': 'Enter a date.',
'addBooking.selectTime': 'Select or enter a time.',
'addBooking.enterName': 'Enter the player name.',
'addBooking.bookingCreated': 'Booking Created',
'addBooking.codeMessage': 'Code: {{code}}',
'addBooking.slotBlocked': 'Slot Blocked',
'addBooking.externalCode': 'External block created: {{code}}',
'addBooking.createFailed': 'Failed to create booking.',

// ── CompanySettings ──
'settings.title': 'Settings',
'settings.verified': 'Verified Business',
'settings.pending': 'Verification Pending',
'settings.declined': 'Application Declined',
'settings.pendingReview': 'Awaiting Approval',
'settings.pendingPlan': 'Plan Selection Pending',
'settings.pendingTerms': 'Terms Acceptance Pending',
'settings.companyInfo': 'Company Information',
'settings.companyName': 'Company Name',
'settings.phone': 'Phone',
'settings.city': 'City',
'settings.address': 'Address',
'settings.vatNumber': 'ΑΦΜ (Tax ID)',
'settings.about': 'About',
'settings.saveChanges': 'Save Changes',
'settings.account': 'Account',
'settings.notifPrefs': 'Notification Preferences',
'settings.comingSoon': 'Coming Soon',
'settings.payout': 'Payout Settings',
'settings.legal': 'Legal & Compliance',
'settings.helpSupport': 'Help & Support',
'settings.supportMessage': 'Contact us at business@unlocked.app',
'settings.switchPlayer': 'Switch to Player App',
'settings.signOutTitle': 'Sign Out',
'settings.signOutMessage': 'Are you sure?',
'settings.signOut': 'Sign Out',
'settings.profileUpdated': 'Company profile updated.',
'settings.updateFailed': 'Failed to update profile.',
'settings.language': 'Language',

// ── CompanySubscription ──
'subscription.title': 'Subscriptions',
'subscription.activeSubs': 'Active Subs',
'subscription.monthlyRev': 'Monthly Rev',
'subscription.enableTitle': 'Enable Subscription Program',
'subscription.enableDesc': 'Let players subscribe monthly or yearly to access exclusive rooms, early booking, and special perks.',
'subscription.pricing': 'Pricing',
'subscription.monthlyPrice': 'Monthly Price (€)',
'subscription.monthlyPlaceholder': '9.99',
'subscription.yearlyPrice': 'Yearly Price (€)',
'subscription.yearlyPlaceholder': '89.99',
'subscription.yearlySaves': 'Yearly saves players €{{amount}}/year',
'subscription.perks': 'Subscriber Perks',
'subscription.perkPlaceholder': 'e.g. Early access to new rooms',
'subscription.defaultBenefits': 'Default Benefits',
'subscription.benefit1': 'Access to subscription-only rooms',
'subscription.benefit2': 'Priority booking on all rooms',
'subscription.benefit3': 'Early access to new experiences',
'subscription.benefit4': '10% discount on regular rooms',
'subscription.benefit5': 'Exclusive seasonal events',
'subscription.currentSubs': 'Current Subscribers',
'subscription.noSubs': 'No subscribers yet',
'subscription.monthly': 'Monthly',
'subscription.yearly': 'Yearly',
'subscription.active': 'Active',
'subscription.expired': 'Expired',
'subscription.saveSettings': 'Save Settings',
'subscription.settingsSaved': 'Subscription settings updated.',
'subscription.saveFailed': 'Failed to save settings.',

// ── Onboarding ──
'onboarding.stepTerms': 'Terms',
'onboarding.stepPlan': 'Plan',
'onboarding.stepReview': 'Review',
'onboarding.termsTitle': 'Terms of Use',
'onboarding.platformTermsTitle': 'UNLOCKED Platform Terms of Use',
'onboarding.terms1Title': '1. Platform Access & Usage',
'onboarding.terms1Body': 'By registering on the UNLOCKED platform, you agree to use it solely for the purpose of managing your escape room business...',
'onboarding.terms2Title': '2. Subscription & Payments',
'onboarding.terms2Body': 'Your subscription begins upon plan selection and is billed monthly or yearly...',
'onboarding.terms3Title': '3. Bookings & Cancellations',
'onboarding.terms3Body': 'You are responsible for honoring bookings made through the platform...',
'onboarding.terms4Title': '4. Data & Privacy',
'onboarding.terms4Body': 'We collect and process data in accordance with GDPR and applicable privacy laws...',
'onboarding.terms5Title': '5. Account Termination',
'onboarding.terms5Body': 'UNLOCKED reserves the right to suspend or terminate accounts that violate these terms...',
'onboarding.scrollToAccept': 'Scroll to the bottom to accept',
'onboarding.acceptTerms': 'I Accept the Terms',
'onboarding.planTitle': 'Choose Your Plan',
'onboarding.planSubtitle': 'Select the plan that best fits your business needs',
'onboarding.plan_starter': 'Starter',
'onboarding.plan_pro': 'Pro',
'onboarding.plan_enterprise': 'Enterprise',
'onboarding.plan1f1': 'Up to 3 rooms',
'onboarding.plan1f2': 'Basic analytics',
'onboarding.plan1f3': 'Email support',
'onboarding.plan1f4': 'UNLOCKED listing',
'onboarding.plan2f1': 'Up to 10 rooms',
'onboarding.plan2f2': 'Advanced analytics',
'onboarding.plan2f3': 'Priority support',
'onboarding.plan2f4': 'Featured listing',
'onboarding.plan2f5': 'Push notifications',
'onboarding.plan3f1': 'Unlimited rooms',
'onboarding.plan3f2': 'Full analytics suite',
'onboarding.plan3f3': 'Dedicated account manager',
'onboarding.plan3f4': 'Custom branding',
'onboarding.plan3f5': 'API access',
'onboarding.plan3f6': 'White-label options',
'onboarding.confirmPlanTitle': 'Confirm Plan',
'onboarding.confirmPlanMsg': 'Subscribe to {{plan}} at {{price}}/month?',
'onboarding.subscribe': 'Subscribe',
'onboarding.month': 'mo',
'onboarding.year': 'yr',
'onboarding.popular': 'POPULAR',
'onboarding.reviewTitle': 'Application Review',
'onboarding.pendingTitle': 'Under Review',
'onboarding.pendingSubtitle': 'Your application is being reviewed by our team. You will be notified once a decision is made.',
'onboarding.declinedTitle': 'Application Declined',
'onboarding.declinedSubtitle': 'Unfortunately your application was not approved. Please review the notes below and resubmit.',
'onboarding.adminNotes': 'Admin Notes',
'onboarding.resubmit': 'Resubmit for Review',
'onboarding.checkTerms': 'Terms accepted',
'onboarding.checkPlan': '{{plan}} plan selected',
'onboarding.checkReview': 'Awaiting admin review',

// ── Admin Review ──
'admin.title': 'Company Review',
'admin.pending': 'Pending',
'admin.allCompanies': 'All Companies',
'admin.noPending': 'All Clear!',
'admin.noPendingSub': 'No pending applications to review.',
'admin.approve': 'Approve',
'admin.decline': 'Decline',
'admin.approveTitle': 'Approve Company',
'admin.approveMsg': 'Approve {{name}}? They will get full access to the platform.',
'admin.declineTitle': 'Decline Application',
'admin.declineHint': 'Provide notes explaining why the application was declined. The company will see these notes.',
'admin.notesPlaceholder': 'Enter decline notes...',
'admin.notesRequired': 'Please enter a reason for declining.',
'admin.sendDecline': 'Send Decline',
'admin.termsAccepted': 'Terms accepted:',
'admin.registered': 'Registered:',
'admin.previousNotes': 'Previous Admin Notes',
```

> **Full Greek translations:** Copy the Greek (`el`) section from lines 800–1588 of the mobile app's [src/i18n/translations.ts](src/i18n/translations.ts).

### Translation Hook
The mobile app uses template strings with `{{param}}` syntax:
```typescript
// Example: t('admin.approveMsg', { name: 'Escape Zone' })
// Template: 'Approve {{name}} as a verified company?'
function t(key: string, params?: Record<string, string | number>): string {
  let text = translations[language][key] ?? translations.en[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    });
  }
  return text;
}
```

### Language Switching
- Store preference in `localStorage` key `@unlocked_language`
- Toggle between EN/EL in settings page
- Default to `'el'` (Greek)

**IMPORTANT: Copy ALL translation keys** from the mobile app's [src/i18n/translations.ts](src/i18n/translations.ts) (1,588 lines). The complete English keys for the business portal are provided in the "Complete i18n Keys" section below. The Greek translations are in lines 800-1588 of the same file.

### Room-Editor Terms-of-Use Templates

The mobile app includes 4 pre-written legal templates for the room terms-of-use field. These are stored as i18n keys (`roomEditor.tplBody_standard`, `roomEditor.tplBody_strict`, `roomEditor.tplBody_flexible`, `roomEditor.tplBody_minors`). The full text of each template is in the mobile app's [src/i18n/translations.ts](src/i18n/translations.ts) (search for `tplBody_`). Copy them into the web portal's i18n file.

---

## 8. Pages — Full Specification

### 8.1 `/login` — Company Login

**Fields:**
- Email (text input, lowercase trimmed)
- Password (password input)

**Validation:**
- Both fields required
- Show toast on empty fields

**Actions:**
- "Sign In" button → calls `companies.loginCompany({ email, password })`
- On success: store session, redirect based on onboarding status
- On error: show toast with error message (the mutation throws with human-readable messages)
- Link: "Don't have an account? Register" → `/register`

---

### 8.2 `/register` — Company Registration

**Fields (all required unless noted):**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Company Name | text | ✅ | |
| Email | email | ✅ | Lowercased and trimmed |
| Password | password | ✅ | Min 6 chars |
| Phone | tel | ✅ | |
| City | text | ✅ | |
| Address | text | ✅ | Can be empty string |
| VAT Number | text | ❌ | Optional, sent as `undefined` if empty |
| Description | textarea | ✅ | Can be empty string |

**Actions:**
- "Create Account" → calls `companies.register({...})`
- If response has `error` field: show error toast ("Email already registered")
- If response has `id` field: show success toast, store session, redirect to `/onboarding`
- Link: "Already have an account? Sign In" → `/login`

---

### 8.3 `/onboarding` — 3-Step Onboarding Flow

Subscribe to `companies.getById` to get real-time status updates.

**Step 1 — Accept Terms** (when `onboardingStatus === "pending_terms"`)
- Display scrollable terms document with 5 sections:
  1. **Platform Access & Usage** — registration terms, no sublicensing/misuse
  2. **Subscription & Payments** — billing, plan changes, refund policy
  3. **Bookings & Cancellations** — honoring bookings, 24h cancellation policy
  4. **Data & Privacy** — GDPR compliance, confidential player data
  5. **Account Termination** — suspension rights, 30-day data retention
- User must scroll to bottom to enable "Accept" button (hint text: "Scroll to the bottom to accept")
- Button text: "I Accept the Terms" → calls `companies.acceptTerms({ companyId })`
- Status changes to `"pending_plan"` → auto-advances to step 2

**Step 2 — Select Plan** (when `onboardingStatus === "pending_plan"`)
- Show 3 pricing cards side by side:

| Plan | Price | Features |
|------|-------|----------|
| **Starter** | €29/mo · €290/yr | Up to 3 rooms, Basic analytics, Email support, UNLOCKED listing |
| **Pro** ⭐ Popular | €59/mo · €590/yr | Up to 10 rooms, Advanced analytics, Priority support, Featured listing, Push notifications |
| **Enterprise** | €99/mo · €990/yr | Unlimited rooms, Full analytics suite, Dedicated account manager, Custom branding, API access, White-label options |

- Each plan shows monthly and yearly price toggle
- Click plan → confirmation dialog: "Subscribe to {plan} at {price}/month?"
- Calls `companies.selectPlan({ companyId, plan: "starter" | "pro" | "enterprise" })`
- Status changes to `"pending_review"` → auto-advances to step 3

**Step 3 — Pending Review** (when `onboardingStatus === "pending_review"` or `"declined"`)
- Show checklist:
  - ✅ Terms accepted
  - ✅ Plan selected
  - ⏳ Admin review pending
- If `"declined"`: show admin notes (`company.adminNotes`) in a warning box, plus a "Resubmit for Review" button → calls `companies.resubmitForReview({ companyId })`
- **Use Convex real-time subscription:** When admin approves, `onboardingStatus` changes to `"approved"` automatically → redirect to `/dashboard`

---

### 8.4 `/dashboard` — Main Dashboard

**Data Sources:**
- `companies.getById({ id: companyId })` — company info + subscription status
- `companies.getDashboardStats({ companyId })` — all-time stats
- `companies.getTodayStats({ companyId, date: todayDateString })` — today's stats
- `companies.getBookingsByDate({ companyId, date: todayDateString })` — today's bookings

**Layout:**

**Header Section:**
- "Welcome back, {company name}" (i18n key: `dashboard.welcome`)
- Today's date formatted nicely (e.g., "Monday, 16 February 2026")

**Stats Cards Row (from `getDashboardStats`):**
- 📊 Total Bookings: `{totalBookings}`
- 📅 Upcoming: `{upcomingBookings}`
- 💰 Revenue: `€{totalRevenue}`
- 👥 Subscribers: `{subscribers}`
- 🏠 Active Rooms: `{activeRooms}` / `{totalRooms}`

**Today's Overview (from `getTodayStats`):**
- Today's bookings: `{totalBookings}`
- Available slots: `{availableSlots}` / `{totalSlots}`
- Today's revenue: `€{revenue}`
- Source breakdown: `{unlockedBookings}` Unlocked | `{externalBookings}` External

**Today's Timeline (from `getBookingsByDate`):**
- Chronological list of today's bookings
- Each entry shows:
  - Time (bold, e.g., "14:00")
  - Room name (`roomTitle`)
  - Player name (`playerName`)
  - Player count (e.g., "4 players")
  - Source badge: green "Unlocked" or orange "External" (+ `externalSource` label)
  - Payment status badge: green "Paid" / yellow "Deposit" / red "Unpaid" / gray "N/A"
- Click row → navigate to `/bookings/{_id}`
- Empty state: "No bookings today" with illustration

**Quick Action Buttons:**
- ➕ "Add Booking" → `/bookings/new`
- 📱 "Scan QR" → `/scanner`
- 🏠 "Manage Rooms" → `/rooms`

---

### 8.5 `/bookings` — Bookings Calendar

**Layout: Two-panel**

**Left Panel — Calendar:**
- Month calendar using `react-day-picker`
- Month/year navigation arrows
- Click a day → load bookings for that date
- Highlight days that have bookings (optional enhancement: show booking count dots)

**Right Panel — Selected Day's Bookings:**
- Header: "Tuesday, 17 February 2026" + badge showing "4 bookings"
- Grouped by room:
  ```
  🏠 The Haunted Manor
  ├── 14:00  |  John Doe  |  4 players  |  €180  |  🟢 Unlocked  |  Paid
  ├── 16:00  |  External  |  3 players  |  €0    |  🟠 EscapeAll  |  N/A
  └── [+ Add Booking for this room]
  
  🏠 Cyber Heist
  ├── 15:00  |  Maria K.  |  2 players  |  €100  |  🟢 Unlocked  |  Deposit
  └── [+ Add Booking for this room]
  ```
- Click any booking → `/bookings/{_id}`
- "Add Booking" button per room → `/bookings/new?roomId={id}&date={selectedDate}`
- Global "Add Booking" button → `/bookings/new?date={selectedDate}`

---

### 8.6 `/bookings/[id]` — Booking Detail

**Data:** `companies.getBookingDetail({ bookingId })`

**Layout:**
- **Header row:** Source badge (🟢 Unlocked / 🟠 External) + Status badge (Upcoming / Completed / Cancelled)
- **Room:** `roomTitle` with `roomImage` thumbnail
- **Date & Time:** Formatted date + time in cards
- **Player Info:**
  - Name: `playerName`
  - Contact: `playerContact`
  - Players: `{players} players`
- **Payment** (only for `source === "unlocked"`):
  - Total: `€{total}`
  - Status badge: Paid (green) / Deposit €{depositPaid} (yellow) / Unpaid (red)
  - Payment terms: Full / 20% Deposit / Pay on Arrival
- **Booking Code:** `{bookingCode}` in a monospaced display
- **Notes:** Editable text area with "Save" button
  - Save calls `companies.updateBookingNotes({ companyId, bookingId, notes })`

**Actions:**
- **Reschedule:** Expandable section with new date + time inputs
  - Submit calls `companies.adminRescheduleBooking({ companyId, bookingId, newDate, newTime })`
  - Show error toast if conflict: "The new time slot is already booked"
- **Cancel Booking:** Red button with confirmation dialog
  - Calls `companies.adminCancelBooking({ companyId, bookingId })`
  - After cancel, booking status updates to "cancelled" in real-time

---

### 8.7 `/bookings/new` — Add Booking

**URL params (optional pre-fill):** `?roomId=xxx&date=2026-02-16&time=14:00`

**Form Fields:**

1. **Booking Type Toggle:** "Unlocked" vs "External Block"
   - Visual toggle/radio — changes which fields are shown

2. **External Source** (only if External selected):
   - Dropdown: "EscapeAll" | "Phone" | "Walk-in" | "Private Event"

3. **Room Selector:**
   - Horizontal scrollable cards from `companies.getRooms({ companyId })`
   - Show room image, title, duration
   - Pre-select if `roomId` param provided

4. **Date Picker:**
   - Calendar or date input
   - Pre-fill if `date` param provided

5. **Time Slot Grid** (load after room + date are selected):
   - Fetch `companies.getRoomSlots({ roomId, date })`
   - Also fetch `companies.getBookingsByDate({ companyId, date })` to find already-booked times
   - Display slots as a grid:
     - Available: clickable, show time + price
     - Already booked: greyed out with "Booked" label
     - Unavailable (from slot management): hidden or shown as disabled
   - Pre-select if `time` param provided

6. **Player Info:**
   - Player name (text, required for Unlocked, optional for External)
   - Player contact (text, optional)
   - Player count (number)

7. **Total Price** (Unlocked only):
   - Auto-calculated from slot price × player count (or use group pricing if available)
   - Editable override

8. **Notes:** Optional textarea

**Submit:**
- **Unlocked:** calls `companies.createAdminBooking({ companyId, roomId, date, time, players, playerName, playerContact, notes, total })`
- **External:** calls `companies.createExternalBlock({ companyId, roomId, date, time, externalSource, playerName, players, notes })`
- On success: show toast with booking code, redirect to `/bookings`
- On error: show error toast (e.g., "This time slot is already booked")

---

### 8.8 `/rooms` — Room Management

**Data:** `companies.getRooms({ companyId })`

**Display:** Card grid (responsive — 1 column mobile, 2 tablet, 3 desktop)

**Each Room Card:**
- Cover image (or placeholder)
- Title + location
- Theme badge (e.g., "Horror")
- Duration: "{duration} min"
- Players: "{playersMin}-{playersMax} players"
- Price: "From €{price}/person" or group pricing range
- Payment terms: small badges (Full, Deposit, Pay on Arrival)
- Operating days: colored dots for Mon-Sun (green = active, gray = inactive)
- Slot count: "{defaultTimeSlots.length} slots"
- Active status: green dot + "Active" or red dot + "Paused"
- Subscription-only badge if `isSubscriptionOnly === true`

**Actions per card:**
- "Edit" → `/rooms/{_id}/edit`
- "Manage Slots" → `/rooms/{_id}/availability`
- "Pause" / "Activate" toggle → calls `companies.updateRoom({ roomId, isActive: !current })`
- "Delete" → confirmation dialog → calls `companies.deleteRoom({ roomId })`

**Top bar:**
- "Create Room" button → `/rooms/new`
- Optional: filter by active/paused, search by name

---

### 8.9 `/rooms/new` and `/rooms/[id]/edit` — Room Editor

**When editing:** Pre-fill form with data from `rooms.getById({ id })`

**Form Sections:**

**Section 1 — Basic Info:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Title | text | ✅ | Room name |
| Location | text | ✅ | Address string |
| Map Pin | interactive map | ❌ | Click map to set lat/lng, reverse geocode to address |
| Cover Image | URL input | ✅ | URL string (no file upload in current backend) |
| Additional Images | URL inputs | ❌ | Array of URL strings, add/remove buttons |
| Description | textarea | ✅ | Short description |
| Story | textarea | ✅ | Backstory / narrative |

**Section 2 — Room Details:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Duration | number (minutes) | ✅ | e.g., 60, 90, 120 |
| Base Price | number (€) | ✅ | Per-person base price |
| Min Players | number | ✅ | e.g., 2 |
| Max Players | number | ✅ | e.g., 6 |
| Per-Group Pricing | dynamic grid | ❌ | For each count from min to max, set price per person |
| Difficulty | 1-5 radio/slider | ✅ | |
| Max Difficulty | number | ✅ | Usually 5, set automatically |

**Per-Group Pricing Example:**
```
Players | Price/person
2       | €50
3       | €42
4       | €38
5       | €35
6       | €32
```
Generated as: `[{ players: 2, price: 50 }, { players: 3, price: 42 }, ...]`

**Section 3 — Theme & Tags:**
- **Theme** (single select): Horror, Sci-Fi, Mystery, Historical, Fantasy, Adventure
- **Tags** (multi-select, checkboxes — exact values used in backend):
  `Horror Theme`, `Sci-Fi Theme`, `Mystery Theme`, `Historical Theme`,
  `Live Actor`, `Physical Puzzles`, `Multi-room`, `High-Tech Puzzles`,
  `Neon Atmosphere`, `Team Challenge`, `Atmospheric`, `Beginner Friendly`,
  `Enchanted`, `Story-Driven`, `Zero-G Simulation`, `Immersive Sound`,
  `Dark Theme`, `Family Friendly`, `VR Enhanced`, `Time Pressure`
  
  Each tag has an i18n key (e.g., `tag.horrorTheme`, `tag.liveActor`, `tag.beginnerFriendly`, etc.)

**Section 4 — Booking Settings:**
- **Payment Terms** (multi-select checkboxes, max 2):
  - ☐ Full Payment — "Players pay 100% when booking"
  - ☐ 20% Deposit — "Players pay 20% now, rest on arrival"
  - ☐ Pay on Arrival — "No online payment — players pay at the venue"
  - At least one must be selected
- **Terms of Use** (textarea, optional):
  - Include **Quick Templates** buttons: Standard, Strict, Flexible, Minors Policy
  - Each template pre-fills the textarea with detailed legal text (cancellation, participation, safety, liability clauses)
  - If terms already exist, prompt: "Replace" or "Append"
  - Include a "Clear" button to reset
- **Subscription Only** (toggle): Only subscribers can see and book this room
- **Booking Mode** (radio):
  - "UNLOCKED Primary" — bookings come through the UNLOCKED app, can also add external blocks manually
  - "External Primary" — manage bookings externally (EscapeAll, phone, etc.) and block slots here (transition mode)

**Section 5 — Schedule:**
- **Operating Days** (day-of-week checkboxes):
  - ☐ Sun (0) ☐ Mon (1) ☐ Tue (2) ☐ Wed (3) ☐ Thu (4) ☐ Fri (5) ☐ Sat (6)
- **Default Time Slots** (dynamic list):
  - Each entry: Time (HH:MM input) + Price (€ number input)
  - "+" button to add slot, "×" to remove
- **Overflow/Bonus Slot** (toggle):
  - When enabled: time, price, per-group pricing grid, days checkboxes
  - This slot unlocks only when ALL regular slots are booked for that day

**Submit:**
- **Create:** calls `companies.createRoom({ companyId, ...allFields })`
  - Must build `players` string from min/max: `"${playersMin}-${playersMax}"`
  - Set `maxDifficulty` to 5
- **Update:** calls `companies.updateRoom({ roomId, ...changedFields })`
- On success: redirect to `/rooms`

---

### 8.10 `/rooms/[id]/availability` — Slot Availability Manager

**Data:**
- Room info: `rooms.getById({ id })`
- Slots: `companies.getRoomSlots({ roomId, date: selectedDate })`

**Layout:**

**Calendar:** Date picker to select which day to manage

**Slot List** (for selected date):
If no slots exist for the date, auto-populate from the room's `defaultTimeSlots` config.

Each slot row:
- Time display (e.g., "14:00")
- Available toggle (switch)
- Price input (€)
- Discount % field: entering a percentage auto-calculates the discounted price
  - e.g., Original €50, discount 20% → price becomes €40
- Group price breakdown (expandable): shows per-player-count prices
  - If room has `pricePerGroup`, show original → discounted price for each player count
- Remove button (×)

**Add Slot:** "+" button to add new slot (time + price inputs)

**Copy to Next 7 Days:**
- Button that copies the current date's slot configuration to the next 7 calendar days
- Calls `companies.setSlots` for each day

**Save:** Calls `companies.setSlots({ roomId, date, slots: [...] })`
- `slots` array: `{ time, price, available, pricePerGroup? }`

---

### 8.11 `/scanner` — QR Scanner

**Browser Camera QR Scanner** using `html5-qrcode`:

1. **Camera Permission:** Request camera access, show error if denied
2. **Scan View:** Full-width camera feed with scan overlay (corner frame, colored border)
3. **QR Format:** The mobile app generates QR codes containing either:
   - Raw booking code string: `"UNL-A1B2C3"`
   - JSON object: `{ "bookingCode": "UNL-A1B2C3" }`
   - Parse both formats
4. **On Scan:** Call `bookings.getByCode({ bookingCode })`
5. **Result Card:**
   - **Valid (upcoming):** ✅ green icon
     - Booking code, room name, date, time, player count, player name, price, payment status
     - **"Validate" button** → calls `bookings.complete({ id: booking._id })` → marks as completed
   - **Already Used (completed):** ⚠️ orange icon — "This booking has already been used"
   - **Cancelled:** ❌ red icon — "This booking was cancelled"
   - **Not Found:** ❌ red icon — "No booking found with this code"
6. **"Scan Again" button:** Reset scanner

---

### 8.12 `/settings` — Company Settings

**Data:** `companies.getById({ id: companyId })`

**Profile Section:**
- Company logo display (or placeholder if empty)
- Onboarding status badge (Approved ✅ / Declined ❌ / Pending ⏳)
- Platform plan badge (Starter / Pro / Enterprise)
- Editable fields:
  - Company Name
  - Phone
  - City
  - Address
  - VAT Number (optional)
  - Description
- "Save" button → calls `companies.updateProfile({ id: companyId, name, phone, address, city, vatNumber, description })`

**Player Subscription Offering:**
- **Stats cards:**
  - Active subscribers count (from `getSubscribers`)
  - Monthly revenue estimate
- **Enable/Disable toggle** → `subscriptionEnabled`
- **Pricing:**
  - Monthly price (€)
  - Yearly price (€) with auto-calculated savings %: `((monthly * 12 - yearly) / (monthly * 12) * 100).toFixed(0)%`
- **Perks list:**
  - Default benefits (displayed as static text, e.g., "Priority booking", "Exclusive rooms")
  - Custom perks: add/remove custom text entries
- "Save" → calls `companies.updateSubscription({ companyId, subscriptionEnabled, subscriptionMonthlyPrice, subscriptionYearlyPrice, subscriptionPerks })`
- **Subscribers table:**
  - Columns: Name, Email, Plan (Monthly/Yearly), Price, Status (Active/Expired)
  - Data from `companies.getSubscribers({ companyId })`

**Account Section:**
- Language toggle: EN / EL
- Logout button (with confirmation)

---

### 8.13 `/admin` — Admin Panel (Super-Admin Only)

**Access control:** Only show this page/sidebar item if the logged-in company email is in the admin list.

**Data:** `companies.getAllCompanies()`

**Two Tabs:**

**Tab 1 — Pending Review** (default):
- Filter: only companies with `onboardingStatus === "pending_review"`
- Count badge in tab header
- Each card shows:
  - Company name (large)
  - Email, phone
  - City, address
  - VAT number
  - Description (collapsible if long)
  - Selected plan: "Starter €29/mo" | "Pro €59/mo" | "Enterprise €99/mo"
  - Terms accepted date (formatted)
  - Registration date (formatted from `createdAt`)
- **Actions:**
  - "Approve" button (green) → confirmation dialog → `companies.approveCompany({ companyId })`
  - "Decline" button (red) → opens modal with required notes textarea → `companies.declineCompany({ companyId, notes })`
- Empty state: "No pending applications to review"

**Tab 2 — All Companies:**
- Full list of all companies
- Status badge per company (Approved/Declined/Pending Terms/Pending Plan/Pending Review)
- Same card layout as pending tab
- No action buttons for already-approved companies

---

## 9. Business Logic Rules

### Booking Codes
- **Unlocked bookings:** Code format `UNL-XXXXXX` where XXXXXX = `Date.now().toString(36).toUpperCase().slice(-6)` (6 chars, base-36 encoded timestamp)
- **External blocks:** Code format `EXT-XXXXXX` (same generation logic)

### Double-Booking Prevention
- Before creating any booking, the system checks for existing active bookings at the same room + date + time
- Only bookings with `status !== "cancelled"` count as conflicts
- If conflict found, the mutation throws with an error message

### Group Pricing
- Rooms can have `pricePerGroup: [{ players: 2, price: 50 }, { players: 3, price: 42 }]`
- This represents **price per person** for that group size
- Total = `pricePerGroup.find(p => p.players === selectedCount).price * selectedCount`
- If the player count doesn't match any entry, use the base `room.price`

### Overflow Slot
- A bonus time slot configured in the room settings
- Only becomes available when ALL regular time slots for that day are booked
- Has its own time, price, and per-group pricing
- Only active on specific days of the week (`overflowSlot.days` array)

### Payment Status Logic
- `"full"` payment terms → `paymentStatus: "paid"`
- `"deposit_20"` → `paymentStatus: "deposit"`, `depositPaid: total * 0.2`
- `"pay_on_arrival"` → `paymentStatus: "unpaid"`
- External blocks → `paymentStatus: "na"`, `total: 0`

### Source Tracking
- `source: "unlocked"` — Bookings made through the Unlocked app or portal
- `source: "external"` — Bookings from external sources
- `externalSource` values: "EscapeAll", "Phone", "Walk-in", "Private Event"

### Ownership Guards
- All company mutations verify ownership via `guardCompanyOwnsRoom` and `guardCompanyOwnsBooking`
- These check that `room.companyId` or `booking.companyId` matches the requesting company
- If not: throws "Access denied: room/booking does not belong to your company"

### Date/Time Formats
- **Dates:** Always `"YYYY-MM-DD"` string format (e.g., `"2026-02-16"`)
- **Times:** Always `"HH:MM"` 24-hour format (e.g., `"14:00"`, `"09:30"`)
- **Timestamps:** `Date.now()` — milliseconds since epoch

---

## 10. Error Handling & Edge Cases

### Convex Query Loading States
- `useQuery()` returns `undefined` while loading — always show a loading spinner
- Never assume data is available immediately

### Error Handling Pattern
```tsx
const mutation = useMutation(api.companies.createAdminBooking);

const handleSubmit = async () => {
  try {
    const result = await mutation({ ... });
    toast.success(`Booking created: ${result.bookingCode}`);
    router.push('/bookings');
  } catch (error: any) {
    toast.error(error.message || 'Something went wrong');
  }
};
```

### Edge Cases to Handle
1. **Company not found after login:** If `getById` returns null, force logout
2. **Room deleted while editing:** If `rooms.getById` returns null, show "Room not found" and redirect
3. **Booking already cancelled:** Disable cancel button, hide reschedule section
4. **No rooms yet:** Empty state on rooms page with prompt to create first room
5. **No slots for date:** Show message "No slots configured for this date" with option to set defaults
6. **Onboarding status changes:** Use real-time subscription to auto-redirect
7. **Multiple browser tabs:** Convex real-time subscriptions keep all tabs in sync
8. **Network errors:** Show retry option on failed mutations

### Register Edge Case
The `companies.register` mutation returns either:
- `{ id: "xxx" }` on success
- `{ error: "Email already registered" }` if email exists
- It does NOT throw — check for `error` field in the response

---

## 11. Production Checklist

### Security
- [ ] **Password hashing:** The current backend stores passwords in plain text. Add bcrypt hashing in the `loginCompany` and `register` mutations before going live.
- [ ] **Admin access:** Add server-side admin checks to `getAllCompanies`, `approveCompany`, `declineCompany` mutations (currently client-side only).
- [ ] **CSRF protection:** Next.js App Router handles this by default.
- [ ] **Rate limiting:** Consider adding rate limiting to auth endpoints.
- [ ] **Input sanitization:** Validate all user inputs with zod before sending to mutations.

### Performance
- [ ] **Image optimization:** Use Next.js `<Image>` component for room images.
- [ ] **Lazy loading:** Lazy-load heavy components (map, QR scanner, charts).
- [ ] **Pagination:** If a company has many bookings/rooms, consider pagination (current queries fetch all).

### Deployment
- [ ] **Convex deployment:** Ensure the Convex backend is using the production deployment, not dev.
- [ ] **Environment variables:** Set `NEXT_PUBLIC_CONVEX_URL` in Vercel/hosting env vars.
- [ ] **Domain:** Set up custom domain (e.g., `portal.unlockedapp.gr` or `business.unlockedapp.gr`).
- [ ] **SSL:** Automatic with Vercel/most hosts.

### Monitoring
- [ ] **Error tracking:** Add Sentry or similar for error reporting.
- [ ] **Analytics:** Add Vercel Analytics or Plausible for page views.

### SEO & Meta
- [ ] **Meta tags:** Title: "UNLOCKED Business Portal", description, og:image.
- [ ] **Favicon:** Use UNLOCKED branding.
- [ ] **Robots:** The portal should not be indexed by search engines (`robots.txt: Disallow: /`).

### Accessibility
- [ ] **Keyboard navigation:** All interactive elements focusable and operable with keyboard.
- [ ] **ARIA labels:** Screen reader support for status badges, icons.
- [ ] **Color contrast:** Ensure text is readable on dark backgrounds (WCAG AA).

### Testing
- [ ] **Auth flow:** Login, register, onboarding (all 3 steps + resubmit).
- [ ] **Room CRUD:** Create, edit, pause/activate, delete.
- [ ] **Slot management:** Set slots, copy to week, discount pricing.
- [ ] **Booking flow:** Add unlocked booking, add external block, cancel, reschedule.
- [ ] **QR scanner:** Scan valid, used, cancelled, and invalid codes.
- [ ] **Admin panel:** Approve, decline with notes.
- [ ] **Real-time:** Open in 2 tabs, create booking in one, see it appear in the other.
- [ ] **i18n:** Toggle language, verify all strings appear correctly.

---

## 12. File Structure

```
escape-portal/
├── app/
│   ├── layout.tsx                    # Root layout with ConvexProvider + dark theme
│   ├── page.tsx                      # Redirect to /dashboard or /login
│   ├── globals.css                   # Tailwind base + dark theme styles
│   ├── (auth)/                       # Auth pages (no sidebar)
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── onboarding/page.tsx
│   ├── (portal)/                     # Protected pages (with sidebar)
│   │   ├── layout.tsx                # Sidebar layout + AuthGuard
│   │   ├── dashboard/page.tsx
│   │   ├── bookings/
│   │   │   ├── page.tsx              # Calendar view
│   │   │   ├── new/page.tsx          # Add booking
│   │   │   └── [id]/page.tsx         # Booking detail
│   │   ├── rooms/
│   │   │   ├── page.tsx              # Rooms list
│   │   │   ├── new/page.tsx          # Create room
│   │   │   └── [id]/
│   │   │       ├── edit/page.tsx     # Edit room
│   │   │       └── availability/page.tsx
│   │   ├── scanner/page.tsx
│   │   ├── settings/page.tsx
│   │   └── admin/page.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   └── AuthGuard.tsx             # Auth wrapper
│   ├── dashboard/
│   │   ├── StatsCard.tsx
│   │   ├── TodayTimeline.tsx
│   │   └── QuickActions.tsx
│   ├── bookings/
│   │   ├── BookingCard.tsx
│   │   ├── BookingDetail.tsx
│   │   ├── BookingForm.tsx
│   │   └── TimeSlotGrid.tsx
│   ├── rooms/
│   │   ├── RoomCard.tsx
│   │   ├── RoomForm.tsx
│   │   ├── SlotManager.tsx
│   │   └── MapPicker.tsx
│   ├── admin/
│   │   ├── CompanyCard.tsx
│   │   └── DeclineModal.tsx
│   └── ui/                           # shadcn/ui components
│       ├── button.tsx
│       ├── input.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── badge.tsx
│       ├── tabs.tsx
│       ├── switch.tsx
│       ├── select.tsx
│       ├── calendar.tsx
│       ├── toast.tsx
│       └── ...
├── lib/
│   ├── convex.ts                     # ConvexReactClient instance
│   ├── auth.ts                       # Session helpers (localStorage)
│   ├── i18n.ts                       # Translation hook + strings
│   ├── utils.ts                      # Date formatters, price formatters
│   └── constants.ts                  # Theme tags, external sources, plan details
├── convex/                           # Copied/symlinked from mobile app
│   ├── _generated/
│   │   ├── api.d.ts
│   │   ├── api.js
│   │   ├── dataModel.d.ts
│   │   ├── server.d.ts
│   │   └── server.js
│   ├── schema.ts
│   ├── companies.ts
│   ├── bookings.ts
│   ├── rooms.ts
│   ├── timeSlots.ts
│   ├── notifications.ts
│   ├── posts.ts
│   ├── users.ts
│   ├── slotAlerts.ts
│   └── seed.ts
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── postcss.config.js
├── components.json                   # shadcn/ui config
└── .env.local                        # NEXT_PUBLIC_CONVEX_URL
```

---

## 13. Implementation Order

Build and test each step before moving to the next:

| Step | What to Build | Key Files |
|------|---------------|-----------|
| **1** | Project setup: Next.js + Tailwind + shadcn/ui + Convex client + dark theme | `layout.tsx`, `globals.css`, `tailwind.config.ts`, `lib/convex.ts` |
| **2** | Auth pages: Login + Register | `(auth)/login/page.tsx`, `(auth)/register/page.tsx`, `lib/auth.ts` |
| **3** | Onboarding flow (3 steps) | `(auth)/onboarding/page.tsx` |
| **4** | Sidebar layout + AuthGuard | `(portal)/layout.tsx`, `Sidebar.tsx`, `AuthGuard.tsx` |
| **5** | Dashboard: stats cards + today's timeline | `dashboard/page.tsx`, `StatsCard.tsx` |
| **6** | Rooms list + pause/delete | `rooms/page.tsx`, `RoomCard.tsx` |
| **7** | Room editor (create + edit) | `rooms/new/page.tsx`, `rooms/[id]/edit/page.tsx`, `RoomForm.tsx` |
| **8** | Availability manager | `rooms/[id]/availability/page.tsx`, `SlotManager.tsx` |
| **9** | Bookings calendar | `bookings/page.tsx`, `BookingCard.tsx` |
| **10** | Booking detail | `bookings/[id]/page.tsx` |
| **11** | Add booking (unlocked + external) | `bookings/new/page.tsx`, `BookingForm.tsx`, `TimeSlotGrid.tsx` |
| **12** | QR Scanner | `scanner/page.tsx` |
| **13** | Settings + subscription management | `settings/page.tsx` |
| **14** | Admin panel | `admin/page.tsx`, `CompanyCard.tsx`, `DeclineModal.tsx` |
| **15** | i18n: Add all translation strings | `lib/i18n.ts` |
| **16** | Polish: loading states, error handling, responsive design, accessibility | All files |

---

## 💡 Instructions for ChatGPT

When you use this document with ChatGPT, tell it:

> "Here is my complete specification for a web portal. I want to build it step by step. Let's start with Step 1: Project setup. Create the Next.js project with Tailwind, shadcn/ui, and Convex client configured with the dark theme from the spec."

Then after each step:

> "Step 1 is done. Let's move to Step 2: Auth pages (Login + Register)."

**Key reminders for ChatGPT:**
1. **DO NOT create new Convex functions.** Use only the existing ones documented above.
2. **Every mutation argument must match the exact signature.** Refer to section 4.
3. **Use `"use client"` directive** on all pages that use Convex hooks or browser APIs.
4. **The `companyId` is stored in localStorage** after login — always retrieve it with `getCompanyId()`.
5. **All monetary values are in euros (€).**
6. **All dates are `"YYYY-MM-DD"` strings, all times are `"HH:MM"` strings.**
7. **Handle loading states** — Convex queries return `undefined` while loading.
8. **Use the exact theme colors** from section 6 — especially the dark burgundy background `#1A0D0D`.
