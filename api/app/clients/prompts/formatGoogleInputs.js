/**
 * Converts a plain object into Google Vertex AI's typed-value wire format.
 *
 * Vertex's prediction API requires every value tagged by type (`struct_val`, `list_val`,
 * `string_val`, `float_val`, `int_val`), so this walks the object recursively and wraps each
 * leaf. Integers and floats are distinguished explicitly because Vertex rejects a float where
 * an int is expected.
 *
 * Design: kept as its own module because the transformation is purely structural and worth
 * testing in isolation from any client.
 */
/**
 * Formats an object to match the struct_val, list_val, string_val, float_val, and int_val format.
 *
 * @param {Object} obj - The object to be formatted.
 * @returns {Object} The formatted object.
 *
 * Handles different types:
 * - Arrays are wrapped in list_val and each element is processed.
 * - Objects are recursively processed.
 * - Strings are wrapped in string_val.
 * - Numbers are wrapped in float_val or int_val depending on whether they are floating-point or integers.
 */
function formatGoogleInputs(obj) {
  const formattedObj = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      // Handle arrays
      if (Array.isArray(value)) {
        formattedObj[key] = { list_val: value.map((item) => formatGoogleInputs(item)) };
      }
      // Handle objects
      else if (typeof value === 'object' && value !== null) {
        formattedObj[key] = formatGoogleInputs(value);
      }
      // Handle numbers
      else if (typeof value === 'number') {
        formattedObj[key] = Number.isInteger(value) ? { int_val: value } : { float_val: value };
      }
      // Handle other types (e.g., strings)
      else {
        formattedObj[key] = { string_val: [value] };
      }
    }
  }

  return { struct_val: formattedObj };
}

module.exports = formatGoogleInputs;
