import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { metablock } from "vite-plugin-userscript";
import manifest from "./package.json" with { type: "json" };

const filenameUserscript = "kitten-scientists.user.js";
const filenameMeta = "kitten-scientists.meta.js";

// Update links must point at this fork's releases, NOT upstream: with the
// upstream links, a userscript manager's auto-update would silently replace
// this build with the official English script.
const downloadURL = `https://github.com/c940949574/kitten-scientists-94C/releases/latest/download/kitten-scientists-zh-cn.user.js`;
const metaURL = `https://github.com/c940949574/kitten-scientists-94C/releases/latest/download/kitten-scientists-zh-cn.user.js`;

const PAYLOAD = JSON.stringify(
	readFileSync("./output/kitten-scientists.inject.js", "utf-8"),
);

export default defineConfig({
	build: {
		emptyOutDir: false,
		lib: {
			entry: "source/entrypoint-loader.ts",
			formats: ["es"],
		},
		outDir: "output",
		reportCompressedSize: false,
		rolldownOptions: {
			experimental: {
				attachDebugInfo: "none",
			},
			output: {
				comments: false,
				entryFileNames: filenameUserscript,
				extend: true,
				format: "es",
			},
		},
	},
	define: {
		PAYLOAD,
	},
	plugins: [
		metablock({
			override: {
				description: manifest.description,
				downloadURL,
				homepageURL: manifest.homepage,
				updateURL: metaURL,
				version: process.env.RELEASE_VERSION
					? process.env.RELEASE_VERSION
					: manifest.version,
			},
		}),
	],
});
