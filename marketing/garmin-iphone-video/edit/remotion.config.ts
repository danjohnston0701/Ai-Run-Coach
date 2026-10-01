import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
// 16 GB Mac that has already run out of RAM once on this project — keep rendering lean.
Config.setConcurrency(2);
Config.setOffthreadVideoCacheSizeInBytes(512 * 1024 * 1024);
