// The user's favourite models and agents.
//
// Tab-isolated (`createTabIsolatedAtom`) rather than plain persisted storage:
// favourites are toggled as working state, and cross-tab sync would make one tab's
// toggle jump in another. The server copy is authoritative — see
// data-provider/Favorites.ts.

import type { TUserFavorite } from 'librechat-data-provider';
import { createTabIsolatedAtom } from './jotai-utils';

export type Favorite = TUserFavorite;

export type FavoriteModel = {
  model: string;
  endpoint: string;
};

export type FavoritesState = Favorite[];

/**
 * This atom stores the user's favorite models/agents
 */
export const favoritesAtom = createTabIsolatedAtom<FavoritesState>('favorites', []);
