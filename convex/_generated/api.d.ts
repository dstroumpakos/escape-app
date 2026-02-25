/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bookings from "../bookings.js";
import type * as companies from "../companies.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as moderation from "../moderation.js";
import type * as notifications from "../notifications.js";
import type * as passwordUtils from "../passwordUtils.js";
import type * as posts from "../posts.js";
import type * as premium from "../premium.js";
import type * as rooms from "../rooms.js";
import type * as seed from "../seed.js";
import type * as slotAlerts from "../slotAlerts.js";
import type * as timeSlots from "../timeSlots.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";
import type * as widget from "../widget.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bookings: typeof bookings;
  companies: typeof companies;
  email: typeof email;
  http: typeof http;
  moderation: typeof moderation;
  notifications: typeof notifications;
  passwordUtils: typeof passwordUtils;
  posts: typeof posts;
  premium: typeof premium;
  rooms: typeof rooms;
  seed: typeof seed;
  slotAlerts: typeof slotAlerts;
  timeSlots: typeof timeSlots;
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
