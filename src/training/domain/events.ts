import { DomainEvent, EventId } from "@shared/events";
import { ExerciseId } from "@catalog/domain/exercise";

export type SetPerformedId = EventId & { readonly _brand: 'SetPerformedId' };

export function setPerformedId(value: string) {
    return value as SetPerformedId;
}

export interface SetPerformed extends DomainEvent<'SetPerformed', SetPerformedId> {
    exerciseId: ExerciseId;
    reps: number;
    weight: number;
}

export function isSetPerformed(e: DomainEvent<string>): e is SetPerformed {
    return e.type === 'SetPerformed';
}

export function setPerformed(exerciseId: ExerciseId, reps: number, weight: number): SetPerformed {
    return {
        id: setPerformedId(crypto.randomUUID()),
        type: 'SetPerformed',
        occurredAt: new Date().toISOString(),
        exerciseId: exerciseId,
        reps: reps,
        weight: weight
    };
}

export interface SetVoided extends DomainEvent<'SetVoided'> {
    voidedSetId: SetPerformedId;
}

export function isSetVoided(e: DomainEvent<string>): e is SetVoided {
    return e.type === 'SetVoided';
}

export type TrainingEvent = SetPerformed | SetVoided;
