/**
 * Builds the instruction prompt used to have a model describe images.
 *
 * Used by the vision shim for endpoints whose model cannot natively accept images (notably
 * Assistants v1): a vision-capable model is asked to describe the image, and the description
 * is injected into the prompt as text.
 *
 * Design: the prompt enumerates specific aspects to cover and branches by content type
 * (photograph/illustration vs. chart/diagram vs. text), because a vague "describe this" yields
 * descriptions too shallow to substitute for the image itself.
 *
 * Connections:
 * - `server/services/ToolService.js` (`processVisionRequest`), via `ImageVisionTool`
 */
/**
 * Generates a prompt instructing the user to describe an image in detail, tailored to different types of visual content.
 * @param {boolean} pluralized - Whether to pluralize the prompt for multiple images.
 * @returns {string} - The generated vision prompt.
 */
const createVisionPrompt = (pluralized = false) => {
  return `Please describe the image${
    pluralized ? 's' : ''
  } in detail, covering relevant aspects such as:

  For photographs, illustrations, or artwork:
  - The main subject(s) and their appearance, positioning, and actions
  - The setting, background, and any notable objects or elements
  - Colors, lighting, and overall mood or atmosphere
  - Any interesting details, textures, or patterns
  - The style, technique, or medium used (if discernible)
  
  For screenshots or images containing text:
  - The content and purpose of the text
  - The layout, formatting, and organization of the information
  - Any notable visual elements, such as logos, icons, or graphics
  - The overall context or message conveyed by the screenshot
  
  For graphs, charts, or data visualizations:
  - The type of graph or chart (e.g., bar graph, line chart, pie chart)
  - The variables being compared or analyzed
  - Any trends, patterns, or outliers in the data
  - The axis labels, scales, and units of measurement
  - The title, legend, and any additional context provided
  
  Be as specific and descriptive as possible while maintaining clarity and concision.`;
};

module.exports = createVisionPrompt;
