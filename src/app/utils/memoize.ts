/**
 * Creates a memoized version of a function.
 *
 * @param fn The function to memoize
 * @returns A memoized version of the function
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map();

  // Return a function that preserves the 'this' context
  const memoized = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    // Create a cache key from the arguments
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    // Call the original function with the correct 'this' context
    const result = fn.apply(this, args);
    cache.set(key, result);

    // Limit cache size to prevent memory leaks
    if (cache.size > 1000) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return result;
  };

  return memoized as (...args: Parameters<T>) => ReturnType<T>;
}
