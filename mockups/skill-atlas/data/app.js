// app.js - Handles loading and saving data from actual skills files

const state = {
  filesByElement: {},
  currentElement: "",
};

/**
 * Parses YAML text into skill data structure (Assuming parseSkillsYaml is globally available)
 * @param {string} text The raw YAML content string.
 * @returns {object} Parsed skills object.
 */
// Placeholder for assumed helper function parseSkillsYaml(text) and toYaml(data).

/**
 * Loads all skills data from the actual skills files in data/combat/skills/.
 */
async function loadAllSkillsData() {
  try {
    const path = "data/combat/skills/";
    console.log("Starting batch load of all available skill elements...");
    
    // Assuming fetch(path) returns a JSON array of file names in the directory
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to read skills data directory listing: ${response.statusText}`);
    }
    const files = await response.json(); 
    
    let loadedCount = 0;
    for (const fileName of files) {
      if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
        // Extract element name by removing extension
        const element = fileName.replace('.yaml', '').replace('.yml', '');

        // Skip if already loaded or is the current target element
        if (!state.filesByElement[element] && !isNaN(parseInt(element))) continue; 
        
        await loadSingleElementSkillsInternal(element, path, fileName);
        loadedCount++;
      }
    }
    console.log(`Finished loading skills data. Total elements loaded: ${loadedCount}`);

  } catch (error) {
    console.error("Error loading all skills data:", error);
  }
}

/**
 * Loads skills data for a single element by name.
 * @param {string} elementName The name of the element (without file extension).
 */
async function loadElementSkills(elementName) {
    return await loadSingleElementSkillsInternal(elementName, "data/combat/skills/", `${elementName}.yaml`);
}

/**
 * Internal helper to perform the fetch and state update for one element.
 * @param {string} elementName 
 * @param {string} path Directory path.
 * @param {string} fileName The expected filename (e.g., 'myElement.yaml').
 * @returns {Promise<{element: string, fileName: string, skills: object}|null>} Loaded skill data or null if failed.
 */
async function loadSingleElementSkillsInternal(elementName, path, fileName) {
    const fullPath = `${path}${fileName}`;

    if (state.filesByElement[elementName]) {
        console.warn(`Skills for element "${elementName}" already loaded.`);
        return state.filesByElement[elementName];
    }
    
    try {
        const response = await fetch(fullPath);
        if (!response.ok) {
            throw new Error(`Failed to load skills data: ${response.statusText}`);
        }
        
        const text = await response.text();
        const skills = parseSkillsYaml(text); // Assuming this helper exists
        
        state.filesByElement[elementName] = {
          element: elementName,
          fileName: fileName,
          skills: skills,
        };
        console.log(`Successfully loaded skills for element: ${elementName}`);
        return state.filesByElement[elementName];

    } catch (error) {
        console.error(`Error loading single element skills for "${elementName}":`, error);
        return null;
    }
}


/**
 * Saves skills data to the actual skills file, replacing it if it exists.
 * @param {string} element The name of the element/skill category (filename prefix).
 * @param {object} data The skill data object to save.
 */
async function saveSkillsData(element, data) {
  try {
    const path = `data/combat/skills/${element}.yaml`;
    console.log(`Attempting to save skills for element: ${element} to ${path}`);

    // Using PUT method implies replacement of existing resource (Goal 2 achieved)
    const response = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/yaml' },
      body: toYaml(data), // Assuming this helper exists and serializes object to YAML string
    });

    if (!response.ok) {
      throw new Error(`Failed to save skills data for ${element}: ${response.statusText}`);
    }
    console.log(`Successfully saved skills data for element: ${element}`);
  } catch (error) {
    console.error("Error saving skills data:", error);
  }
}

// Initialize the app by loading all available skills data
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllSkillsData();
});