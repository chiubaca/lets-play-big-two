/**
 * Shuffles the elements of the provided array in-place.
 *
 * @template T - The type of elements in the array.
 * @param {T[]} array - The array to be shuffled.
 * @returns {T[]} The shuffled array.
 *
 * @example
 * const numbers = [1, 2, 3, 4, 5];
 * const shuffledNumbers = shuffleArray(numbers);
 * console.log(shuffledNumbers); // e.g., [3, 1, 4, 2, 5]
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Distributes elements of an array into a specified number of subsets as evenly as possible.
 *
 * @template T - The type of elements in the array.
 * @param {T[]} array - The array to be split into subsets.
 * @param {number} numOfSubsets - The number of subsets to divide the array into.
 * @returns {T[][]} An array containing `numOfSubsets` arrays, each holding a portion of the original array's elements.
 *
 * @example
 * // Divide an array of numbers into 3 subsets
 * const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
 * const dealtNumbers = dealArray(numbers, 3);
 * console.log(dealtNumbers); // e.g., [[1, 4, 7], [2, 5, 8], [3, 6, 9]]
 */
export const dealArray = <T>(array: T[], numOfSubsets: number): T[][] => {
  const subsets: T[][] = Array.from({ length: numOfSubsets }, () => []);
  array.forEach((item, index) => {
    subsets[index % numOfSubsets].push(item);
  });
  return subsets;
};
