export type Profile = {name:string;onboarded:boolean;units:'kg'|'lb';theme:'dark'|'light'|'system';experience:string;goal:string;height:number;weight:number;frequency:number;equipment:string;duration:number;muscles:string;bodyFat:number;notifications:boolean;rest:number;increment:number;repMin:number;repMax:number;calories:number;protein:number;carbs:number;fat:number};
export type Workout = {id:string;name:string;status:'active'|'paused'|'completed';startedAt:number;finishedAt:number|null;pausedAt:number|null;pausedMs:number;notes:string;templateId:string|null;updatedAt:number};
export type WorkoutExercise = {id:string;workoutId:string;exerciseId:string;position:number;notes:string;rest:number;groupId:string};
export type WorkoutSet = {id:string;exerciseRowId:string;position:number;weight:number;reps:number;duration:number;distance:number;rpe:number|null;rir:number|null;kind:'warmup'|'working'|'drop'|'failure';completed:boolean;rest:number;tempo:string;notes:string;side:'both'|'left'|'right'};
export type Exercise = {id:string;name:string;muscle:string;secondary:string[];equipment:string;pattern:string;difficulty:string;instructions:string[];mistakes:string;safety:string;category:'strength'|'duration'|'distance';unilateral:boolean;tracking:string[]};
export type Prescription = {exerciseId:string;sets:number;reps:number;weight:number;rest:number};
export type Template = {id:string;name:string;notes:string;exercises:Prescription[];updatedAt:number};
export type JournalKind = 'measurement'|'nutrition'|'recovery'|'goal'|'food'|'schedule'|'program';
export type Journal = {id:string;kind:JournalKind;date:string;data:Record<string,string|number|boolean>;createdAt:number;updatedAt:number};
export type Outbox = {id:string;kind:string;payload:string;revision:number;attempts:number;nextAttempt:number;deleted:number};
export const defaults:Profile={name:'Athlete',onboarded:false,units:'kg',theme:'dark',experience:'Beginner',goal:'Build strength',height:0,weight:0,frequency:3,equipment:'Barbell, dumbbells, bodyweight',duration:45,muscles:'Full body',bodyFat:0,notifications:false,rest:90,increment:2.5,repMin:8,repMax:12,calories:2000,protein:150,carbs:200,fat:65};
export function id(){return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;}
export function localDate(time=Date.now()){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
