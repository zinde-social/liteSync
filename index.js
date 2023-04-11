import { readFileSync, existsSync, writeFileSync } from 'fs';

import { Contract } from 'crossbell.js'
import got from 'got';

import config from "./config.json" assert { type: 'json' };

const statusFileName = "status.json";

(async() => {

  // Initialize contract
  const contract = new Contract(config.ethereumPrivateKey);

  // Collect feed
  let feedData = [];
  try {
    const response = await got.get(config.feedLink).json();
    feedData = response.items;
    console.log("Collected feed counts", feedData.length);
  } catch (e) {
    console.error("Failed to collect feed, error", e);
    return
  }

  // Read last run time
  let status = {
    lastRun: new Date(0), // From the beginning
  };
  if (existsSync(statusFileName)) {
    try {
      const statusBuf = await readFileSync(statusFileName);
      status = JSON.parse(statusBuf.toString('utf8'));
      console.log("Last run", status.lastRun);
    } catch (e) {
      console.warn("Failed to get last run data, error", e);
    }
  }

  // Filter feed
  const filteredFeed = feedData.filter(feed => new Date(feed.date_published) > status.lastRun);
  console.log("Feed filtered, remain: ", filteredFeed.length);

  // Sort feed
  filteredFeed.sort((feedA, feedB) => new Date(feedA.date_published) - new Date(feedB.date_published))
  console.log("Feed sorted");

  // Parse feed ( https://docs.crossbell.io/docs/specs/metadata/note-metadata )
  const parsedFeed = filteredFeed.map(feed => ({
    title: feed.title,
    content: feed.content_html,
    sources: ["liteSync"],
    date_published: feed.date_published,
  }));
  console.log("Feed parsed");

  // Post to Crossbell
  for (const feed of parsedFeed) {
    try {
      const postNoteResponse = await contract.postNote(
        config.targetCharacter,
        feed
      );
      console.log("Note posted on crossbell with id", postNoteResponse.data.noteId, "tx", postNoteResponse.transactionHash)
      status.lastRun = feed.date_published; // Mark as last successfully posted note's published date
    } catch (e) {
      console.warn("Failed to post note since", feed, ", error", e);
      break
    }
  }

  // Save current run
  console.log(`Saving status...`);
  writeFileSync(statusFileName, JSON.stringify(status));

  console.log("Sync finished!")

})();
