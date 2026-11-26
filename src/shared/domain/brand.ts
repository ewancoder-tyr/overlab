/**
 * "Branded" (a.k.a. nominal) types.
 *
 * TypeScript is structurally typed: two `string` aliases are interchangeable, so nothing stops you
 * from passing an exercise id where a set id is expected. A brand adds a phantom property that
 * exists only at compile time, making the two types incompatible while both remain plain strings
 * at runtime (no wrapper object, nothing extra in the stored JSON).
 *
 * The property name contains the brand itself (`__brand_SetId`), so brands can be stacked:
 * `EventId & Brand<'SetId'>` is an event id that is additionally known to identify a set.
 */
export type Brand<TBrand extends string> = {
    readonly [K in TBrand as `__brand_${K}`]: true;
};

export type Branded<T, TBrand extends string> = T & Brand<TBrand>;
