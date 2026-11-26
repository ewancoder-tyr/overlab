import { MuscleGroupId } from '@catalog/domain/muscle-group';

/**
 * Geometry of the muscle map: a stylised body seen from the front and from the back, drawn in a
 * 200 x 200 coordinate space (the template crops the empty margins). Every shape is an SVG path
 * so the template needs a single loop.
 *
 * The drawing is deliberately schematic. Its job is to show at a glance which regions an exercise
 * trains and how strongly, not to be an anatomy chart.
 */
export interface BodyShape {
    /** The muscle group this region belongs to; `undefined` for neutral parts (head, hands...). */
    readonly muscleGroupId: MuscleGroupId | undefined;
    /** SVG path data. */
    readonly path: string;
}

/** Horizontal centre lines of the two figures. */
const FRONT = 50;
const BACK = 150;

/** An ellipse as path data: two half-circle arcs. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
    return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
}

/** A rectangle with rounded corners as path data. */
function box(x: number, y: number, width: number, height: number, radius: number): string {
    const w = width - radius * 2;
    const h = height - radius * 2;
    const corner = (dx: number, dy: number): string => `a${radius},${radius} 0 0,1 ${dx},${dy}`;
    return (
        `M${x + radius},${y} h${w} ${corner(radius, radius)} v${h} ${corner(-radius, radius)} ` +
        `h${-w} ${corner(-radius, -radius)} v${-h} ${corner(radius, -radius)} Z`
    );
}

/**
 * Most muscles come in a left/right pair. This draws an ellipse `offset` units to each side of
 * the figure's centre line.
 */
function pair(
    muscleGroupId: MuscleGroupId | undefined,
    centre: number,
    offset: number,
    cy: number,
    rx: number,
    ry: number,
): BodyShape[] {
    return [
        { muscleGroupId, path: ellipse(centre - offset, cy, rx, ry) },
        { muscleGroupId, path: ellipse(centre + offset, cy, rx, ry) },
    ];
}

/** Parts both views share: head, neck, hands, feet. */
function neutralParts(centre: number): BodyShape[] {
    return [
        { muscleGroupId: undefined, path: ellipse(centre, 14, 9, 10) },
        { muscleGroupId: undefined, path: box(centre - 4, 23, 8, 9, 2) },
        ...pair(undefined, centre, 31, 106, 4, 5),
        ...pair(undefined, centre, 8, 193, 6, 3.5),
    ];
}

// Order matters only where shapes overlap: later shapes are drawn on top.
export const BODY_SHAPES: readonly BodyShape[] = [
    // --- Front view ---
    ...neutralParts(FRONT),
    { muscleGroupId: undefined, path: box(FRONT - 14, 85, 28, 14, 5) }, // hips
    ...pair('side-delts', FRONT, 23, 41, 5, 8),
    ...pair('front-delts', FRONT, 16, 39, 6, 7),
    { muscleGroupId: 'chest', path: box(FRONT - 13, 36, 12, 17, 4) },
    { muscleGroupId: 'chest', path: box(FRONT + 1, 36, 12, 17, 4) },
    ...pair('biceps', FRONT, 25, 62, 5, 11),
    ...pair('forearms', FRONT, 29, 88, 4.5, 12),
    { muscleGroupId: 'obliques', path: box(FRONT - 14, 56, 6, 28, 3) },
    { muscleGroupId: 'obliques', path: box(FRONT + 8, 56, 6, 28, 3) },
    { muscleGroupId: 'abs', path: box(FRONT - 7, 55, 14, 30, 4) },
    ...pair('quads', FRONT, 8, 123, 7.5, 22),
    ...pair('calves', FRONT, 8, 169, 5, 17),

    // --- Back view ---
    ...neutralParts(BACK),
    ...pair('side-delts', BACK, 24, 43, 4, 7),
    ...pair('rear-delts', BACK, 18, 40, 7, 7),
    {
        // Upper back as one shape: wide at the shoulders (traps, lats), narrowing to the waist.
        muscleGroupId: 'back',
        path: `M${BACK - 12},33 L${BACK + 12},33 L${BACK + 15},50 L${BACK + 9},72 L${BACK - 9},72 L${BACK - 15},50 Z`,
    },
    { muscleGroupId: 'lower-back', path: box(BACK - 9, 73, 18, 12, 3) },
    ...pair('triceps', BACK, 25, 62, 5, 11),
    ...pair('forearms', BACK, 29, 88, 4.5, 12),
    ...pair('glutes', BACK, 8, 96, 7.5, 9),
    ...pair('hamstrings', BACK, 8, 127, 7.5, 19),
    ...pair('calves', BACK, 8, 169, 6, 17),
];
