export type TechniqueId = string & { readonly _brand: 'TechniqueId' };

export function techniqueId(value: string) {
    return value as TechniqueId;
}

export interface Technique {
    id: TechniqueId;
    name: string;
}
