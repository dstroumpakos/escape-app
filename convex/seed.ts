import { mutation } from "./_generated/server";

const ROOM_IMAGES = [
  "https://images.unsplash.com/photo-1509248961085-879c6c3c7b05?w=600&q=80",
  "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&q=80",
  "https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=600&q=80",
  "https://images.unsplash.com/photo-1505506874110-6a7a69069a08?w=600&q=80",
  "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=600&q=80",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80",
];

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query("rooms").first();
    if (existing) return "Already seeded";

    // Seed rooms
    const roomIds = [];
    const roomsData = [
      {
        title: "The Haunted Manor",
        location: "San Francisco, CA",
        image: ROOM_IMAGES[0],
        rating: 4.9, reviews: 342, duration: 60,
        difficulty: 4, maxDifficulty: 5,
        players: "2-6", playersMin: 2, playersMax: 6,
        price: 35, theme: "Horror",
        tags: ["Horror Theme", "Live Actor", "Physical Puzzles", "Multi-room"],
        description: "A spine-chilling adventure through a Victorian mansion.",
        story: "You and your team have been invited to spend the night at the infamous Blackwood Manor. Legend has it that the previous owner, Lord Blackwood, went mad and trapped his guests in an elaborate puzzle. As the doors lock behind you, you realize the legends are true. You have 60 minutes to unravel the mystery, find the hidden key, and escape before you become the manor's newest permanent residents.",
        isNew: true, isFeatured: true, isTrending: true,
      },
      {
        title: "Cyberpunk Lab 2099",
        location: "San Francisco, CA",
        image: ROOM_IMAGES[3],
        rating: 4.7, reviews: 218, duration: 75,
        difficulty: 5, maxDifficulty: 5,
        players: "3-8", playersMin: 3, playersMax: 8,
        price: 42, theme: "Sci-Fi",
        tags: ["Sci-Fi Theme", "High-Tech Puzzles", "Neon Atmosphere", "Team Challenge"],
        description: "Hack into the mainframe before the AI takes control.",
        story: "The year is 2099. A rogue AI called NEXUS has taken control of the city's infrastructure. You've infiltrated its core laboratory — a neon-lit maze of holographic puzzles and encrypted terminals. Crack the codes, disable the firewall, and shut down NEXUS before it achieves full sentience.",
        isFeatured: true, isTrending: true,
      },
      {
        title: "Pharaoh's Tomb",
        location: "Oakland, CA",
        image: ROOM_IMAGES[1],
        rating: 4.8, reviews: 189, duration: 60,
        difficulty: 3, maxDifficulty: 5,
        players: "2-5", playersMin: 2, playersMax: 5,
        price: 30, theme: "Historical",
        tags: ["Historical Theme", "Physical Puzzles", "Atmospheric", "Beginner Friendly"],
        description: "Explore ancient Egyptian chambers and escape the curse.",
        story: "Deep beneath the Egyptian desert, your archaeology team has uncovered the lost tomb of Pharaoh Amenhotep. But when you break the seal, an ancient curse activates. Sand begins pouring in, traps trigger, and the only way out is to solve the riddles the Pharaoh left behind.",
        isNew: true,
      },
      {
        title: "Murder Mystery Hotel",
        location: "Berkeley, CA",
        image: ROOM_IMAGES[2],
        rating: 4.6, reviews: 156, duration: 90,
        difficulty: 4, maxDifficulty: 5,
        players: "4-8", playersMin: 4, playersMax: 8,
        price: 38, theme: "Mystery",
        tags: ["Mystery Theme", "Live Actors", "Story-Driven", "Multi-room"],
        description: "Solve the crime before the killer strikes again.",
        story: "Welcome to the Grand Meridian Hotel, circa 1927. Last night, the hotel's owner was found dead in the penthouse suite. Every guest is a suspect, and the evidence is scattered across multiple rooms. As amateur detectives, you must interrogate suspects, analyze clues, and piece together the truth.",
        isTrending: true,
      },
      {
        title: "Space Station Omega",
        location: "San Jose, CA",
        image: ROOM_IMAGES[4],
        rating: 4.5, reviews: 97, duration: 60,
        difficulty: 3, maxDifficulty: 5,
        players: "2-6", playersMin: 2, playersMax: 6,
        price: 33, theme: "Sci-Fi",
        tags: ["Sci-Fi Theme", "Zero-G Simulation", "Tech Puzzles", "Immersive Sound"],
        description: "Save the crew before the station loses orbit.",
        story: "Communication with Earth has been lost. The station's orbit is decaying, and life support is failing. Your crew must navigate between modules, repair critical systems, and re-establish contact before Omega plunges into the atmosphere.",
      },
      {
        title: "The Witch's Forest",
        location: "Palo Alto, CA",
        image: ROOM_IMAGES[5],
        rating: 4.8, reviews: 274, duration: 60,
        difficulty: 2, maxDifficulty: 5,
        players: "2-4", playersMin: 2, playersMax: 4,
        price: 28, theme: "Horror",
        tags: ["Horror Theme", "Atmospheric", "Beginner Friendly", "Enchanted"],
        description: "Break the spell before the forest traps you forever.",
        story: "You wandered too deep into the Thornwood Forest, and now the ancient witch has cast her binding spell. The trees shift around you, paths disappear, and enchanted creatures guard the way out. Find the three enchanted relics and break the spell before midnight.",
        isNew: true, isTrending: true,
      },
    ];

    for (const room of roomsData) {
      const id = await ctx.db.insert("rooms", room);
      roomIds.push(id);
    }

    // Seed time slots for each room (for today's date)
    const today = new Date().toISOString().split("T")[0];
    const slotTimes = [
      { time: "10:00 AM", price: 35 },
      { time: "11:30 AM", price: 35 },
      { time: "1:00 PM", price: 35 },
      { time: "2:30 PM", price: 35 },
      { time: "4:00 PM", price: 38 },
      { time: "5:30 PM", price: 38 },
      { time: "7:00 PM", price: 42 },
      { time: "8:30 PM", price: 42 },
    ];

    for (const roomId of roomIds) {
      for (let i = 0; i < slotTimes.length; i++) {
        await ctx.db.insert("timeSlots", {
          roomId,
          date: today,
          time: slotTimes[i].time,
          available: i !== 2 && i !== 7, // 1:00 PM and 8:30 PM unavailable
          price: slotTimes[i].price,
        });
      }
    }

    // Seed user
    const userId = await ctx.db.insert("users", {
      name: "Alex Rivera",
      email: "alex@escapist.com",
      password: "password123",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80",
      title: "Pro Escapist",
      memberSince: "Member since 2025",
      played: 24,
      escaped: 21,
      awards: 8,
      wishlist: [roomIds[1], roomIds[4]],
    });

    // Seed badges
    const badgesData = [
      { title: "First Escape", icon: "🔓", earned: true, date: "2025-03-15" },
      { title: "Speed Demon", icon: "⚡", earned: true, date: "2025-05-22" },
      { title: "Horror Survivor", icon: "👻", earned: true, date: "2025-07-10" },
      { title: "Team Leader", icon: "👑", earned: true, date: "2025-09-01" },
      { title: "Puzzle Master", icon: "🧩", earned: true, date: "2025-11-18" },
      { title: "Night Owl", icon: "🦉", earned: false },
    ];

    for (const badge of badgesData) {
      await ctx.db.insert("badges", { userId, ...badge });
    }

    // Seed bookings
    await ctx.db.insert("bookings", {
      userId,
      roomId: roomIds[0],
      date: "Feb 14, 2026",
      time: "7:00 PM",
      players: 4,
      total: 171.96,
      status: "upcoming",
      bookingCode: "UNL-A1B2C3",
      createdAt: Date.now(),
    });

    await ctx.db.insert("bookings", {
      userId,
      roomId: roomIds[2],
      date: "Mar 1, 2026",
      time: "8:30 PM",
      players: 3,
      total: 93.99,
      status: "upcoming",
      bookingCode: "UNL-D4E5F6",
      createdAt: Date.now(),
    });

    await ctx.db.insert("bookings", {
      userId,
      roomId: roomIds[1],
      date: "Jan 10, 2026",
      time: "6:00 PM",
      players: 2,
      total: 87.99,
      status: "completed",
      bookingCode: "UNL-G7H8I9",
      createdAt: Date.now() - 86400000 * 30,
    });

    return "Seeded successfully";
  },
});
