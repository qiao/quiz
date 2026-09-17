/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setRspack(true);
// PNG frames and BT.709 color give sharp text, correct colors, and a smaller file than JPEG frames.
Config.setVideoImageFormat("png");
Config.setColorSpace("bt709");
// The video has only short sound effects, so 128 kbit/s AAC is enough, and the file stays small.
Config.setAudioBitrate("128k");
Config.setOverwriteOutput(true);
Config.overrideBundlerConfig(enableTailwind);
