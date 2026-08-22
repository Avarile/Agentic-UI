// Two small Jotai families supporting the mid-run steering UI.
//
// `steerOverlayHeightFamily` is a layout channel rather than state: the in-flight
// steer overlay floats above the composer, and the message list reserves an equal
// band of bottom padding so the newest message clears it. The overlay measures
// itself and publishes the number here because only it knows its rendered height.
//
// `escalatingSteerFamily` is a pure UX gate. Double-arming is harmless on the
// server (a run seals once and drains its queue in order), but every escalation
// control advertises "one interrupt at a time" by disabling, and the chip-derived
// state cannot see an arm until its response lands.

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/**
 * Measured pixel height of the in-flight steer overlay for a conversation.
 * The overlay floats above the composer over the bottom of the message scroll
 * area; the messages reserve an equal band of bottom padding (see
 * `MessagesView`) so the newest message clears it at rest and older messages
 * scroll behind it. `InFlightSteers` publishes its height here and resets it to
 * 0 on unmount, so the entry is never stale — the atomFamily is not GC'd, but
 * each holds a single number per visited conversation.
 */
export const steerOverlayHeightFamily = atomFamily((_conversationId: string) => atom<number>(0));

/**
 * Set synchronously before a bubble's arm request and cleared on settlement.
 * Purely a UX gate: with the atomic in-place arm, a double-arm is harmless
 * server-side (the run seals once and drains the whole queue in order), but
 * every escalation control advertises "one interrupt at a time" by disabling,
 * and the chip-derived check cannot see an arm until its response lands.
 */
export const escalatingSteerFamily = atomFamily((_conversationId: string) => atom<boolean>(false));
