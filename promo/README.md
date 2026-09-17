# Quiz skill promo video

This folder holds the promo video of the `quiz` skill, made with
[Remotion](https://www.remotion.dev). The video is 1920 by 1080 pixels, 60 frames per second, and
15.6 seconds long.

```bash
npm i                                                # install the packages
npx remotion studio                                  # preview and edit the video
npx remotion render QuizPromo out/quiz-promo.mp4     # render the video
```

Each scene is a file in `src/scenes/`, and `src/QuizPromo.tsx` joins the scenes with fades. The
Geist fonts in `public/fonts/` use the SIL Open Font License (`public/fonts/OFL.txt`). The sound
effects load from `remotion.media` when the video renders.
