import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Company / Business ───
  companies: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    logo: v.string(),
    address: v.string(),
    city: v.string(),
    description: v.string(),
    password: v.string(), // hashed in production
    verified: v.boolean(),
    createdAt: v.number(),
    // Subscription offering
    subscriptionEnabled: v.boolean(),
    subscriptionMonthlyPrice: v.optional(v.number()),
    subscriptionYearlyPrice: v.optional(v.number()),
    subscriptionPerks: v.optional(v.array(v.string())),
  })
    .index("by_email", ["email"]),

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
    isNew: v.optional(v.boolean()),
    isFeatured: v.optional(v.boolean()),
    isTrending: v.optional(v.boolean()),
    // Company fields
    companyId: v.optional(v.id("companies")),
    paymentTerms: v.optional(v.union(
      v.literal("full"),
      v.literal("deposit_20")
    )),
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
      days: v.array(v.number()), // 0=Sun,1=Mon,...6=Sat — which days overflow is active
    })),
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
  }).index("by_email", ["email"]),

  badges: defineTable({
    userId: v.id("users"),
    title: v.string(),
    icon: v.string(),
    earned: v.boolean(),
    date: v.optional(v.string()),
  }).index("by_user", ["userId"]),

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
      v.literal("cancelled")
    ),
    bookingCode: v.string(),
    createdAt: v.number(),
    // Company payment tracking
    depositPaid: v.optional(v.number()),
    paymentTerms: v.optional(v.union(
      v.literal("full"),
      v.literal("deposit_20")
    )),
    // ─── Booking source & company tracking ───
    companyId: v.optional(v.id("companies")),
    source: v.optional(v.union(v.literal("unlocked"), v.literal("external"))),
    externalSource: v.optional(v.string()), // "EscapeAll", "Phone", "Walk-in", "Private Event"
    playerName: v.optional(v.string()),
    playerContact: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentStatus: v.optional(v.union(
      v.literal("paid"),
      v.literal("deposit"),
      v.literal("unpaid"),
      v.literal("na")
    )),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_room", ["roomId"])
    .index("by_company", ["companyId"])
    .index("by_room_date", ["roomId", "date"]),

  // ─── Player Subscriptions ───
  playerSubscriptions: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
    price: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    isActive: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_company", ["companyId"]),

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
});
