type InternalAvailability = {
  available: boolean;
  stockTracked: boolean;
  stockQuantity: number | null;
};

/** Project internal inventory to the public availability flag. Never serialize
 * inventory counts or tracking settings into a customer-facing product. */
export function toPublicProduct<T extends InternalAvailability>(product:T):Omit<T,"stockTracked"|"stockQuantity"> {
  const {stockTracked,stockQuantity,...publicProduct} = product;
  return {
    ...publicProduct,
    available:product.available && (!stockTracked || (stockQuantity !== null && stockQuantity > 0)),
  };
}
