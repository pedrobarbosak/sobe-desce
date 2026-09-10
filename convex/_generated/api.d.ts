/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as game_actions from "../game/actions.js";
import type * as game_advance from "../game/advance.js";
import type * as game_bots from "../game/bots.js";
import type * as game_dark from "../game/dark.js";
import type * as game_seat from "../game/seat.js";
import type * as game_session from "../game/session.js";
import type * as game_state from "../game/state.js";
import type * as game_table from "../game/table.js";
import type * as game_timer from "../game/timer.js";
import type * as games from "../games.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_code from "../lib/code.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_validators from "../lib/validators.js";
import type * as presence from "../presence.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "game/actions": typeof game_actions;
  "game/advance": typeof game_advance;
  "game/bots": typeof game_bots;
  "game/dark": typeof game_dark;
  "game/seat": typeof game_seat;
  "game/session": typeof game_session;
  "game/state": typeof game_state;
  "game/table": typeof game_table;
  "game/timer": typeof game_timer;
  games: typeof games;
  history: typeof history;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/code": typeof lib_code;
  "lib/email": typeof lib_email;
  "lib/validators": typeof lib_validators;
  presence: typeof presence;
  sessions: typeof sessions;
  users: typeof users;
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

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
