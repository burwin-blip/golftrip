# Draft night reveal videos

One video per player, named by the player's id (the end of their profile URL):

    public/videos/draft-reveals/ben-dowdell.mp4
    public/videos/draft-reveals/alan-lozer.mp4

When that player is picked, the Big Board plays the video full-screen after the
"THE PICK IS IN" countdown, then slams their card onto the roster. No file → the
normal reveal. Playback is capped at 30 seconds.

- Format: MP4 (H.264 video + AAC audio), 720p, ideally under ~15 MB.
- Shrink one on a Mac:
  `ffmpeg -i in.mov -vf "scale=-2:720" -c:v libx264 -preset slow -crf 26 -c:a aac -b:a 128k -movflags +faststart out.mp4`
  (no ffmpeg? QuickTime Player → File → Export As → 720p).
- The build lists the videos and their length (scripts/scan-reveal-videos.mjs);
  a file it can't read is skipped with a warning, and that player gets the
  normal reveal.
