import type { KGSaveData } from "../types/_save.js";
import type { GamePage } from "../types/game.js";

export class SavegameLoader {
	private readonly _game: GamePage;

	constructor(game: GamePage) {
		this._game = game;
	}

	/**
	 * Conveniently wraps the savegame loading process in an async construct.
	 *
	 * @param data The savegame data to load. We accept `null` here for convenience
	 * when dealing with `import`ed save game data.
	 * @returns Nothing
	 */
	load(data: string | null): Promise<void> {
		return new Promise((resolve, reject) => {
			if (data === null) {
				resolve();
				return;
			}

			// The game renamed its text import endpoint:
			// current versions expose `saveImportText`, older builds had
			// `saveImportDropboxText`. Calling a missing method rejected every
			// load with "is not a function", so accept whichever one exists.
			const game = this._game as GamePage & {
				saveImportText?: GamePage["saveImportText"];
				saveImportDropboxText?: GamePage["saveImportDropboxText"];
			};
			const importText = game.saveImportText?.bind(game) ?? game.saveImportDropboxText?.bind(game);
			if (!importText) {
				reject(new Error("The game exposes no text import function (saveImportText)."));
				return;
			}

			importText(data, (error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	}

	loadRaw(data: KGSaveData): Promise<void> {
		const compressed = this._game.compressLZData(JSON.stringify(data));
		return this.load(compressed);
	}
}
