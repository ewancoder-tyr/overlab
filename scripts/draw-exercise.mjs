// Draws a new exercise in the house style: `pnpm draw <exercise id> "<position 1>" "<position 2>"`.
//
//   pnpm draw cable-kickback \
//     "bent forward at a low cable, upper arm along the torso, elbow bent 90 degrees" \
//     "same, arm straight back, triceps squeezed"
//
// Writes public/exercise-drawings/<id>-1.svg and -2.svg. Look at both before keeping them, and run
// it again for a pair that came out wrong (wrong pose, a stray letter, grey shading). Optional
// `--pose1 <image> --pose2 <image>` attach a picture of each position (any photo or drawing) when
// words are not enough.
//
// How it works, so it can be redone by hand (see also public/exercise-drawings/README.md):
// 1. Two existing drawings, rendered black on white, are the STYLE references. Without them
//    the image model drifts to another lifter and another ink.
// 2. Codex (`codex exec`, its image generation) draws both positions at once, so they match,
//    as pure black ink on white: the only thing that traces cleanly.
// 3. ImageMagick thresholds to black and white, scales to 70% and trims; potrace turns it into
//    one light-coloured path. These settings keep a drawing near 25 KB, which matters because
//    the service worker prefetches every drawing.
//
// Needs codex, magick (ImageMagick 7), potrace and rsvg-convert on the PATH.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DRAWINGS = resolve('public/exercise-drawings');
/** The fill of every drawing: light lines on the app's dark surface. */
const FILL = '#f6f5ef';
/** A standing and a lying drawing, so the model sees the lifter, the boots and the equipment. */
const STYLE_REFERENCES = ['squat-1', 'bench-press-1'];

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args.splice(at, 2)[1];
};
const pose1 = option('--pose1');
const pose2 = option('--pose2');
const [id, position1, position2] = args;
if (!id || !position1 || !position2 || !/^[a-z0-9-]+$/.test(id)) {
  console.error(
    'Usage: pnpm draw <exercise-id> "<position 1>" "<position 2>" [--pose1 img --pose2 img]',
  );
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), `draw-${id}-`));
const run = (command, commandArgs, options = {}) =>
  execFileSync(command, commandArgs, { stdio: ['ignore', 'inherit', 'inherit'], ...options });

// 1. Style references: the light SVGs recoloured black and rendered on white.
const images = STYLE_REFERENCES.map((name, index) => {
  const svg = join(work, `style-${index + 1}.svg`);
  writeFileSync(
    svg,
    readFileSync(join(DRAWINGS, `${name}.svg`), 'utf8').replaceAll(FILL, '#000000'),
  );
  const png = join(work, `style-${index + 1}.png`);
  run('rsvg-convert', ['-w', '768', '-b', 'white', svg, '-o', png]);
  return `style-${index + 1}.png`;
});
for (const [index, pose] of [pose1, pose2].entries()) {
  if (pose) {
    copyFileSync(pose, join(work, `pose-${index + 1}.png`));
    images.push(`pose-${index + 1}.png`);
  }
}

// 2. The prompt that made the whole set. Change it only together with every drawing.
const poseNote =
  pose1 || pose2
    ? 'pose-1.png and pose-2.png (where attached) show the positions; follow their pose, not their style.'
    : '';
const prompt = `Use your IMAGE GENERATION capability (not code, not SVG, not drawing scripts) to create two new illustrations of the exercise "${id}".
style-1.png and style-2.png are the STYLE references: draw in exactly their style, so the new images belong to the same set. ${poseNote}

Image 1 (start position): ${position1}
Image 2 (end position): ${position2}
Same camera angle, same man and same equipment in both, so the two images form a matching pair. Choose the angle that shows the movement most clearly.

Style: a brutal, gritty, retro-futuristic 1950s atomic-age instruction manual look, like the illustrations on a post-apocalyptic wrist computer terminal. Heavy bold confident ink outlines with uneven brush weight, the same broad-shouldered square-jawed muscular man with a determined grimace and slicked hair, shorts and combat boots (barefoot or sneakers only if the activity demands it, e.g. swimming), chunky rugged industrial equipment (thick riveted plates, heavy frames, cables), a few bold hatching strokes for muscle definition. Original generic character: NOT any existing mascot or franchise character, no logos.

Hard technical constraints (the image will be auto-traced into a single-colour vector):
- Pure solid black ink on a pure flat white background. Only black and white. No gray, no gradients, no halftone, no shading fills, no colour.
- No text, no letters, no numbers, no labels, no border, no frame, no background scenery, no floor shadow.
- Whole figure and equipment fully inside the frame with a margin. Square 1024x1024.

Save the results as PNG files exactly at: out-1.png and out-2.png (relative to the current directory). Do not modify any other files.`;

// `-i` takes several values, so `--` is needed to end them, and stdin must be closed, or codex
// waits for a prompt on it.
run(
  'codex',
  [
    'exec',
    '--skip-git-repo-check',
    '-s',
    'workspace-write',
    '-C',
    work,
    ...images.flatMap((image) => ['-i', join(work, image)]),
    '--',
    prompt,
  ],
  { cwd: work },
);

// 3. Trace.
for (const n of [1, 2]) {
  const png = join(work, `out-${n}.png`);
  if (!existsSync(png)) {
    console.error(`Codex did not produce ${png}. Its output is above; run again.`);
    process.exit(1);
  }
  const pbm = join(work, `out-${n}.pbm`);
  run('magick', [
    png,
    '-colorspace',
    'gray',
    '-resize',
    '70%',
    '-threshold',
    '50%',
    '-trim',
    '+repage',
    '-bordercolor',
    'white',
    '-border',
    '6',
    pbm,
  ]);
  const svg = join(DRAWINGS, `${id}-${n}.svg`);
  run('potrace', ['--svg', '-t', '6', '-O', '1', '-u', '2', '--flat', '-C', FILL, pbm, '-o', svg]);
  console.log(`Wrote ${svg}`);
}
console.log(`Generated pictures kept in ${work}`);
