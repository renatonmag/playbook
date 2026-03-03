const fs = require('fs');

/**
 * Transforms a JSON file by selecting specific attributes and applying
 * optional generator/transformer functions to them.
 * * @param {string} inputPath - Path to source JSON
 * @param {string} outputPath - Path to save new JSON
 * @param {Object} config - Keys to keep. Value can be true or a function(val, fullRow)
 */
async function transformJsonFile(inputPath, outputPath, config) {
  try {
    // 1. Read and parse the source file
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const items = JSON.parse(rawData);

    // 2. Map through the items
    const transformedItems = items.map((row) => {
      const newEntry = {};

      for (const [key, transform] of Object.entries(config)) {
        const originalValue = row[key];

        if (typeof transform === 'function') {
          // Pass the original value and the full row to the generator
          newEntry[key] = transform(originalValue, row);
        } else if (transform === true) {
          // Just copy the value as is
          newEntry[key] = originalValue;
        }
      }
      return newEntry;
    });

    // 3. Write the new file
    fs.writeFileSync(outputPath, JSON.stringify(transformedItems, null, 2));
    console.log(`Successfully created ${outputPath} with ${transformedItems.length} rows.`);
  } catch (error) {
    console.error("Error transforming JSON:", error.message);
  }
}

// --- CONFIGURATION & EXECUTION ---
let id = 1;
const config = {
  id: () => id++, // Keep as is
  title: true, // Transform to uppercase
};

transformJsonFile('components_rows.json', 'cleaned_components.json', config);