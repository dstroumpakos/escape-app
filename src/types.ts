export interface EscapeRoom {
  id: string;
  title: string;
  location: string;
  image: string;
  rating: number;
  reviews: number;
  duration: number;
  difficulty: number;
  maxDifficulty: number;
  players: string;
  playersMin: number;
  playersMax: number;
  price: number;
  theme: string;
  tags: string[];
  description: string;
  story: string;
  isNew?: boolean;
  isFeatured?: boolean;
  isTrending?: boolean;
  pricePerGroup?: { players: number; price: number }[];
}

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  title: string;
  memberSince: string;
  stats: {
    played: number;
    escaped: number;
    awards: number;
  };
  badges: Badge[];
  wishlist: string[];
}

export interface Badge {
  id: string;
  title: string;
  icon: string;
  earned: boolean;
  date?: string;
}

export interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
  price: number;
}

export type RootStackParamList = {
  MainTabs: undefined;
  RoomDetails: { id: string };
  DateTimeSelect: { id: string };
  Checkout: { id: string; date: string; time: string; players: number; total: number };
  BookingConfirmation: { id: string; date: string; time: string; players: number; total: number };
  MapView: undefined;
  // Company side
  CompanyAuth: undefined;
  CompanyTabs: undefined;
  CompanyRoomEditor: { roomId?: string };
  CompanyAvailability: { roomId: string; roomTitle: string };
  CompanyBookingDetail: { bookingId: string };
  CompanyAddBooking: { companyId: string; roomId?: string; date?: string; time?: string };
};

export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Social: undefined;
  Tickets: undefined;
  Profile: undefined;
};

export type CompanyTabParamList = {
  Today: undefined;
  Calendar: undefined;
  Rooms: undefined;
  Settings: undefined;
};
