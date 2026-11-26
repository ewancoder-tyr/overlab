import {
    describeBout,
    describeCardio,
    describeCardioRecord,
    describeComparison,
    describeGoal,
    describeTarget,
    formatDistance,
    formatDuration,
} from './cardio-wording';

describe('cardio wording', () => {
    it('names a record with the number it is about, in either language', () => {
        const run = { distanceMeters: 5500, durationSeconds: 1500 };

        expect(describeCardioRecord('en', 'distance', run)).toBe('Distance record: 5.5 km');
        expect(describeCardioRecord('ru', 'speed', run)).toBe('Рекорд скорости: 13,2 км/ч');
        expect(
            describeCardioRecord('en', 'burn-rate', { durationSeconds: 1200, calories: 240 }),
        ).toBe('Burn rate record: 12.0 kcal/min');
    });

    it('writes distances in metres below a kilometre and in kilometres above', () => {
        expect(formatDistance('en', 800)).toBe('800 m');
        expect(formatDistance('en', 5000)).toBe('5 km');
        expect(formatDistance('en', 5230)).toBe('5.23 km');
        expect(formatDistance('en', 10500)).toBe('10.5 km');
    });

    it('writes times as minutes and seconds, with hours from an hour up', () => {
        expect(formatDuration(45)).toBe('0:45');
        expect(formatDuration(1880)).toBe('31:20');
        expect(formatDuration(3900)).toBe('1:05:00');
    });

    it('describes a session with its derived speed, skipping what was not tracked', () => {
        expect(
            describeCardio('en', { distanceMeters: 5000, durationSeconds: 1800, calories: 412 }),
        ).toBe('5 km · 30:00 · 10.0 km/h · 412 kcal');
        expect(describeCardio('en', { durationSeconds: 1800 })).toBe('30:00');
    });

    it('words a trade with "but" and everything else with a comma', () => {
        expect(
            describeComparison('en', {
                outcome: 'mixed',
                axes: [
                    { axis: 'distance', direction: 'up' },
                    { axis: 'speed', direction: 'down' },
                ],
            }),
        ).toBe('farther but slower');
        expect(
            describeComparison('en', {
                outcome: 'up',
                axes: [
                    { axis: 'distance', direction: 'up' },
                    { axis: 'speed', direction: 'same' },
                ],
            }),
        ).toBe('farther, same speed');
    });

    it('speaks Russian with Russian units and a decimal comma', () => {
        expect(formatDistance('ru', 5230)).toBe('5,23 км');
        expect(describeCardio('ru', { distanceMeters: 5000, durationSeconds: 1800 })).toBe(
            '5 км · 30:00 · 10,0 км/ч',
        );
        expect(
            describeComparison('ru', {
                outcome: 'mixed',
                axes: [
                    { axis: 'distance', direction: 'up' },
                    { axis: 'speed', direction: 'down' },
                ],
            }),
        ).toBe('дальше, но медленнее');
    });

    it('states the goal as the numbers to match, from what last time recorded', () => {
        expect(describeGoal('en', { distanceMeters: 5000, durationSeconds: 1800 })).toBe(
            'Match it: at least 5 km at 10.0 km/h or faster.',
        );
        expect(describeGoal('en', { distanceMeters: 5000 })).toBe('Match it: at least 5 km.');
        expect(describeGoal('en', { durationSeconds: 1200, calories: 240 })).toBe(
            'Match it: at least 240 kcal at 12.0 kcal/min or faster.',
        );
        expect(describeGoal('en', { durationSeconds: 1500 })).toBe('Match it: at least 25:00.');
        expect(describeGoal('en', { calories: 300 })).toBe('Match it: at least 300 kcal.');
        expect(describeGoal('ru', { distanceMeters: 5000, durationSeconds: 1800 })).toBe(
            'Повторите: не меньше 5 км, не медленнее 10,0 км/ч.',
        );
    });

    it('words the session to match for a reminder, an amount with its time', () => {
        expect(describeTarget('en', { distanceMeters: 5000, durationSeconds: 1800 })).toBe(
            '5 km in 30:00',
        );
        expect(describeTarget('ru', { calories: 200, durationSeconds: 1200 })).toBe(
            '200 ккал за 20:00',
        );
        expect(describeTarget('en', { durationSeconds: 1500 })).toBe('25:00');
        expect(describeTarget('en', { distanceMeters: 800 })).toBe('800 m');
        expect(describeTarget('en', {})).toBeUndefined();
    });

    it('words a treadmill session with its climb, and a flat one without', () => {
        const hilly = { distanceMeters: 5000, durationSeconds: 1800, climbMeters: 152.5 };

        expect(describeCardio('en', hilly)).toBe('5 km · 30:00 · 10.0 km/h · 153 m climb');
        expect(describeCardio('ru', hilly)).toBe('5 км · 30:00 · 10,0 км/ч · набор 153 м');
        expect(describeCardio('en', { ...hilly, climbMeters: 0 })).toBe('5 km · 30:00 · 10.0 km/h');
    });

    it('words one segment with the incline that was set, not its climb', () => {
        const segment = { distance: { value: 1200, unit: 'm' as const }, durationSeconds: 600 };

        expect(describeBout('en', { ...segment, incline: 6.5 })).toBe(
            '1.2 km · 10:00 · 7.2 km/h · 6.5%',
        );
        expect(describeBout('ru', { ...segment, incline: 6.5 })).toBe(
            '1,2 км · 10:00 · 7,2 км/ч · 6,5%',
        );
        expect(describeBout('en', { ...segment, incline: 0 })).toBe('1.2 km · 10:00 · 7.2 km/h');
    });

    it('asks a treadmill session to match the climb too', () => {
        expect(
            describeGoal('en', { distanceMeters: 5000, durationSeconds: 1800, climbMeters: 100 }),
        ).toBe('Match it: at least 5 km at 10.0 km/h or faster. Climb 100 m or more.');
    });

    it('words a three-way trade with what held up first and what gave way last', () => {
        expect(
            describeComparison('en', {
                outcome: 'mixed',
                axes: [
                    { axis: 'distance', direction: 'up' },
                    { axis: 'speed', direction: 'down' },
                    { axis: 'climb', direction: 'up' },
                ],
            }),
        ).toBe('farther, more climb but slower');
    });
});
