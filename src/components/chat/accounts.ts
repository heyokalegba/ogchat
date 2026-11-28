"use client";

import { createContext } from "react";
import type { ClaudeAccount } from "@/lib/types";

/**
 * The Claude accounts there are to tell apart, the main one first, for a reply
 * to be marked with the colour of the one it ran on. Empty when there is only
 * one account, and then nothing is marked: there is nothing to tell apart.
 */
export const ClaudeAccounts = createContext<readonly ClaudeAccount[]>([]);
