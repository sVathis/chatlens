import { ActionIcon, Box, Group, Text } from "@mantine/core";
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
 * A voice message as a play button, a progress bar (click to seek) and the time left.
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

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !(length > 0)) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    audio.currentTime = Math.min(1, Math.max(0, fraction)) * length;
    setPosition(audio.currentTime);
  };

  const progress = length > 0 ? Math.min(100, (position / length) * 100) : 0;

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
      <Box
        onClick={seek}
        data-voice-progress
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          cursor: "pointer",
          background: "rgba(127, 127, 127, 0.3)",
          overflow: "hidden",
        }}
      >
        <Box style={{ width: `${progress}%`, height: "100%", background: accent }} />
      </Box>
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
