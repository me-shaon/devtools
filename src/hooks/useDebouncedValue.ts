import { useEffect, useState } from "react";

/** Returns `value` after it has stopped changing for `delay` ms. Live tools use it to recompute as the user types. */
export function useDebouncedValue<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
