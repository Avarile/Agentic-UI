// Types for the live-announcer channel.

export interface AnnounceOptions {
  message: string;
  isStatus?: boolean;
}

export const MESSAGE_UPDATE_INTERVAL = 7000;
