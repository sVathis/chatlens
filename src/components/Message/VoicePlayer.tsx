import { ActionIcon, Group, Text } from "@mantine/core";
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { useRef, useState } from "react";

/** Seconds as m:ss. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface VoicePlayerProps {
  url: string;
  /** The length the export recorded, shown until the file says its own. */
  durationMs?: number;
  accent: string;
}

/**
 * A voice message as a play button, a seek bar and the time.
 * The sound itself comes from a hidden audio element playing the file from the export.
 */
export function VoicePlayer({ url, durationMs, accent }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(durationMs ? durationMs / 1000 : 0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void Promise.resolve(audio.play()).catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !(length > 0)) return;
    audio.currentTime = Math.min(length, Math.max(0, Number(event.target.value)));
    setPosition(audio.currentTime);
  };

  return (
    <Group gap={8} wrap="nowrap" data-voice-player style={{ minWidth: 190 }}>
      <ActionIcon
        radius="xl"
        size={32}
        color={accent}
        variant="filled"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        onClick={toggle}
      >
        {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
      </ActionIcon>
      {/* A native range input: arrow keys, Home/End and Page Up/Down seek, and screen readers announce it */}
      <input
        type="range"
        data-voice-progress
        aria-label="Seek voice message"
        aria-valuetext={`${clock(position)} of ${clock(length)}`}
        min={0}
        max={length > 0 ? length : 1}
        step={0.1}
        value={Math.min(position, length > 0 ? length : 0)}
        disabled={!(length > 0)}
        onChange={seek}
        style={{ flex: 1, minWidth: 0, accentColor: accent, cursor: length > 0 ? "pointer" : "default" }}
      />
      <Text size="xs" style={{ fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {clock(playing || position > 0 ? position : length)}
      </Text>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        aria-label="Voice message"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const { duration } = event.currentTarget;
          if (Number.isFinite(duration) && duration > 0) setLength(duration);
        }}
      />
    </Group>
  );
}
