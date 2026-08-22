// A ref to a per-message `<audio>` element, wired to report playback state.
//
// Used by the two TTS engine hooks for message-level playback: it attaches
// play/pause/ended listeners that drive `setIsPlaying`, and revokes the object URL
// on end so a spoken message does not leak its blob.
//
// Starts `muted` — playback is unmuted deliberately once a source is attached,
// which is what keeps autoplay policies from rejecting the element outright.
//
// Note the name collision: the default export is called `useCustomAudioRef`, but
// this is not the same hook as useCustomAudioRef.ts, which handles the *global*
// player. Import by path, not by name.

import { useEffect, useRef } from 'react';

export default function useCustomAudioRef({
  setIsPlaying,
}: {
  setIsPlaying: (isPlaying: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const handleEnded = () => {
      setIsPlaying(false);
      console.log('message audio ended');
      if (audioRef.current) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    };

    const handleStart = () => {
      setIsPlaying(true);
      console.log('message audio started');
    };

    const handlePause = () => {
      setIsPlaying(false);
      console.log('message audio paused');
    };

    const audioElement = audioRef.current;

    if (audioRef.current) {
      audioRef.current.muted = true;
      audioRef.current.addEventListener('ended', handleEnded);
      audioRef.current.addEventListener('play', handleStart);
      audioRef.current.addEventListener('pause', handlePause);
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('play', handleStart);
        audioElement.removeEventListener('pause', handlePause);
        URL.revokeObjectURL(audioElement.src);
      }
    };
  }, [setIsPlaying]);

  return { audioRef };
}
