/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminSession from "../adminSession.js";
import type * as appStore from "../appStore.js";
import type * as appleAuth from "../appleAuth.js";
import type * as badges from "../badges.js";
import type * as billing from "../billing.js";
import type * as billingStripe from "../billingStripe.js";
import type * as bookingPhotos from "../bookingPhotos.js";
import type * as bookings from "../bookings.js";
import type * as cancelRules from "../cancelRules.js";
import type * as cancellations from "../cancellations.js";
import type * as codes from "../codes.js";
import type * as community from "../community.js";
import type * as companies from "../companies.js";
import type * as companyPayments from "../companyPayments.js";
import type * as companyPaymentsData from "../companyPaymentsData.js";
import type * as companyRules from "../companyRules.js";
import type * as companySession from "../companySession.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as emailVerify from "../emailVerify.js";
import type * as externalLinks from "../externalLinks.js";
import type * as friends from "../friends.js";
import type * as games from "../games.js";
import type * as googleAuth from "../googleAuth.js";
import type * as http from "../http.js";
import type * as merch from "../merch.js";
import type * as merchPayments from "../merchPayments.js";
import type * as merchRules from "../merchRules.js";
import type * as migrations from "../migrations.js";
import type * as moderation from "../moderation.js";
import type * as notificationTexts from "../notificationTexts.js";
import type * as notifications from "../notifications.js";
import type * as passwordReset from "../passwordReset.js";
import type * as passwordUtils from "../passwordUtils.js";
import type * as plans from "../plans.js";
import type * as posts from "../posts.js";
import type * as premium from "../premium.js";
import type * as publicCache from "../publicCache.js";
import type * as push from "../push.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reportRules from "../reportRules.js";
import type * as reports from "../reports.js";
import type * as returnUrls from "../returnUrls.js";
import type * as reviews from "../reviews.js";
import type * as rooms from "../rooms.js";
import type * as seed from "../seed.js";
import type * as signupCodes from "../signupCodes.js";
import type * as slotAlerts from "../slotAlerts.js";
import type * as slotOffers from "../slotOffers.js";
import type * as slotRules from "../slotRules.js";
import type * as social from "../social.js";
import type * as standalonePhotos from "../standalonePhotos.js";
import type * as stats from "../stats.js";
import type * as stripe from "../stripe.js";
import type * as stripeSignature from "../stripeSignature.js";
import type * as timeSlots from "../timeSlots.js";
import type * as translate from "../translate.js";
import type * as translateHelpers from "../translateHelpers.js";
import type * as uploads from "../uploads.js";
import type * as userSession from "../userSession.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as widget from "../widget.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminSession: typeof adminSession;
  appStore: typeof appStore;
  appleAuth: typeof appleAuth;
  badges: typeof badges;
  billing: typeof billing;
  billingStripe: typeof billingStripe;
  bookingPhotos: typeof bookingPhotos;
  bookings: typeof bookings;
  cancelRules: typeof cancelRules;
  cancellations: typeof cancellations;
  codes: typeof codes;
  community: typeof community;
  companies: typeof companies;
  companyPayments: typeof companyPayments;
  companyPaymentsData: typeof companyPaymentsData;
  companyRules: typeof companyRules;
  companySession: typeof companySession;
  crons: typeof crons;
  email: typeof email;
  emailVerify: typeof emailVerify;
  externalLinks: typeof externalLinks;
  friends: typeof friends;
  games: typeof games;
  googleAuth: typeof googleAuth;
  http: typeof http;
  merch: typeof merch;
  merchPayments: typeof merchPayments;
  merchRules: typeof merchRules;
  migrations: typeof migrations;
  moderation: typeof moderation;
  notificationTexts: typeof notificationTexts;
  notifications: typeof notifications;
  passwordReset: typeof passwordReset;
  passwordUtils: typeof passwordUtils;
  plans: typeof plans;
  posts: typeof posts;
  premium: typeof premium;
  publicCache: typeof publicCache;
  push: typeof push;
  rateLimit: typeof rateLimit;
  reportRules: typeof reportRules;
  reports: typeof reports;
  returnUrls: typeof returnUrls;
  reviews: typeof reviews;
  rooms: typeof rooms;
  seed: typeof seed;
  signupCodes: typeof signupCodes;
  slotAlerts: typeof slotAlerts;
  slotOffers: typeof slotOffers;
  slotRules: typeof slotRules;
  social: typeof social;
  standalonePhotos: typeof standalonePhotos;
  stats: typeof stats;
  stripe: typeof stripe;
  stripeSignature: typeof stripeSignature;
  timeSlots: typeof timeSlots;
  translate: typeof translate;
  translateHelpers: typeof translateHelpers;
  uploads: typeof uploads;
  userSession: typeof userSession;
  users: typeof users;
  validation: typeof validation;
  widget: typeof widget;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
