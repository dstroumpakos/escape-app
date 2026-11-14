/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as badges from "../badges.js";
import type * as billing from "../billing.js";
import type * as billingStripe from "../billingStripe.js";
import type * as bookingPhotos from "../bookingPhotos.js";
import type * as bookings from "../bookings.js";
import type * as cancelRules from "../cancelRules.js";
import type * as cancellations from "../cancellations.js";
import type * as companies from "../companies.js";
import type * as companyPayments from "../companyPayments.js";
import type * as companyPaymentsData from "../companyPaymentsData.js";
import type * as companySession from "../companySession.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as friends from "../friends.js";
import type * as http from "../http.js";
import type * as moderation from "../moderation.js";
import type * as notificationTexts from "../notificationTexts.js";
import type * as notifications from "../notifications.js";
import type * as passwordUtils from "../passwordUtils.js";
import type * as plans from "../plans.js";
import type * as posts from "../posts.js";
import type * as premium from "../premium.js";
import type * as reportRules from "../reportRules.js";
import type * as reports from "../reports.js";
import type * as reviews from "../reviews.js";
import type * as rooms from "../rooms.js";
import type * as seed from "../seed.js";
import type * as slotAlerts from "../slotAlerts.js";
import type * as slotRules from "../slotRules.js";
import type * as standalonePhotos from "../standalonePhotos.js";
import type * as stats from "../stats.js";
import type * as stripe from "../stripe.js";
import type * as stripeSignature from "../stripeSignature.js";
import type * as timeSlots from "../timeSlots.js";
import type * as translate from "../translate.js";
import type * as translateHelpers from "../translateHelpers.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as widget from "../widget.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  badges: typeof badges;
  billing: typeof billing;
  billingStripe: typeof billingStripe;
  bookingPhotos: typeof bookingPhotos;
  bookings: typeof bookings;
  cancelRules: typeof cancelRules;
  cancellations: typeof cancellations;
  companies: typeof companies;
  companyPayments: typeof companyPayments;
  companyPaymentsData: typeof companyPaymentsData;
  companySession: typeof companySession;
  crons: typeof crons;
  email: typeof email;
  friends: typeof friends;
  http: typeof http;
  moderation: typeof moderation;
  notificationTexts: typeof notificationTexts;
  notifications: typeof notifications;
  passwordUtils: typeof passwordUtils;
  plans: typeof plans;
  posts: typeof posts;
  premium: typeof premium;
  reportRules: typeof reportRules;
  reports: typeof reports;
  reviews: typeof reviews;
  rooms: typeof rooms;
  seed: typeof seed;
  slotAlerts: typeof slotAlerts;
  slotRules: typeof slotRules;
  standalonePhotos: typeof standalonePhotos;
  stats: typeof stats;
  stripe: typeof stripe;
  stripeSignature: typeof stripeSignature;
  timeSlots: typeof timeSlots;
  translate: typeof translate;
  translateHelpers: typeof translateHelpers;
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
