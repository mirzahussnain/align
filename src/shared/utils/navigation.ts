/**
 * Utility functions for handling complex navigation state and scroll spying.
 */

export interface NavGroupShape {
  id: string;
  items: Array<{ id: string; [key: string]: any }>;
  [key: string]: any;
}

/**
 * Finds the parent group ID of an active item.
 * Useful for horizontal top-navs that highlight the active category.
 *
 * @param groups The array of navigation groups (each containing an array of items).
 * @param activeItemId The currently active item ID (e.g. from an IntersectionObserver).
 * @param fallbackGroupId The default group ID to return if the item is not found.
 * @returns The ID of the parent group.
 */
export function getParentGroupId<T extends NavGroupShape>(
  groups: readonly T[],
  activeItemId: string,
  fallbackGroupId: string = ''
): string {
  const foundGroup = groups.find((group) =>
    group.items.some((item) => item.id === activeItemId)
  );
  
  return foundGroup ? foundGroup.id : fallbackGroupId;
}
