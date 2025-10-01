import { Injectable } from '@angular/core';
import { Set } from './set/set.component';
import { Observable } from 'rxjs';
import { Rep } from './rep/rep.component';
import { HttpClient } from '@angular/common/http';
import { config } from '../config';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private exercisesUri = `${config.apiUri}/api/exercises`;
    constructor(private http: HttpClient) {}

    getAllExercises(): Observable<string[]> {
        return this.http.get<string[]>(this.exercisesUri);
    }

    getAllForExercise(exercise: string): Observable<Set[]> {
        return this.http.get<Set[]>(`${this.exercisesUri}/${exercise}/sets`);
    }

    completeSet(exercise: string, rep: RepsData): Observable<Set> {
        console.log('Sending: ' + this.exercisesUri + '/' + exercise + '/sets - ' + rep);
        return this.http.post<Set>(`${this.exercisesUri}/${exercise}/sets`, rep);
    }
}

interface RepsData {
    reps: string;
}
