import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { createCompanySession } from "./companySession";

// DEV ONLY: fake data for my own dev deployment. Do not commit this file.
// Run:  npx.cmd convex run devSeed:seed
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const companyId = await ctx.db.insert("companies", {
      name: "Test Escape Co",
      email: "company@test.local",
      phone: "+302100000000",
      logo: "",
      address: "Test Street 1",
      city: "Athens",
      description: "Fake company for local testing",
      password: "not-a-real-password",
      verified: true,
      createdAt: now,
      onboardingStatus: "approved",
      platformPlan: "unlimited",
    });

    const roomId = await ctx.db.insert("rooms", {
      title: "The Labyrinth (test)",
      location: "Athens",
      image: "",
      rating: 4.7,
      reviews: 12,
      duration: 60,
      difficulty: 3,
      maxDifficulty: 5,
      players: "2-6",
      playersMin: 2,
      playersMax: 6,
      price: 80,
      theme: "Mystery",
      tags: ["test"],
      description: "Test room",
      story: "Test story",
      companyId,
      isActive: true,
    });

    const mkUser = (name: string, email: string) =>
      ctx.db.insert("users", {
        name,
        email,
        avatar: "",
        title: "Rookie",
        memberSince: "2026",
        played: 0,
        escaped: 0,
        awards: 0,
        wishlist: [],
      });
    const booker = await mkUser("Test Booker", "booker@test.local");
    const friend = await mkUser("Test Friend", "friend@test.local");

    const bookingId = await ctx.db.insert("bookings", {
      userId: booker,
      roomId,
      date: new Date().toISOString().slice(0, 10),
      time: "20:00",
      players: 4,
      total: 80,
      status: "upcoming",
      bookingCode: "TEST" + Math.floor(Math.random() * 9000 + 1000),
      createdAt: now,
      companyId,
      source: "unlocked",
    });

    const sessionToken = await createCompanySession(ctx, companyId, "web");

    return { companyId, roomId, bookingId, booker, friend, sessionToken };
  },
});

// DEV ONLY: one more upcoming booking, for testing the end-of-game flow.
export const addBooking = internalMutation({
  args: {
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
    userId: v.id("users"),
    time: v.string(),
    players: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("bookings", {
      userId: args.userId,
      roomId: args.roomId,
      date: new Date().toISOString().slice(0, 10),
      time: args.time,
      players: args.players,
      total: 80,
      status: "upcoming",
      bookingCode: "TEST" + Math.floor(Math.random() * 9000 + 1000),
      createdAt: Date.now(),
      companyId: args.companyId,
      source: "unlocked",
    });
  },
});