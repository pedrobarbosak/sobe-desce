import { useEffect, useState } from "react";
import { sound } from "@/lib/sound";

/** Reactive view of the sound toggles. */
export function useSoundSettings() {
  const [, bump] = useState(0);
  useEffect(() => sound.subscribe(() => bump((n) => n + 1)), []);
  return {
    sfx: sound.sfxEnabled,
    music: sound.musicEnabled,
    setSfx: (on: boolean) => sound.setSfx(on),
    setMusic: (on: boolean) => sound.setMusic(on),
  };
}
