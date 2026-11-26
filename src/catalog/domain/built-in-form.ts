/**
 * How to perform each built-in exercise correctly, keyed by exercise id.
 *
 * Kept apart from the exercise table so that the involvement data there stays easy to scan.
 * A test checks that every built-in exercise has an entry here.
 */
export const BUILT_IN_FORM: Readonly<Record<string, string>> = {
    'bench-press':
        'Lie with your eyes under the bar, feet planted and shoulder blades pulled back and down. Lower the bar under control to the lower chest with the elbows 45 to 70 degrees from your sides, then press up and slightly back until the arms are straight. Keep the hips on the bench and the wrists stacked over the elbows.',
    'incline-bench-press':
        'Set the bench to 30 to 45 degrees. Keep the shoulder blades pulled back, lower the bar to the upper chest just below the collarbones, and press straight up. Do not let the shoulders roll forward at the bottom.',
    'dumbbell-bench-press':
        'Start with the dumbbells over the shoulders and the shoulder blades pulled back. Lower them to the sides of the chest until you feel a deep stretch, elbows slightly tucked, then press up and slightly together without banging them at the top.',
    'dumbbell-fly':
        'With a slight, fixed bend in the elbows, open the arms wide until the chest is fully stretched, then bring the dumbbells back together in a hugging arc. Move at the shoulder only: if the elbows bend and straighten, it has become a press.',
    'cable-fly':
        'Stand between the pulleys with a slight forward lean and a soft, fixed bend in the elbows. Let the hands travel back until the chest is stretched, then sweep them together in front of you. Keep the shoulders down and avoid shrugging.',
    'low-to-high-cable-fly':
        'Set the pulleys at their lowest. With a soft, fixed bend in the elbows and the palms turned up, sweep the hands up and together until they meet in front of the upper chest, then lower them back out and down until the chest is stretched. Keep the shoulders down: if they shrug, the weight is too heavy.',
    'high-to-low-cable-fly':
        'Set the pulleys above head height and lean slightly forward. With a soft, fixed bend in the elbows, sweep the hands down and together until they meet in front of the hips, then let them rise back out until the chest is stretched. The elbow angle stays the same throughout.',
    'pec-deck':
        'Set the seat so the handles are level with the mid-chest and keep the shoulder blades pulled back against the pad. With a soft, fixed bend in the elbows, bring the handles together in front of the chest, then let them travel back until the chest is fully stretched. Do not let the shoulders roll forward as the hands meet.',
    'push-up':
        'Hands slightly wider than the shoulders, body in one straight line from head to heels, abs and glutes tight. Lower until the chest almost touches the floor, elbows at about 45 degrees to the torso, then press back up to straight arms. Do not let the hips sag or pike up, and do not cut the depth short to get more reps.',
    dip: 'Support yourself on straight arms, lean the torso slightly forward and lower until the shoulders are just below the elbows, then press back up. Keep the shoulders away from the ears. More forward lean puts more work on the chest; a more upright torso puts more on the triceps.',
    'overhead-press':
        'Start with the bar on the upper chest, hands just outside the shoulders, glutes and abs tight. Press straight up, moving the head back and then through, so the bar finishes over the mid-foot with the arms locked. Do not lean back to turn it into an incline press.',
    'dumbbell-shoulder-press':
        'Sit with the back supported and the dumbbells beside the shoulders, elbows slightly in front of the body. Press up until the arms are straight without clanging the dumbbells together, then lower until the hands are level with the ears or below. Keep the lower back against the pad.',
    'lateral-raise':
        'With a slight bend in the elbows and a slight forward lean, raise the arms out to the sides until they are about level with the shoulders, leading with the elbows. Lower slowly. Avoid shrugging and avoid swinging the torso.',
    'face-pull':
        'Set a rope at face height. Pull it towards the eyes while spreading the hands apart, finishing with the elbows high and the hands beside the ears. Pause briefly, then return under control. Keep the ribs down rather than leaning back.',
    'reverse-fly':
        'Hinge forward with a flat back, or lie chest-down on an incline bench. With a soft bend in the elbows, raise the arms out to the sides until they are level with the shoulders, then lower slowly. Use a light weight and do not let momentum do the work.',
    'cable-rear-delt-fly':
        'Stand side-on to a pulley set at about shoulder height and take the cable with the far hand, arm across the body. With a soft bend in the elbow, draw the hand out and back in a wide arc, like drawing a sword, until the arm is out to the side. Return slowly to a full stretch across the chest. Do not turn the torso.',
    'machine-rear-delt-fly':
        'Sit facing the pad with the handles at shoulder height and the arms almost straight. Sweep the hands out and back, and slightly down, until the arms are in line with the shoulders, then return slowly without letting the weights touch down. Keep the chest on the pad and the shoulders away from the ears. No jerking.',
    'pull-up':
        'Hang from the bar with the arms fully straight and the hands slightly wider than the shoulders. Pull the elbows down and back until the chin clears the bar, chest lifted towards it. Lower all the way to a full hang on every rep, without swinging or kicking.',
    'lat-pulldown':
        'Grip slightly wider than the shoulders and lean back a little. Pull the bar to the upper chest by driving the elbows down towards the hips, then let it rise until the arms are straight and the lats are stretched. Do not rock the torso to move the weight.',
    'lat-prayer':
        'Face a high pulley with a rope or bar, hinge forward a little and start with the arms reaching up and forward so the lats are stretched. Keeping the arms almost straight, sweep the hands down in an arc to the thighs, then let them rise back slowly. The movement is at the shoulder only: the elbows do not bend.',
    'barbell-row':
        'Hinge at the hips with a flat back, torso between horizontal and 45 degrees. Pull the bar to the lower ribs with the elbows travelling back past the torso, then lower until the arms are straight. The torso angle stays the same throughout.',
    'seated-cable-row':
        'Sit tall with a slight bend in the knees. Pull the handle to the lower ribs, squeezing the shoulder blades together, then let the arms reach forward and the shoulder blades spread for a full stretch. Keep the torso nearly still.',
    'single-arm-dumbbell-row':
        'Support yourself with one hand and the same-side knee on a bench, back flat and roughly parallel to the floor. Let the dumbbell hang with the arm straight and the shoulder blade stretched forward, then pull it to the hip with the elbow travelling back past the torso. Lower all the way. Do not twist the torso to lift it.',
    deadlift:
        'Stand with the bar over the mid-foot, grip just outside the legs and bring the shins to the bar. Flatten the back, brace, and push the floor away, keeping the bar against the legs until you stand tall. Lower by pushing the hips back first. The back stays flat from start to finish.',
    'bicep-curl':
        'Stand tall with the elbows by your sides and the palms facing forward. Curl the weight up without letting the elbows drift forward, then lower slowly until the arms are completely straight. Do not swing the torso.',
    'hammer-curl':
        'Hold the dumbbells with the palms facing each other and keep that grip throughout. Curl up with the elbows pinned to your sides, then lower slowly to straight arms. No swinging.',
    'incline-dumbbell-curl':
        'Lie back on a bench set to 45 to 60 degrees and let the arms hang straight down behind the body, so the biceps start fully stretched. Curl up while turning the palms to the ceiling, keeping the elbows pointing at the floor, then lower slowly all the way to straight arms. Do not let the shoulders roll forward.',
    'cross-body-hammer-curl':
        'Hold the dumbbells with the palms facing your sides. Curl one dumbbell across the body towards the opposite side of the chest, keeping the thumb up and the elbow close to the ribs, then lower slowly to a straight arm. Alternate arms without swinging.',
    'preacher-curl':
        'Rest the back of one upper arm flat on the preacher pad with the armpit against its top edge. Lower the dumbbell slowly until the arm is almost straight and the biceps is stretched, then curl up without lifting the elbow or the shoulder off the pad. Stop just short of vertical so the biceps stays loaded.',
    'cable-curl':
        'Stand facing a low pulley with the elbows by your sides. Curl the handle up, squeeze briefly at the top, and lower under control to straight arms. The cable keeps tension at the bottom, so use the full range.',
    'wrist-curl':
        'Rest the forearm on a bench or your thigh with the wrist just past the edge, palm up. Let the weight roll down to the fingertips, then curl the fingers and the wrist up as far as they go. Move slowly and keep the forearm still.',
    'cable-woodchop':
        'Stand side-on to a pulley set high, feet wider than the shoulders. With the arms nearly straight, pull the handle diagonally down across the body by rotating the torso, then return under control. The hips and the back foot turn with you; the arms only guide the handle.',
    'tricep-pushdown':
        'Stand at a high pulley with the elbows pinned to your sides. Push the handle down until the arms are fully straight, then let it rise until the forearms pass horizontal. Only the forearms move; do not lean over the weight.',
    'overhead-tricep-extension':
        'With the upper arms beside the head and pointing up, lower the weight behind the head until the triceps are fully stretched, then extend until the arms are straight. Keep the elbows pointing forward rather than flaring out.',
    'cross-body-tricep-extension':
        'Stand side-on to a high pulley and take the cable with the far hand, so the hand starts across the body near the opposite shoulder. Keeping the upper arm still against your side, straighten the elbow so the hand sweeps down and out to the hip on its own side. Return slowly. Only the forearm moves.',
    'katana-tricep-extension':
        'Stand side-on to a low pulley and take the cable with the far hand. Raise the elbow high so it points up and out, with the hand beside the opposite ear. Keeping the elbow where it is, straighten the arm up and out, like drawing a sword, then lower the hand back slowly for a full stretch. Use a light weight and do not let the elbow drop.',
    'dead-hang':
        'Hang from a bar with straight arms and a full grip, shoulders pulled slightly down away from the ears, body still. Hold for as long as the grip lasts and log the seconds as reps. Step down under control rather than dropping.',
    squat: 'Rest the bar on the upper back, feet about shoulder-width apart with the toes slightly out. Brace, then sit down between the hips with the knees tracking over the toes until the thighs are at least parallel to the floor. Drive up with the chest and hips rising together and the heels down.',
    'smith-machine-squat':
        'Stand under the bar with the feet slightly in front of it, about shoulder-width apart. Unrack, then sit down between the heels until the thighs are at least parallel to the floor, knees tracking over the toes. Drive up through the whole foot. Log the plates on one end of the bar.',
    'bulgarian-split-squat':
        'Hold a dumbbell in each hand and rest the top of the back foot on a bench behind you. Lower straight down until the front thigh is about parallel to the floor and the back knee is close to it, then drive up through the front foot. Do all reps on one leg, then switch. Rest as long as you need between legs.',
    'leg-press':
        'Place the feet about shoulder-width apart on the platform. Lower until the knees are deeply bent while the lower back and hips stay flat on the pad, then press up without locking the knees hard. Never let the hips roll off the seat at the bottom.',
    'leg-extension':
        "Line the knee joint up with the machine's pivot. Extend until the legs are straight, pause for a moment, and lower slowly to a full bend. Hold the handles to keep the hips down.",
    'romanian-deadlift':
        'Start standing with the bar at the hips and the knees slightly bent. Push the hips straight back, sliding the bar down the thighs with a flat back, until the hamstrings are fully stretched, usually just below the knees. Drive the hips forward to stand. The knee bend stays almost constant.',
    'leg-curl':
        "Line the knee joint up with the machine's pivot. Curl the pad as far as it goes, pause, and lower slowly to fully straight legs. Keep the hips pressed into the pad so the lower back does not arch.",
    'hip-thrust':
        'Rest the upper back on a bench with the bar over the hip crease and the feet flat, placed so the shins are vertical at the top. Drive the hips up until the torso is level, squeezing the glutes with the chin tucked, then lower under control. Do not over-arch the lower back at the top.',
    'calf-raise':
        'Stand on the edge of a step on the balls of the feet. Lower the heels as far as they go and pause in the stretch, then rise as high as possible onto the toes. Keep the knees straight and do not bounce.',
    'cable-crunch':
        'Kneel below a high pulley holding the rope beside the head. Curl the ribs down towards the hips, rounding the spine, then return slowly to a stretched position. The hips stay still: the movement is a crunch, not a hip hinge.',
    'hanging-leg-raise':
        'Hang from a bar with straight arms. Raise the legs by curling the hips up towards the ribs, then lower slowly without swinging. Bend the knees to make it easier.',
    'side-knee-raise':
        'Stand tall with the hands behind the head and the elbows wide. Lift one knee out to the side while bending the torso sideways, bringing the elbow and the knee of the same side together, then return to standing under control. Finish the reps on one side or alternate sides. Bend straight to the side, without leaning forward, and do not pull on the neck.',
    'cross-knee-raise':
        'Stand tall with the hands behind the head and the elbows wide. Lift one knee up and across the body while twisting the torso, bringing the opposite elbow down to meet it, then return to standing and repeat on the other side. Turn from the ribs, not just the elbow, keep the standing leg firm and do not pull on the neck.',
    'back-extension':
        'Set the pad just below the hip crease. Lower the torso with a flat back until you feel a stretch in the hamstrings, then rise until the body forms a straight line. Do not arch past straight at the top.',
    running:
        'Run tall with relaxed shoulders, land softly under the hips rather than far out in front, and keep a pace at which you could still speak in short sentences.',
    walking:
        'Walk briskly with an upright posture and a natural arm swing. On a treadmill, raise the incline before the speed and do not hold on to the handrails.',
    cycling:
        'Set the saddle so the knee is still slightly bent at the bottom of the stroke. Keep the shoulders relaxed and pedal in smooth circles rather than stamping down.',
    elliptical:
        'Stand upright with the whole foot on the pedal and push and pull the handles lightly. Do not lean on them: the legs should carry you.',
    'rowing-machine':
        'Drive with the legs first, then swing the body back, then pull the handle to the lower ribs. Return in the reverse order: arms, body, legs. Keep the back flat throughout.',
    'stair-climber':
        'Stand upright and place the whole foot on each step. Rest the hands on the rails for balance only: leaning on them takes the work off the legs.',
    'jump-rope':
        'Jump just high enough to clear the rope, landing softly on the balls of the feet. Keep the elbows close to the body and turn the rope with the wrists.',
    treadmill:
        'Run or walk tall in the middle of the belt, looking ahead rather than at your feet. Raise the incline before the speed, and let go of the handrails: holding on takes the work off the legs and makes the numbers on the display flatter than they are.',
    sauna: 'Sit or lie on a towel and breathe calmly. Drink water before and after, cool down between rounds, and leave as soon as you feel dizzy or unwell.',
    swimming:
        'Keep the body long and level in the water, breathe out under water and in to the side, and hold a steady pace you can keep up for the whole session.',
};
