# War & Peace — a reading companion

A small, self-hosted bilingual reader and study notebook. It uses the two EPUBs supplied in this folder and runs without an application server or API keys.

## Start it

Double-click `index.html` to open the reader directly in your browser. Keep the `data` folder and the other project files alongside it.

To also serve it to other devices on your home network, run this from the project directory:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` on the host, or `http://HOST-IP:8000` on another device on your home network. Stop the server with Ctrl-C.

## Read and study

Choose a chapter and use the page arrows to read. The reader uses precomputed sentence-level anchors to advance the Russian and English pages together. The default anchors use sentence length, shared names, numbers and other text clues; they are approximate and can be wrong. On a narrow screen, use the language buttons above the page to switch sides.

Select a word or phrase **within one Russian paragraph** to save it. The browser sends the selected text (not its surrounding paragraph) to MyMemory for a suggested English translation. For a single Russian word, it also looks up possible inflections in English Wiktionary and fills the grammar fields when an entry has a supported form. Choose between alternatives and check the fields: the lookup does not determine which reading fits the sentence, may not find a form, and does not automatically determine verb conjugation. All suggestions can be edited. These lookups need an internet connection and may be unavailable, blocked, or subject to third-party limits; the reader and saved cards work without them.

Both card types appear in Review. Reveal the answer, then choose Again, Hard, Good, or Easy to schedule the next review. Again returns in one minute; other choices use increasing day intervals. This is a simple spaced-repetition system, not Anki's exact algorithm.

The English EPUB's metadata advertises Pevear and Volokhonsky, but its actual text matches the Maude translation; it is not the requested Pevear and Volokhonsky edition. Volume 1 part 1 and volume 2 part 2 have different chapter divisions in the two editions, so their English passages are matched approximately by length and may start or end in a different place. Original French in the Russian edition is retained; EPUB footnote references are omitted.

Highlights, cards, review dates, theme, and reading position are stored in the browser's local storage, separately on each browser and device. Use **Collection → Export backup** regularly and import it on another device; importing replaces that browser's current collection. Clearing browser data can erase your progress. The supplied English edition should remain on your private home server unless you have rights to distribute it.

## Rebuild the book data

The generated `data/chapters.js` is included. If you replace or edit the source EPUBs, regenerate with `python3 scripts/extract.py`. The script expects the supplied EPUB layouts and reports a mismatch if their parts cannot be paired.

## Improve alignment with offline translation

The included passage pairs use text clues. To generate translation-based pairs, run this once from the project directory on a computer with internet access:

```sh
./scripts/setup_alignment.sh
```

The script installs Argos Translate and its Russian-to-English model in this project, then starts a local alignment pass across all chapters. The downloads need internet access; once installed, subsequent runs can proceed offline. A full pass can take a long time, and the script prints each chapter as it finishes. Stop it with Ctrl-C and rerun the command to resume. Keep only one alignment pass running at a time. To try only the first chapter, use `./scripts/setup_alignment.sh --chapter 1`.

Completed chapter pairs are saved in `data/alignment.js`, and individual translations are cached in `data/translation-cache.sqlite3`. The reader loads the saved pairs without running Argos. The next pass skips a completed chapter when its source text, alignment algorithm and model are unchanged; changed chapters are realigned, and their unchanged sentences use the translation cache. Reload `index.html` to see newly generated pairs. The app labels which method produced the current chapter. The `.venv` and `.argos` folders contain the local installation and model; keep them if you plan to resume a pass.

The two editions divide some chapters differently. Alignment is calculated within each existing chapter pairing, so it cannot repair a passage that was placed in the wrong chapter during extraction. The Maude translation and the original also sometimes divide or rephrase sentences differently. After regenerating the book data with `extract.py`, run `python3 scripts/align.py` again to rebuild heuristic anchors, or rerun the setup command for translation-based pairs.
