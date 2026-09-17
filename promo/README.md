# Quiz skill promo video

This folder holds the promo video of the `quiz` skill, made with
[Remotion](https://www.remotion.dev). The video is 1920 by 1080 pixels, 60 frames per second, and
15.6 seconds long.

```bash
npm i                                                # install the packages
npx remotion studio                                  # preview and edit the video
npx remotion render QuizPromo out/quiz-promo.mp4     # render the video
```

Each scene is a file in `src/scenes/`, and `src/QuizPromo.tsx` joins the scenes with fades. Each
time in the code is in seconds: `sec()` in `src/theme.ts` gives the frame at the `FPS` value. The
Geist fonts in `public/fonts/` use the SIL Open Font License (`public/fonts/OFL.txt`). The sound
effects load from `remotion.media` when the video renders.

## Settings for X

X accepts video at 60 frames per second or less, and X encodes each upload again. A small file
therefore uploads and processes fast. `remotion.config.ts` sets these values, so the render command
above makes a file for X:

- H.264 video, High profile, `yuv420p`, BT.709 color: about 1.1 Mbit/s.
- AAC sound at 128 kbit/s.
- PNG frames. The flat dark scenes compress better from PNG frames than from JPEG frames.

The result is about 2.4 MB. The file index (`moov`) is at the start, so a player can start before
the full file loads.

## GIF for the root README

The GIF in `docs/media/` is half size at 15 frames per second:

```bash
npx remotion render QuizPromo out/quiz-promo.gif --codec=gif --every-nth-frame=4 --scale=0.5
cp out/quiz-promo.gif ../docs/media/quiz-promo.gif
```
