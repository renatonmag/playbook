const fs = require("fs");
const { randomUUID } = require("node:crypto");
const uuidv4 = randomUUID;

const SAMPLES_PER_CATEGORY = {
  gain: 500,
  loss: 200,
  flat: 500,
}; // 500 gain, 500 loss, 500 flat = 1500 total
const OUTPUT_FILE = "balanced_trading_data.json";

const rawData = fs.readFileSync("cleaned_comp_2.json", "utf8");
const items = JSON.parse(rawData);

const RULES = {
  components: [
    {
      id: 1,
      title: "sideways",
      occurrence: 1,
      signal: "gain",
    },
    {
      id: 2,
      title: "pullback",
      signal: "loss",
    },
    {
      id: 3,
      title: "breakout",
      signal: "loss",
    },
    {
      id: 4,
      title: "spike and channel",
      signal: "loss",
    },
    {
      id: 5,
      title: "trading range",
      signal: "loss",
    },
    {
      id: 6,
      title: "small pb",
      signal: "loss",
    },
  ],
  details: [],
};

const getNoiseId = () => Math.floor(Math.random() * 6) + 1;

function generateTrade(targetResult) {
  const selectedComps = [];
  // Number of components from 1 to 10
  const targetLength = Math.floor(Math.random() * 20) + 1;

  let attempts = 0;
  while (selectedComps.length < targetLength && attempts < 50) {
    attempts++;

    // Pick a random rule or generate noise
    const useRule = Math.random() > 0.4;
    let compId;
    let details = [];

    if (useRule) {
      const rule =
        RULES.components[Math.floor(Math.random() * RULES.components.length)];
      // If we are building a "gain" trade, favor "gain" signals
      const alignment =
        rule.signal === targetResult || targetResult === "flat" || true;

      if (alignment) {
        compId = rule.id;
        // if (Math.random() < 0.5) {
        //   const dRule =
        //     RULES.details[Math.floor(Math.random() * RULES.details.length)];
        //   details.push(dRule.id);
        // }
      }
    }

    // If no rule was picked or alignment failed, add Noise
    if (!compId) {
      compId = getNoiseId();
      if (Math.random() > 0.5) details.push(getNoiseId());
    }

    selectedComps.push({ component: compId, details });
  }

  return {
    id: uuidv4(),
    result: targetResult, // Forced for balancing
    version: Math.floor(Math.random() * 10),
    selectedComps,
  };
}

// --- MAIN EXECUTION ---
const finalDataset = [];

["gain", "loss", "flat"].forEach((category) => {
  for (let i = 0; i < SAMPLES_PER_CATEGORY[category]; i++) {
    finalDataset.push(generateTrade(category));
  }
});

// Shuffle the dataset so the model doesn't see all gains first
const shuffled = finalDataset.sort(() => Math.random() - 0.5);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(shuffled, null, 2));
console.log(
  `Generated ${shuffled.length} balanced samples (1-10 components each).`,
);
