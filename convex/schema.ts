import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { playerReportCategoryV, roomReportKindV, roomReportStatusV } from "./reportRules";

export default defineSchema({
  // ─── Company / Business ───
  companies: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    logo: v.string(),
    address: v.string(),
    city: v.string(),
    vatNumber: v.optional(v.string()),
    description: v.string(),
    password: v.string(), // hashed in production
    verified: v.boolean(),
    createdAt: v.number(),
    // Legacy subscription fields (kept for schema validation of existing docs)
    subscriptionEnabled: v.optional(v.boolean()),
    subscriptionMonthlyPrice: v.optional(v.number()),
    subscriptionYearlyPrice: v.optional(v.number()),
    subscriptionPerks: v.optional(v.array(v.string())),
    // ── Company Onboarding ──
    onboardingStatus: v.optional(v.union(
      v.literal("pending_terms"),     // Step 1: needs to accept terms
      v.literal("pending_plan"),      // Step 2: needs to pick a plan
      v.literal("pending_review"),    // Step 3: submitted, waiting for admin
      v.literal("approved"),          // Admin approved
      v.literal("declined")           // Admin declined (with notes)
    )),
    termsAcceptedAt: v.optional(v.number()),
    // Current plans are "unlimited" and "payg" (see plans.ts). The other four are
    // legacy values kept until billing:migrateLegacyPlans has run in prod.
    platformPlan: v.optional(v.union(
      v.literal("unlimited"),
      v.literal("payg"),
      v.literal("free"),
      v.literal("starter"),
      v.literal("pro"),
      v.literal("enterprise")
    )),
    platformSubscribedAt: v.optional(v.number()),
    // When the company last moved onto pay-as-you-go. Bookings played before
    // this date aren't charged (they fell under the Unlimited subscription).
    paygSince: v.optional(v.number()),
    adminNotes: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    // ── Stripe ──
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    billingPeriod: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    stripePaymentStatus: v.optional(v.union(
      v.literal("pending"),      // Checkout started but not completed
      v.literal("active"),       // Subscription active
      v.literal("cancelled"),    // Subscription cancelled
      v.literal("past_due"),     // Payment failed
    )),
    // Auto-translate room content to all supported languages
    autoTranslateEnabled: v.optional(v.boolean()),
    // ── Player payments (company's own Stripe / Viva account) ──
    // Non-secret summary only. The keys live encrypted in companyPaymentCredentials.
    paymentProvider: v.optional(v.union(v.literal("stripe"), v.literal("viva"))),
    paymentMode: v.optional(v.union(v.literal("live"), v.literal("test"))),
    paymentAccountLabel: v.optional(v.string()),
    paymentConnectedAt: v.optional(v.number()),
    depositPercent: v.optional(v.number()),      // default upfront % for deposit bookings (1–99)
    bookingFeeEnabled: v.optional(v.boolean()),  // add a booking fee on online payments
    bookingFeeAmount: v.optional(v.number()),    // euros, goes to the company with the payment
  })
    .index("by_email", ["email"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_onboardingStatus", ["onboardingStatus"]),

  // Encrypted payment keys, one row per company. Only internal functions read
  // this table; no public query may return it.
  companyPaymentCredentials: defineTable({
    companyId: v.id("companies"),
    provider: v.union(v.literal("stripe"), v.literal("viva")),
    mode: v.union(v.literal("live"), v.literal("test")),
    encrypted: v.string(), // AES-256-GCM, see companyPayments.ts
    updatedAt: v.number(),
  }).index("by_company", ["companyId"]),

  // Business-portal login sessions. Only the SHA-256 of the token is stored;
  // the raw token lives on the client. See companySession.ts.
  companySessions: defineTable({
    companyId: v.id("companies"),
    tokenHash: v.string(),
    client: v.optional(v.string()), // "web" | "app"
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_company", ["companyId"]),

  rooms: defineTable({
    title: v.string(),
    location: v.string(),
    image: v.string(),
    images: v.optional(v.array(v.string())), // multiple photos
    rating: v.number(),
    reviews: v.number(),
    duration: v.number(),
    difficulty: v.number(),
    maxDifficulty: v.number(),
    players: v.string(),
    playersMin: v.number(),
    playersMax: v.number(),
    price: v.number(),
    // Per-player-count pricing: [{ players: 2, price: 50 }, { players: 3, price: 42 }, ...]
    pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))),
    theme: v.string(),
    tags: v.array(v.string()),
    description: v.string(),
    story: v.string(),
    // Multi-language translations for story & description
    storyTranslations: v.optional(v.object({
      en: v.optional(v.string()),
      el: v.optional(v.string()),
      nl: v.optional(v.string()),
    })),
    descriptionTranslations: v.optional(v.object({
      en: v.optional(v.string()),
      el: v.optional(v.string()),
      nl: v.optional(v.string()),
    })),
    isNew: v.optional(v.boolean()),
    isFeatured: v.optional(v.boolean()),
    isTrending: v.optional(v.boolean()),
    // Company fields
    companyId: v.optional(v.id("companies")),
    paymentTerms: v.optional(v.union(
      v.array(
        v.union(
          v.literal("full"),
          v.literal("deposit_20"),
          v.literal("pay_on_arrival")
        )
      ),
      v.literal("full"),
      v.literal("deposit_20"),
      v.literal("pay_on_arrival")
    )),
    // Overrides the company's default deposit % for this room (1–99)
    depositPercent: v.optional(v.number()),
    termsOfUse: v.optional(v.string()),
    isSubscriptionOnly: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    // Booking mode: which system is primary for this room
    bookingMode: v.optional(v.union(v.literal("unlocked_primary"), v.literal("external_primary"))),
    // Coordinates from map pin
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    // Weekly availability: which days are open + default time slots
    operatingDays: v.optional(v.array(v.number())), // 0=Sun,1=Mon,...6=Sat
    defaultTimeSlots: v.optional(v.array(v.object({
      time: v.string(),
      price: v.number(),
    }))),
    // Overflow / bonus slot: unlocked when ALL regular slots are booked
    overflowSlot: v.optional(v.object({
      time: v.string(),
      price: v.number(),
      pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))),
      days: v.array(v.number()), // 0=Sun,1=Mon,...6=Sat — which days overflow is active
    })),
    // Early Access: date the room goes public (YYYY-MM-DD). Premium players see it 3 days before.
    releaseDate: v.optional(v.string()),
    // Photos-only rooms (created from photos.unlocked.gr) — hidden from main site listings
    photosOnly: v.optional(v.boolean()),
  })
    .index("by_theme", ["theme"])
    .index("by_featured", ["isFeatured"])
    .index("by_trending", ["isTrending"])
    .index("by_company", ["companyId"]),

  timeSlots: defineTable({
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    available: v.boolean(),
    price: v.number(),
    pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))),
  }).index("by_room_date", ["roomId", "date"]),

  users: defineTable({
    name: v.string(),
    email: v.string(),
    password: v.optional(v.string()), // hashed in production
    appleId: v.optional(v.string()), // Apple Sign In identifier
    avatar: v.string(),
    avatarStorageId: v.optional(v.id("_storage")), // persistent reference
    title: v.string(),
    memberSince: v.string(),
    played: v.number(),
    escaped: v.number(),
    awards: v.number(),
    wishlist: v.array(v.id("rooms")),
    // Location
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    city: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    // Phone number (required for bookings)
    phone: v.optional(v.string()),
    // Language preference for notifications
    language: v.optional(v.string()), // "en" | "el"
    // UNLOCKED Premium
    isPremium: v.optional(v.boolean()),
    premiumSince: v.optional(v.number()),
    premiumExpiresAt: v.optional(v.number()),
  }).index("by_email", ["email"])
    .index("by_apple_id", ["appleId"]),

  badges: defineTable({
    userId: v.id("users"),
    badgeKey: v.string(), // "champion","on_fire","mastermind","speed_demon","team_leader","explorer","perfectionist","night_owl"
    title: v.string(),
    icon: v.string(),
    earned: v.boolean(),
    date: v.optional(v.string()),
    // Company verification
    verifiedByCompanyId: v.optional(v.id("companies")),
    verifiedByBookingId: v.optional(v.id("bookings")),
    earnedAt: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_user_badge", ["userId", "badgeKey"]),

  // ─── Booking Performance (company-verified escape data) ───
  bookingPerformance: defineTable({
    bookingId: v.id("bookings"),
    companyId: v.id("companies"),
    userId: v.id("users"),
    roomId: v.id("rooms"),
    escaped: v.boolean(),                      // did they escape?
    escapeTimeMinutes: v.optional(v.number()),  // how fast (minutes)
    hintsUsed: v.optional(v.number()),          // how many hints
    verifiedAt: v.number(),
  }).index("by_booking", ["bookingId"])
    .index("by_user", ["userId"]),

  bookings: defineTable({
    // userId is optional: external bookings may not have a linked player
    userId: v.optional(v.id("users")),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    total: v.number(),
    status: v.union(
      v.literal("upcoming"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("pending_payment")
    ),
    bookingCode: v.string(),
    createdAt: v.number(),
    // Company payment tracking
    depositPaid: v.optional(v.number()),
    paymentTerms: v.optional(v.union(
      v.literal("full"),
      v.literal("deposit_20"),
      v.literal("pay_on_arrival")
    )),
    // ─── Booking source & company tracking ───
    companyId: v.optional(v.id("companies")),
    source: v.optional(v.union(v.literal("unlocked"), v.literal("external"))),
    externalSource: v.optional(v.string()), // "EscapeAll", "Phone", "Walk-in", "Private Event"
    playerName: v.optional(v.string()),
    playerContact: v.optional(v.string()),
    playerPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentStatus: v.optional(v.union(
      v.literal("paid"),
      v.literal("deposit"),
      v.literal("unpaid"),
      v.literal("na")
    )),
    // Stripe session for player-side payments
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    // Online payment into the company's own Stripe / Viva account
    paymentProvider: v.optional(v.union(v.literal("stripe"), v.literal("viva"))),
    paymentMode: v.optional(v.union(v.literal("live"), v.literal("test"))),
    depositPercent: v.optional(v.number()),
    bookingFee: v.optional(v.number()),       // euros, added on top of the booking amount
    amountDueNow: v.optional(v.number()),     // euros charged online (deposit or full, + fee)
    vivaOrderCode: v.optional(v.string()),    // 16 digits, kept as a string
    paymentReference: v.optional(v.string()), // Stripe payment intent / Viva transaction id
    paidAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_room", ["roomId"])
    .index("by_company", ["companyId"])
    .index("by_room_date", ["roomId", "date"])
    .index("by_bookingCode", ["bookingCode"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_vivaOrderCode", ["vivaOrderCode"])
    .index("by_status", ["status"]),

  // ─── UNLOCKED Premium Subscriptions (platform-wide) ───
  premiumSubscriptions: defineTable({
    userId: v.id("users"),
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
    price: v.number(),
    startDate: v.number(),
    endDate: v.number(),
    isActive: v.boolean(),
    cancelledAt: v.optional(v.number()),
    // ── In-App Purchase fields ──
    platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
    productId: v.optional(v.string()),         // App Store / Play Store product ID
    transactionId: v.optional(v.string()),     // Store transaction ID
    originalTransactionId: v.optional(v.string()), // For subscription renewals
    purchaseToken: v.optional(v.string()),     // Android purchase token
  })
    .index("by_user", ["userId"])
    .index("by_transactionId", ["transactionId"]),

  // ─── Social Posts ───
  posts: defineTable({
    // Author can be a player or a company
    authorType: v.union(v.literal("user"), v.literal("company")),
    authorUserId: v.optional(v.id("users")),
    authorCompanyId: v.optional(v.id("companies")),
    // Content
    text: v.string(),
    media: v.array(v.object({
      type: v.union(v.literal("image"), v.literal("video")),
      url: v.string(),
      storageId: v.optional(v.id("_storage")),
    })),
    // Room reference (which room they played / are reviewing)
    roomId: v.optional(v.id("rooms")),
    rating: v.optional(v.number()), // 1-5 star rating
    // Engagement
    likes: v.number(),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_author_user", ["authorUserId"])
    .index("by_author_company", ["authorCompanyId"])
    .index("by_room", ["roomId"]),

  postLikes: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_user_post", ["userId", "postId"]),

  postComments: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"]),

  // ─── Slot Availability Alerts ───
  // Users subscribe to get notified when an unavailable slot becomes free
  slotAlerts: defineTable({
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    createdAt: v.number(),
    notified: v.boolean(), // true once the alert has fired
  })
    .index("by_user", ["userId"])
    .index("by_slot", ["roomId", "date", "time"])
    .index("by_user_slot", ["userId", "roomId", "date", "time"]),

  // ─── In-App Notifications ───
  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("booking"),
      v.literal("cancelled"),
      v.literal("reminder"),
      v.literal("promo"),
      v.literal("system"),
      v.literal("slot_available"),
      v.literal("new_room"),
      v.literal("photos_ready"),
      v.literal("friend_request"),
      v.literal("friend_accepted"),
      v.literal("booking_invite")
    ),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    createdAt: v.number(),
    data: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  // ─── Guest Slot Alerts (widget users without accounts) ───
  guestSlotAlerts: defineTable({
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    contact: v.string(), // email or phone
    createdAt: v.number(),
    notified: v.boolean(),
  })
    .index("by_slot", ["roomId", "date", "time"])
    .index("by_contact", ["contact"]),

  // ─── Room Reviews ───
  reviews: defineTable({
    userId: v.id("users"),
    roomId: v.id("rooms"),
    bookingId: v.id("bookings"),
    rating: v.number(), // 1-5 stars
    text: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_booking", ["bookingId"])
    .index("by_room_created", ["roomId", "createdAt"]),

  // ─── Content Reports (Guideline 1.2 — UGC moderation) ───
  reports: defineTable({
    postId: v.optional(v.id("posts")),
    commentId: v.optional(v.id("postComments")),
    reporterId: v.id("users"),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("hate_speech"),
      v.literal("inappropriate"),
      v.literal("other")
    ),
    details: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("dismissed"),
      v.literal("removed")
    ),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_reporter_post", ["reporterId", "postId"])
    .index("by_reporter_comment", ["reporterId", "commentId"])
    .index("by_status", ["status"]),

  // ─── Room reports: a player reports a room they played (see reports.ts) ───
  // Only the UNLOCKED team can read these. Never returned to companies.
  roomReports: defineTable({
    userId: v.id("users"),
    bookingId: v.id("bookings"),
    roomId: v.id("rooms"),
    companyId: v.optional(v.id("companies")),
    kind: roomReportKindV,
    description: v.string(),
    photoStorageIds: v.array(v.id("_storage")),
    status: roomReportStatusV,
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_booking", ["bookingId"])
    .index("by_user", ["userId"]),

  // ─── Player reports: a business reports a player's behaviour (see reports.ts) ───
  // companyId is the reporter: never returned to the player or other businesses.
  playerReports: defineTable({
    userId: v.id("users"),              // the reported player
    bookingId: v.id("bookings"),
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
    categories: v.array(playerReportCategoryV),
    gameEndAt: v.number(),              // used for batching and expiry
    createdAt: v.number(),
    reply: v.optional(v.string()),      // the player's answer
    repliedAt: v.optional(v.number()),
    voidedAt: v.optional(v.number()),   // set by an admin: report no longer counts
    voidedNote: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_booking", ["bookingId"])
    .index("by_company", ["companyId"]),

  // ─── Blocked Users (Guideline 1.2 — ability to block abusive users) ───
  blockedUsers: defineTable({
    blockerId: v.id("users"),
    blockedUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blocker", ["blockerId"])
    .index("by_blocker_blocked", ["blockerId", "blockedUserId"]),

  // ─── Friendships ───
  friendships: defineTable({
    requesterId: v.id("users"),     // user who sent the request
    receiverId: v.id("users"),      // user who received the request
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined")
    ),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_requester", ["requesterId"])
    .index("by_receiver", ["receiverId"])
    .index("by_pair", ["requesterId", "receiverId"])
    .index("by_receiver_status", ["receiverId", "status"]),

  // ─── Booking Invites (invite friends to a booking) ───
  bookingInvites: defineTable({
    bookingId: v.id("bookings"),
    inviterId: v.id("users"),       // user who created the booking / sent invite
    inviteeId: v.id("users"),       // friend being invited
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined")
    ),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_invitee", ["inviteeId"])
    .index("by_invitee_status", ["inviteeId", "status"]),

  // ─── Widget Bundle (serves JS from Convex site) ───
  widgetBundle: defineTable({
    content: v.string(),
    version: v.string(),
    updatedAt: v.number(),
  }),

  // ─── Company Photo Presets (branding template for booking photos) ───
  companyPhotoPresets: defineTable({
    companyId: v.id("companies"),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    logoPosition: v.union(
      v.literal("top-left"),
      v.literal("top-right"),
      v.literal("bottom-left"),
      v.literal("bottom-right"),
      v.literal("bottom-center")
    ),
    logoScale: v.optional(v.number()), // 0.05–0.5 (fraction of image width)
    brandColor: v.string(), // hex e.g. "#FF1E1E"
    watermarkOpacity: v.number(), // 0.0 – 1.0
    textTemplate: v.optional(v.string()), // e.g. "You escaped in {{time}}"
    overlayUrl: v.optional(v.string()), // full-frame transparent PNG overlay
    overlayStorageId: v.optional(v.id("_storage")),
    useOverlay: v.optional(v.boolean()), // true = use overlay instead of logo
    updatedAt: v.number(),
  })
    .index("by_company", ["companyId"]),

  // ─── Booking Photos (company-uploaded, auto-branded) ───
  bookingPhotos: defineTable({
    bookingId: v.id("bookings"),
    companyId: v.id("companies"),
    // Storage references
    originalStorageId: v.id("_storage"),
    originalUrl: v.string(),
    processedStorageId: v.optional(v.id("_storage")),
    processedUrl: v.optional(v.string()),
    // Processing status
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    // Metadata
    order: v.number(), // display order
    uploadedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_company", ["companyId"])
    .index("by_status", ["status"]),

  // ════════════════════════════════════════════════════════════
  // Photos Tool — Standalone photo management (photos.unlocked.gr)
  // ════════════════════════════════════════════════════════════

  // ─── Standalone Photos (not tied to bookings) ───
  standalonePhotos: defineTable({
    companyId: v.id("companies"),
    roomId: v.optional(v.id("rooms")),
    // Storage
    originalStorageId: v.id("_storage"),
    originalUrl: v.string(),
    processedStorageId: v.optional(v.id("_storage")),
    processedUrl: v.optional(v.string()),
    // R2 path for public hosting
    r2Path: v.optional(v.string()),
    r2Url: v.optional(v.string()),
    // Editing state
    filter: v.optional(v.string()),
    adjustments: v.optional(v.object({
      brightness: v.optional(v.number()),
      contrast: v.optional(v.number()),
      saturation: v.optional(v.number()),
      temperature: v.optional(v.number()),
      sharpness: v.optional(v.number()),
      vignette: v.optional(v.number()),
      grain: v.optional(v.number()),
    })),
    // Overlays
    hasWatermark: v.optional(v.boolean()),
    hasFrame: v.optional(v.boolean()),
    frameOverlayUrl: v.optional(v.string()),
    textOverlay: v.optional(v.string()),
    sticker: v.optional(v.string()),
    // Metadata
    teamName: v.optional(v.string()),
    escaped: v.optional(v.boolean()),
    escapeTime: v.optional(v.string()),
    // Status
    status: v.union(
      v.literal("draft"),
      v.literal("ready"),
      v.literal("sent")
    ),
    // Tracking
    emailsSent: v.number(),
    hostedPageViews: v.number(),
    downloads: v.number(),
    createdAt: v.number(),
  })
    .index("by_company", ["companyId"])
    .index("by_company_created", ["companyId", "createdAt"])
    .index("by_room", ["roomId"])
    .index("by_status", ["companyId", "status"]),

  // ─── Photo Emails (delivery tracking) ───
  photoEmails: defineTable({
    photoId: v.id("standalonePhotos"),
    companyId: v.id("companies"),
    recipientEmail: v.string(),
    resendMessageId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("bounced"),
      v.literal("failed")
    ),
    sentAt: v.number(),
    openedAt: v.optional(v.number()),
  })
    .index("by_photo", ["photoId"])
    .index("by_company", ["companyId", "sentAt"]),

  // ─── Per-Room Photo Presets (photos.unlocked.gr) ───
  roomPhotoPresets: defineTable({
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    logoPosition: v.optional(v.union(
      v.literal("top-left"),
      v.literal("top-right"),
      v.literal("bottom-left"),
      v.literal("bottom-right"),
      v.literal("bottom-center")
    )),
    logoScale: v.optional(v.number()), // 0.05–0.5 (fraction of image width)
    brandColor: v.optional(v.string()),
    watermarkOpacity: v.optional(v.number()),
    textTemplate: v.optional(v.string()),
    overlayUrl: v.optional(v.string()),
    overlayStorageId: v.optional(v.id("_storage")),
    useOverlay: v.optional(v.boolean()),
    defaultFilter: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_company", ["companyId"]),

  // ─── Discount Codes ───
  discountCodes: defineTable({
    code: v.string(),                    // e.g. "ENTERPRISE2026"
    // Codes only apply to the Unlimited subscription; legacy plan values are
    // read as "unlimited".
    plan: v.union(v.literal("unlimited"), v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
    period: v.union(v.literal("monthly"), v.literal("yearly")),
    durationMonths: v.number(),          // how long the free period lasts (12 = 1 year)
    maxUses: v.optional(v.number()),     // null = unlimited
    usedCount: v.number(),
    isActive: v.boolean(),
    expiresAt: v.optional(v.number()),   // timestamp, null = never expires
    createdAt: v.number(),
  })
    .index("by_code", ["code"]),

  // ─── Pay-as-you-go platform fee invoices (one per company per month) ───
  platformFeeInvoices: defineTable({
    companyId: v.id("companies"),
    month: v.string(),                   // "YYYY-MM" the fees are for
    bookingCount: v.number(),
    amountCents: v.number(),             // after the monthly cap
    status: v.union(
      v.literal("creating"),             // claimed, Stripe invoice not sent yet
      v.literal("open"),                 // sent, waiting for payment
      v.literal("paid"),
      v.literal("void"),
      v.literal("failed"),               // Stripe call failed; retried next run
    ),
    stripeInvoiceId: v.optional(v.string()),
    hostedInvoiceUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_company_month", ["companyId", "month"])
    .index("by_month", ["month"])
    .index("by_stripeInvoiceId", ["stripeInvoiceId"]),
});
